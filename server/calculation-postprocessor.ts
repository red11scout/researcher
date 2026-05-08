// server/calculation-postprocessor.ts
// Post-processes AI-generated analysis to ensure all calculations are deterministic and accurate

import {
  calculateTotalAnnualValue,
  calculatePriorityScore,
  calculateValuePerMillionTokens,
  getPriorityTier,
  getRecommendedPhase,
  formatMoney,
  formatHours,
  calculateFrictionSeverity,
  crossValidateUseCases,
  calculateFrictionRecovery,
  generateThreeScenarioSummary,
  calculateMultiYearProjection,
} from "../src/calc/formulas.js";
import { runCfoRealityCheck } from "../src/calc/cfoRealityCheck.js";
import {
  applyPortfolioCashflowGuardrail,
  PORTFOLIO_BOUNDS,
  calculateReadinessScore,
  normalizeValuesToScale,
  normalizeValueToScale,
  calculateTTVBubbleScore,
  calculateNewPriorityScore,
  getNewPriorityTier,
  getNewRecommendedPhase,
  DEFAULT_MULTIPLIERS,
  INPUT_BOUNDS,
  validateInputs,
} from "../src/calc/formulas";

import {
  hfCalculateCostBenefit,
  hfCalculateRevenueBenefit,
  hfCalculateCashFlowBenefit,
  hfCalculateRiskBenefit,
  hfCalculateFrictionCost,
  hfCalculateTokenCost,
} from '../src/calc/hyperformulaEngine';

import { estimateFromUseCaseRecord } from '../src/calc/tokenEstimator';
import { computeRealismFlags, type RealismFlag } from '../src/calc/realismGates';
import {
  gateBenefitsByClass,
  readDeclaredClasses,
} from '../src/calc/useCaseClassification';
import {
  validateRiskAnchoring,
  readRiskAnchorFromRecord,
} from '../src/calc/riskAnchoring';
import { validateBenchmarkCitations } from '../src/calc/benchmarksRegistry';

import {
  normalizeFunctionName,
  normalizeSubFunction,
  normalizeAIPrimitive,
  annotateFormula,
  verifyFunctionConsistency,
  reorderColumns,
} from "../shared/taxonomy";

import { verifyAndNormalizeRoles, STANDARDIZED_BENEFITS_LOADING } from '../shared/standardizedRoles';
import { resolvePatternName } from '../shared/schema';
import { getPatternById } from '../shared/agenticPatterns';
import {
  VRM_SCHEMA_VERSION,
  VRM_PRIOR_SCHEMA_VERSION,
  VRM_PRIOR_SCHEMA_VERSION_V21,
  VRM_RUBRIC_VERSION,
  SECTOR_PRESETS,
  BASELINE_WEIGHTS,
  getWeightsForPreset,
  computeWeightedReadiness,
  assignPortfolioQuadrants,
  assignPortfolioQuadrantsV21,
  computePortfolioDiagnostic,
  assignClassificationsV22,
  computePortfolioDiagnosticV22,
  classificationLabelV22,
  QUADRANT_CUT,
  LEAD_TIER_CUT,
  MIN_PROTOTYPING_CANDIDATES,
  resolveEngagementConfig,
  normalizeValueScores,
  VALUE_NORMALIZATION_VERSION,
  DEFAULT_ENGAGEMENT_CONFIG,
  QUADRANT_LABELS,
  type SectorPreset,
  type UseCaseScoring,
  type UseCaseScoringV21,
  type EngagementConfig,
  type PortfolioWarning,
} from '../shared/vrm-v2';

// ============================================================================
// PER-USE-CASE CAPS — REMOVED: All calculations are now fully deterministic
// with no artificial caps. Portfolio-level validation is advisory only.
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// STEP 3 CROSS-REFERENCE: Build lookup of actual hours by friction point
// ============================================================================
interface FrictionHoursLookup {
  frictionPoint: string;
  actualHours: number;
  loadedHourlyRate: number;
}

function buildFrictionHoursLookup(step3Data: Step3Record[]): Map<string, FrictionHoursLookup> {
  const lookup = new Map<string, FrictionHoursLookup>();
  for (const record of step3Data) {
    const fp = record["Friction Point"] || "";
    const hours = typeof record["Annual Hours"] === "number"
      ? record["Annual Hours"]
      : parseFloat(String(record["Annual Hours"] || "0").replace(/,/g, "")) || 0;
    const rate = typeof record["Hourly Rate"] === "number"
      ? record["Hourly Rate"]
      : parseFloat(String(record["Hourly Rate"] || DEFAULT_MULTIPLIERS.loadedHourlyRate).replace(/[$,]/g, "")) || DEFAULT_MULTIPLIERS.loadedHourlyRate;
    if (fp && hours > 0) {
      lookup.set(fp, { frictionPoint: fp, actualHours: hours, loadedHourlyRate: rate });
    }
  }
  return lookup;
}

/**
 * Cross-reference parsed cost hours against Step 3 friction data.
 * If the AI hallucinated a wildly inflated number (e.g. 420M instead of 28K),
 * use the Step 3 actual hours as ground truth.
 */
function validateCostHoursAgainstStep3(
  parsedHours: number,
  useCaseId: string,
  step4Data: Step4Record[] | null,
  frictionLookup: Map<string, FrictionHoursLookup>,
  totalStep3Hours: number,
): { correctedHours: number; warning: string | null } {
  // If parsedHours is within reasonable bounds (< 500K), trust it
  if (parsedHours <= INPUT_BOUNDS.hoursSaved.max) {
    return { correctedHours: parsedHours, warning: null };
  }

  // Try to find matching Step 3 friction point via Step 4 link
  if (step4Data) {
    const step4Record = step4Data.find(r => r.ID === useCaseId);
    const targetFriction = step4Record?.["Target Friction"] || "";
    const frictionData = frictionLookup.get(targetFriction);
    if (frictionData && frictionData.actualHours > 0) {
      const warning = `[SANITY CHECK] ${useCaseId}: AI formula claimed ${parsedHours.toLocaleString()} hours, but Step 3 friction data shows ${frictionData.actualHours.toLocaleString()} hours for "${targetFriction.substring(0, 50)}...". Using Step 3 value.`;
      console.warn(warning);
      return { correctedHours: frictionData.actualHours, warning };
    }
  }

  // Fallback: If no Step 3 match, cap at a reasonable fraction of total Step 3 hours
  // No single use case should consume more than total friction hours
  const cappedHours = Math.min(parsedHours, totalStep3Hours, INPUT_BOUNDS.hoursSaved.max);
  const warning = `[SANITY CHECK] ${useCaseId}: AI formula claimed ${parsedHours.toLocaleString()} hours, capped to ${cappedHours.toLocaleString()} (max of Step 3 total ${totalStep3Hours.toLocaleString()} or INPUT_BOUNDS max ${INPUT_BOUNDS.hoursSaved.max.toLocaleString()}).`;
  console.warn(warning);
  return { correctedHours: cappedHours, warning };
}

interface Step0Record {
  "Annual Revenue ($)"?: string;
  "Total Employees"?: number | string;
}

interface Step3Record {
  Function: string;
  "Sub-Function": string;
  "Friction Point": string;
  Severity?: string;
  "Primary Driver Impact"?: string;
  "Estimated Annual Cost ($)"?: string;
  "Annual Hours"?: number | string;
  "Hourly Rate"?: number | string;
  "Loaded Hourly Rate"?: number | string;
  "Role"?: string;
  "Role ID"?: string;
  "Cost Formula"?: string;
  "Target Friction"?: string; // Link to Step 4
}

interface Step4Record {
  ID: string;
  "Use Case": string;
  "Target Friction"?: string;
  "Primary Pattern"?: string;
  "Alternative Pattern"?: string;
  "Agentic Pattern"?: string;
  "EPOCH Flags"?: string;
}

interface Step5Record {
  ID: string;
  "Use Case": string;
  "Revenue Benefit ($)"?: string;
  "Revenue Formula"?: string;
  "Revenue Formula Labels"?: any;
  "Cost Benefit ($)"?: string;
  "Cost Formula"?: string;
  "Cost Formula Labels"?: any;
  "Cash Flow Benefit ($)"?: string;
  "Cash Flow Formula"?: string;
  "Cash Flow Formula Labels"?: any;
  "Risk Benefit ($)"?: string;
  "Risk Formula"?: string;
  "Risk Formula Labels"?: any;
  "Total Annual Value ($)"?: string;
  "Probability of Success"?: number;
  "Strategic Theme"?: string;
  [key: string]: any;
}

interface Step6Record {
  ID: string;
  "Use Case": string;
  // NEW 4-component system (1-10 scale)
  "Organizational Capacity"?: number;
  "Data Availability & Quality"?: number;
  "Technical Infrastructure"?: number;
  "Governance"?: number;
  "Feasibility Score"?: number;
  // Legacy fields (1-5 scale) — backward compatible
  "Data Readiness (1-5)"?: number;
  "Data Readiness"?: number;
  "Integration Complexity (1-5)"?: number;
  "Integration Complexity"?: number;
  "Change Mgmt (1-5)"?: number;
  "Change Mgmt"?: number;
  "Effort Score (1-5)"?: number;
  "Effort Score"?: number;
  "Time-to-Value (months)"?: number;
  "Time-to-Value"?: number;
  "Input Tokens/Run": number;
  "Output Tokens/Run": number;
  "Runs/Month": number;
  "Monthly Tokens"?: number;
  "Strategic Theme"?: string;
  [key: string]: any;
}

interface Step7Record {
  ID: string;
  "Use Case": string;
  // New scoring system (1-10 scale)
  "Priority Score"?: number;
  "Readiness Score"?: number;
  "Feasibility Score"?: number;
  "Value Score"?: number;
  "TTV Score"?: number;
  "Priority Tier"?: string;
  "Recommended Phase"?: string;
  // Legacy fields — backward compatible
  "Value Score (0-40)"?: number;
  "TTV Score (0-30)"?: number;
  "Effort Score (0-30)"?: number;
  "Priority Score (0-100)"?: number;
  "Strategic Theme"?: string;
  [key: string]: any;
}

// Parse a number from a string that may contain currency symbols, commas, M/K suffixes
function parseNumber(str: string | number | undefined): number {
  if (typeof str === "number") return str;
  if (!str) return 0;

  const cleaned = str.replace(/[$,]/g, "").trim();

  if (cleaned.endsWith("M")) {
    return parseFloat(cleaned.slice(0, -1)) * 1_000_000;
  }
  if (cleaned.endsWith("K")) {
    return parseFloat(cleaned.slice(0, -1)) * 1_000;
  }
  if (cleaned.endsWith("B")) {
    return parseFloat(cleaned.slice(0, -1)) * 1_000_000_000;
  }

  return parseFloat(cleaned) || 0;
}

// Check if a formula indicates no benefit
function isNoValue(formula: string | undefined): boolean {
  if (!formula) return true;
  const lower = formula.toLowerCase();
  return (
    lower.includes("no direct") ||
    lower.includes("no quantifiable") ||
    lower.includes("no additional") ||
    lower.includes("n/a") ||
    lower.includes("not applicable") ||
    lower === "$0" ||
    lower === "0"
  );
}

// Extract numbers from a formula string, taking ONLY the left side of =
function extractInputNumbers(formula: string): number[] {
  if (!formula || isNoValue(formula)) return [];

  // Take only the left side of = (the inputs, not the AI's calculated result)
  const formulaPart = formula.split("=")[0] || formula;

  const numbers: number[] = [];

  // Match patterns: 23,000 or 23000 or 100 or 0.85 or 15% or $100 or $2.1M
  const patterns = formulaPart.match(/[\d,]+\.?\d*[%MKB]?|\d+\.?\d*[%MKB]?/g) || [];

  for (const match of patterns) {
    let value = parseFloat(match.replace(/,/g, ""));

    if (match.endsWith("%")) {
      value = parseFloat(match.slice(0, -1)) / 100;
    } else if (match.endsWith("M")) {
      value = parseFloat(match.slice(0, -1)) * 1_000_000;
    } else if (match.endsWith("K")) {
      value = parseFloat(match.slice(0, -1)) * 1_000;
    } else if (match.endsWith("B")) {
      value = parseFloat(match.slice(0, -1)) * 1_000_000_000;
    }

    if (!isNaN(value) && value > 0) {
      numbers.push(value);
    }
  }

  return numbers;
}

// ============================================
// STRUCTURED FORMULA LABELS: Extract inputs from AI-generated structured labels
// These are preferred over raw formula string parsing for reliability
// ============================================
interface FormulaLabelsObj {
  components?: Array<{ label: string; value: number | string }>;
}

function extractFromStructuredLabels(labels: FormulaLabelsObj | string | undefined, labelMap: Record<string, string>): Record<string, number> | null {
  if (!labels) return null;

  let parsed: FormulaLabelsObj;
  if (typeof labels === 'string') {
    try { parsed = JSON.parse(labels); } catch { return null; }
  } else {
    parsed = labels;
  }

  if (!parsed.components || !Array.isArray(parsed.components)) return null;

  const sortedEntries = Object.entries(labelMap).sort((a, b) => b[0].length - a[0].length);

  const result: Record<string, number> = {};
  for (const comp of parsed.components) {
    const val = typeof comp.value === 'string' ? parseFloat(comp.value.replace(/[$,]/g, '')) : comp.value;
    if (isNaN(val)) continue;

    const lowerLabel = comp.label.toLowerCase();
    for (const [expected, key] of sortedEntries) {
      if (lowerLabel.includes(expected.toLowerCase())) {
        result[key] = val;
        break;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function parseCostFromLabels(labels: FormulaLabelsObj | string | undefined): CostInputs | null {
  const extracted = extractFromStructuredLabels(labels, {
    'hours saved': 'hoursSaved',
    'hours': 'hoursSaved',
    'loaded hourly rate': 'loadedHourlyRate',
    'hourly rate': 'loadedHourlyRate',
    'benefits loading': 'efficiencyMultiplier',
    'loading': 'efficiencyMultiplier',
    'adoption rate': 'adoptionMultiplier',
    'adoption': 'adoptionMultiplier',
    'realization': 'adoptionMultiplier',
    'data maturity': 'dataMaturityMultiplier',
    'maturity': 'dataMaturityMultiplier',
  });
  if (!extracted || !extracted.hoursSaved) return null;
  return {
    hoursSaved: clamp(extracted.hoursSaved, INPUT_BOUNDS.hoursSaved.min, INPUT_BOUNDS.hoursSaved.max),
    loadedHourlyRate: clamp(extracted.loadedHourlyRate || DEFAULT_MULTIPLIERS.loadedHourlyRate, INPUT_BOUNDS.loadedHourlyRate.min, INPUT_BOUNDS.loadedHourlyRate.max),
    efficiencyMultiplier: extracted.efficiencyMultiplier || 1.35,
    adoptionMultiplier: extracted.adoptionMultiplier || DEFAULT_MULTIPLIERS.costRealizationMultiplier,
    dataMaturityMultiplier: extracted.dataMaturityMultiplier || DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
  };
}

function parseRevenueFromLabels(labels: FormulaLabelsObj | string | undefined): RevenueInputs | null {
  const extracted = extractFromStructuredLabels(labels, {
    'uplift': 'upliftPct',
    'revenue at risk': 'baselineRevenueAtRisk',
    'pipeline': 'baselineRevenueAtRisk',
    'realization': 'revenueRealizationMultiplier',
    'data maturity': 'dataMaturityMultiplier',
    'maturity': 'dataMaturityMultiplier',
  });
  if (!extracted || !extracted.upliftPct || !extracted.baselineRevenueAtRisk) return null;
  return {
    // Pass the *raw* AI-supplied uplift through. `hfCalculateRevenueBenefit`
    // enforces the per-use-case cap (`INPUT_BOUNDS.upliftPct.max`) on the dollar
    // value, and the audit `formulaText` uses the engine's capped trace value
    // (with a "(capped from X%)" annotation) so the printed math always
    // multiplies out to the printed dollar — see Task #36.
    upliftPct: Math.max(INPUT_BOUNDS.upliftPct.min, extracted.upliftPct),
    baselineRevenueAtRisk: extracted.baselineRevenueAtRisk,
    marginPct: 1.0,
    revenueRealizationMultiplier: extracted.revenueRealizationMultiplier || DEFAULT_MULTIPLIERS.revenueRealizationMultiplier,
    dataMaturityMultiplier: extracted.dataMaturityMultiplier || DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
  };
}

function parseCashFlowFromLabels(labels: FormulaLabelsObj | string | undefined): CashFlowInputs | null {
  const extracted = extractFromStructuredLabels(labels, {
    'annual revenue': 'annualRevenue',
    'revenue': 'annualRevenue',
    'days improved': 'daysImprovement',
    'days': 'daysImprovement',
    'cost of capital': 'costOfCapital',
    'capital': 'costOfCapital',
    'realization': 'cashFlowRealizationMultiplier',
  });
  if (!extracted || !extracted.annualRevenue || !extracted.daysImprovement) return null;
  return {
    daysImprovement: clamp(extracted.daysImprovement, INPUT_BOUNDS.daysImprovement.min, INPUT_BOUNDS.daysImprovement.max),
    annualRevenue: extracted.annualRevenue,
    costOfCapital: extracted.costOfCapital || DEFAULT_MULTIPLIERS.defaultCostOfCapital,
    cashFlowRealizationMultiplier: extracted.cashFlowRealizationMultiplier || DEFAULT_MULTIPLIERS.cashFlowRealizationMultiplier,
    dataMaturityMultiplier: DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
  };
}

function parseRiskFromLabels(labels: FormulaLabelsObj | string | undefined): RiskInputs | null {
  const extracted = extractFromStructuredLabels(labels, {
    'risk reduction': 'riskReductionPct',
    'reduction': 'riskReductionPct',
    'risk exposure': 'riskExposure',
    'exposure': 'riskExposure',
    'realization': 'riskRealizationMultiplier',
    'data maturity': 'dataMaturityMultiplier',
    'maturity': 'dataMaturityMultiplier',
  });
  if (!extracted || !extracted.riskReductionPct || !extracted.riskExposure) return null;
  const clampedRiskReduction = clamp(extracted.riskReductionPct, INPUT_BOUNDS.riskReductionPct.min, INPUT_BOUNDS.riskReductionPct.max);
  const clampedRiskExposure = clamp(extracted.riskExposure, INPUT_BOUNDS.riskExposure.min, INPUT_BOUNDS.riskExposure.max);
  return {
    probBefore: clampedRiskReduction,
    impactBefore: clampedRiskExposure,
    probAfter: 1.0 - clampedRiskReduction,
    impactAfter: clampedRiskExposure,
    riskRealizationMultiplier: extracted.riskRealizationMultiplier || DEFAULT_MULTIPLIERS.riskRealizationMultiplier,
    dataMaturityMultiplier: extracted.dataMaturityMultiplier || DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
  };
}

// Categorize numbers into formula inputs based on typical ranges
interface CostInputs {
  hoursSaved: number;
  loadedHourlyRate: number;
  efficiencyMultiplier: number;
  adoptionMultiplier: number;
  dataMaturityMultiplier: number;
}

function parseCostFormulaInputs(formula: string): CostInputs | null {
  const numbers = extractInputNumbers(formula);
  if (numbers.length < 2) return null;

  // Default multipliers from spec
  let hoursSaved = 0;
  let loadedHourlyRate = DEFAULT_MULTIPLIERS.loadedHourlyRate;
  let efficiencyMultiplier = DEFAULT_MULTIPLIERS.costRealizationMultiplier;
  let adoptionMultiplier = DEFAULT_MULTIPLIERS.costRealizationMultiplier;
  let dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier;

  const decimals: number[] = [];
  const largeNumbers: number[] = [];

  for (const num of numbers) {
    if (num > 0 && num <= 1) {
      decimals.push(num);
    } else if (num >= 1000) {
      largeNumbers.push(num);
    } else if (num >= 50 && num <= 500) {
      // Likely hourly rate
      loadedHourlyRate = num;
    }
  }

  // First large number is typically hours saved
  if (largeNumbers.length > 0) {
    hoursSaved = largeNumbers[0];
  }

  // Assign decimals to multipliers in order (efficiency, realization/adoption, data maturity)
  // The formula shows: hours × rate × savings% × 0.90 × 0.75
  // Where savings% is the efficiency, 0.90 is cost realization, 0.75 is data maturity
  if (decimals.length >= 1) efficiencyMultiplier = decimals[0];
  if (decimals.length >= 2) adoptionMultiplier = decimals[1]; // This is actually cost realization (0.90)
  if (decimals.length >= 3) dataMaturityMultiplier = decimals[2];

  if (hoursSaved === 0) return null;

  return {
    hoursSaved: clamp(hoursSaved, INPUT_BOUNDS.hoursSaved.min, INPUT_BOUNDS.hoursSaved.max),
    loadedHourlyRate: clamp(loadedHourlyRate, INPUT_BOUNDS.loadedHourlyRate.min, INPUT_BOUNDS.loadedHourlyRate.max),
    efficiencyMultiplier,
    adoptionMultiplier,
    dataMaturityMultiplier,
  };
}

// Recalculate cost benefit using deterministic formula WITH Step 3 cross-reference
function recalculateCostBenefit(
  formula: string,
  useCaseId?: string,
  step4Data?: Step4Record[] | null,
  frictionLookup?: Map<string, FrictionHoursLookup>,
  totalStep3Hours?: number,
): { value: number; formulaText: string; warnings: string[] } {
  const warnings: string[] = [];

  if (isNoValue(formula)) {
    return { value: 0, formulaText: "No direct cost reduction", warnings };
  }

  const inputs = parseCostFormulaInputs(formula);

  if (!inputs) {
    console.log(`[recalculateCostBenefit] Could not parse inputs from: ${formula}`);
    return { value: 0, formulaText: formula, warnings };
  }

  // CRITICAL FIX: Cross-reference parsed hours against Step 3 friction data
  let correctedHours = inputs.hoursSaved;
  if (useCaseId && frictionLookup && totalStep3Hours !== undefined) {
    const validation = validateCostHoursAgainstStep3(
      inputs.hoursSaved,
      useCaseId,
      step4Data || null,
      frictionLookup,
      totalStep3Hours,
    );
    correctedHours = validation.correctedHours;
    if (validation.warning) {
      warnings.push(validation.warning);
    }
  }

  const result = hfCalculateCostBenefit({
    hoursSaved: correctedHours,
    loadedHourlyRate: inputs.loadedHourlyRate,
    benefitsLoading: DEFAULT_MULTIPLIERS.benefitsLoading,
    costRealizationMultiplier: inputs.adoptionMultiplier,
    dataMaturityMultiplier: inputs.dataMaturityMultiplier,
  });

  // HyperFormula handles validation internally

  const newFormula = `${formatHours(correctedHours)} × $${inputs.loadedHourlyRate}/hr × 1.35 × ${inputs.adoptionMultiplier.toFixed(2)} × ${inputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(result.trace.output)} → ${formatMoney(result.value)} [HF]`;

  return { value: result.value, formulaText: newFormula, warnings };
}

// Parse revenue formula inputs
interface RevenueInputs {
  upliftPct: number;
  baselineRevenueAtRisk: number;
  marginPct: number;
  revenueRealizationMultiplier: number;
  dataMaturityMultiplier: number;
}

function parseRevenueFormulaInputs(formula: string): RevenueInputs | null {
  const numbers = extractInputNumbers(formula);
  if (numbers.length < 2) return null;

  let upliftPct = 0;
  let baselineRevenueAtRisk = 0;
  let marginPct = 1.0;
  let revenueRealizationMultiplier = DEFAULT_MULTIPLIERS.revenueRealizationMultiplier;
  let dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier;

  const decimals: number[] = [];
  const largeNumbers: number[] = [];

  for (const num of numbers) {
    if (num > 0 && num < 1) {
      decimals.push(num);
    } else if (num >= 1_000_000) {
      largeNumbers.push(num);
    }
  }

  // First decimal is likely the uplift percentage
  if (decimals.length >= 1) upliftPct = decimals[0];
  // Remaining decimals are multipliers
  if (decimals.length >= 2) revenueRealizationMultiplier = decimals[1];
  if (decimals.length >= 3) dataMaturityMultiplier = decimals[2];

  // Large number is the baseline revenue at risk
  if (largeNumbers.length > 0) baselineRevenueAtRisk = largeNumbers[0];

  if (upliftPct === 0 || baselineRevenueAtRisk === 0) return null;

  return {
    // Pass the *raw* parsed uplift through. `hfCalculateRevenueBenefit` enforces
    // the per-use-case cap (`INPUT_BOUNDS.upliftPct.max`) on the dollar value,
    // and the audit `formulaText` uses the engine's capped trace value (with a
    // "(capped from X%)" annotation) so the printed math always multiplies out
    // to the printed dollar — see Task #36.
    upliftPct: Math.max(INPUT_BOUNDS.upliftPct.min, upliftPct),
    baselineRevenueAtRisk,
    marginPct,
    revenueRealizationMultiplier,
    dataMaturityMultiplier,
  };
}

function recalculateRevenueBenefit(formula: string, id?: string): { value: number; formulaText: string; warnings: string[]; engineCapped: boolean } {
  const warnings: string[] = [];

  if (isNoValue(formula)) {
    return { value: 0, formulaText: "No direct revenue impact", warnings, engineCapped: false };
  }

  const inputs = parseRevenueFormulaInputs(formula);

  if (!inputs) {
    // Cannot parse - log warning and return 0 to avoid incorrect values
    console.warn(`[recalculateRevenueBenefit] Could not parse formula, returning 0: ${formula}`);
    return { value: 0, formulaText: formula + " (could not validate)", warnings, engineCapped: false };
  }

  const result = hfCalculateRevenueBenefit(inputs);

  // HyperFormula handles validation internally

  // Audit text must show the *capped* uplift percentage so the displayed math
  // multiplies out to the displayed dollar value. The raw % the AI proposed is
  // preserved as a "(capped from X%)" annotation when capping actually binds,
  // so reviewers can still see what was overridden — Task #36.
  const cappedUpliftPct = result.trace.inputs.upliftPct as number;
  const engineCapped = inputs.upliftPct - cappedUpliftPct > 1e-9;
  const upliftPctText = formatUpliftPctForAudit(
    inputs.upliftPct,
    cappedUpliftPct,
  );
  const newFormula = `${upliftPctText} × ${formatExactMoneyForAudit(inputs.baselineRevenueAtRisk)} × ${inputs.revenueRealizationMultiplier.toFixed(2)} × ${inputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(result.trace.output)} → ${formatMoney(result.value)}`;

  // Task #52: surface the per-use-case revenue-uplift cap as a structured
  // warning so admin tooling can filter/aggregate which AI-generated reports
  // leaned on overstated uplift inputs without having to scrape the audit
  // formulaText. The audit string already annotates this inline (Task #36),
  // but the warnings array is what the Validation Summary (`details`) carries
  // for downstream reviewers.
  if (engineCapped) {
    warnings.push(formatRevenueUpliftCapWarning(id, inputs.upliftPct, cappedUpliftPct));
  }

  return { value: result.value, formulaText: newFormula, warnings, engineCapped };
}

// Parse cash flow formula inputs
interface CashFlowInputs {
  daysImprovement: number;
  annualRevenue: number;
  costOfCapital: number;
  cashFlowRealizationMultiplier: number;
  dataMaturityMultiplier: number;
}

function parseCashFlowFormulaInputs(formula: string): CashFlowInputs | null {
  const numbers = extractInputNumbers(formula);
  if (numbers.length < 2) return null;

  let daysImprovement = 0;
  let annualRevenue = 0;
  let costOfCapital = DEFAULT_MULTIPLIERS.defaultCostOfCapital;
  let cashFlowRealizationMultiplier = DEFAULT_MULTIPLIERS.cashFlowRealizationMultiplier;
  let dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier;

  const decimals: number[] = [];
  const smallNumbers: number[] = [];
  const largeNumbers: number[] = [];

  for (const num of numbers) {
    if (num > 0 && num < 1) {
      decimals.push(num);
    } else if (num >= 1 && num <= 365) {
      smallNumbers.push(num);
    } else if (num >= 1000) {
      largeNumbers.push(num);
    }
  }

  // First small number is days improvement
  if (smallNumbers.length > 0) daysImprovement = smallNumbers[0];
  // Large number is annual revenue
  if (largeNumbers.length > 0) annualRevenue = largeNumbers[0];
  // Decimals are multipliers
  if (decimals.length >= 1) costOfCapital = decimals[0];
  if (decimals.length >= 2) cashFlowRealizationMultiplier = decimals[1];
  if (decimals.length >= 3) dataMaturityMultiplier = decimals[2];

  if (daysImprovement === 0 || annualRevenue === 0) return null;

  return {
    daysImprovement: clamp(daysImprovement, INPUT_BOUNDS.daysImprovement.min, INPUT_BOUNDS.daysImprovement.max),
    annualRevenue,
    costOfCapital,
    cashFlowRealizationMultiplier,
    dataMaturityMultiplier,
  };
}

function recalculateCashFlowBenefit(formula: string): { value: number; formulaText: string; warnings: string[]; daysImprovement: number } {
  const warnings: string[] = [];

  if (isNoValue(formula)) {
    return { value: 0, formulaText: "No direct cash flow impact", warnings, daysImprovement: 0 };
  }

  const inputs = parseCashFlowFormulaInputs(formula);

  if (!inputs) {
    // Cannot parse - log warning and return 0 to avoid incorrect values
    console.warn(`[recalculateCashFlowBenefit] Could not parse formula, returning 0: ${formula}`);
    return { value: 0, formulaText: formula + " (could not validate)", warnings, daysImprovement: 0 };
  }

  const result = hfCalculateCashFlowBenefit({
    daysImprovement: inputs.daysImprovement,
    annualRevenue: inputs.annualRevenue,
    costOfCapital: inputs.costOfCapital,
    cashFlowRealizationMultiplier: inputs.cashFlowRealizationMultiplier,
    dataMaturityMultiplier: inputs.dataMaturityMultiplier,
  });

  // HyperFormula handles validation internally

  // Updated formula text to show correct working capital calculation
  const newFormula = `${formatExactMoneyForAudit(inputs.annualRevenue)} × (${inputs.daysImprovement} / 365) × ${inputs.costOfCapital.toFixed(2)} × ${inputs.cashFlowRealizationMultiplier.toFixed(2)} × ${inputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(result.trace.output)} → ${formatMoney(result.value)}`;

  return { value: result.value, formulaText: newFormula, warnings, daysImprovement: inputs.daysImprovement };
}

// Parse risk formula inputs
interface RiskInputs {
  probBefore: number;
  impactBefore: number;
  probAfter: number;
  impactAfter: number;
  riskRealizationMultiplier: number;
  dataMaturityMultiplier: number;
}

function parseRiskFormulaInputs(formula: string): RiskInputs | null {
  const numbers = extractInputNumbers(formula);
  if (numbers.length < 2) return null;

  // Risk formulas are more complex, often showing reduction %
  // E.g., "15% reduction × $6M exposure × 0.80 × 0.75"
  let reductionPct = 0;
  let exposure = 0;
  let riskRealizationMultiplier = DEFAULT_MULTIPLIERS.riskRealizationMultiplier;
  let dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier;

  const decimals: number[] = [];
  const largeNumbers: number[] = [];

  for (const num of numbers) {
    if (num > 0 && num < 1) {
      decimals.push(num);
    } else if (num >= 100000) {
      largeNumbers.push(num);
    }
  }

  // First decimal is likely the reduction percentage
  if (decimals.length >= 1) reductionPct = decimals[0];
  if (decimals.length >= 2) riskRealizationMultiplier = decimals[1];
  if (decimals.length >= 3) dataMaturityMultiplier = decimals[2];

  // Large number is the exposure
  if (largeNumbers.length > 0) exposure = largeNumbers[0];

  if (reductionPct === 0 || exposure === 0) return null;

  // Convert to before/after format
  return {
    probBefore: reductionPct, // Treating reduction % as risk reduction
    impactBefore: exposure,
    probAfter: 0,
    impactAfter: 0,
    riskRealizationMultiplier,
    dataMaturityMultiplier,
  };
}

function recalculateRiskBenefit(formula: string, id?: string): { value: number; formulaText: string; warnings: string[]; engineCapped: boolean } {
  const warnings: string[] = [];

  if (isNoValue(formula)) {
    return { value: 0, formulaText: "No quantifiable risk reduction", warnings, engineCapped: false };
  }

  const inputs = parseRiskFormulaInputs(formula);

  if (!inputs) {
    // Cannot parse - log warning and return 0 to avoid incorrect values
    console.warn(`[recalculateRiskBenefit] Could not parse formula, returning 0: ${formula}`);
    return { value: 0, formulaText: formula + " (could not validate)", warnings, engineCapped: false };
  }

  const result = hfCalculateRiskBenefit({
    riskReductionPct: inputs.probBefore,
    riskExposure: inputs.impactBefore,
    riskRealizationMultiplier: inputs.riskRealizationMultiplier,
    dataMaturityMultiplier: inputs.dataMaturityMultiplier,
  });

  // HyperFormula handles validation internally

  // Audit text must show the *capped* reduction percentage so the displayed
  // math multiplies out to the displayed dollar value. The raw % the AI
  // proposed is preserved as a "(capped from X%)" annotation when capping
  // actually binds, so reviewers can still see what was overridden.
  const cappedReductionPct = result.trace.inputs.riskReductionPct as number;
  const engineCapped = inputs.probBefore - cappedReductionPct > 1e-9;
  const reductionPctText = formatRiskReductionPctForAudit(
    inputs.probBefore,
    cappedReductionPct,
  );
  const newFormula = `${reductionPctText} × ${formatExactMoneyForAudit(inputs.impactBefore)} × ${inputs.riskRealizationMultiplier.toFixed(2)} × ${inputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(result.trace.output)} → ${formatMoney(result.value)}`;

  if (engineCapped) {
    warnings.push(formatRiskReductionCapWarning(id, inputs.probBefore, cappedReductionPct));
  }

  return { value: result.value, formulaText: newFormula, warnings, engineCapped };
}

/**
 * Format a fractional rate (0..1) as a percentage with adaptive precision so
 * the audit `formulaText` evaluates to the printed dollar result.
 *
 * The original formatters used `.toFixed(0)`, which collapsed any sub-1% rate
 * to "0%". On portfolios where the AI proposed conservative uplifts (e.g.
 * 0.15% revenue uplift on a $23.5B base), this produced a printed formula
 * — "0% × $23.5B × 0.95 × 0.75 = $25.1M" — that a reader could not reconcile
 * with the printed result. The engine was correct; the display was lying.
 *
 * Precision tiers chosen so that for any pct ≥ 0.001%, the printed pct
 * evaluated against the printed inputs reproduces the printed result within
 * the rounding tolerance of the result-side `formatMoney` (~0.5% on M-scale).
 */
function formatPctForAudit(pct: number): string {
  if (pct === 0) return "0%";
  const p = pct * 100;
  // Choose the *minimum* decimal places such that the rounded display
  // parses back to within 0.5% relative error of the original value. Whole
  // pcts ("5%", "8%", "20%") stay tidy; fractional pcts get just enough
  // precision to round-trip ("3.25%", "0.15%"); and a non-zero rate is
  // never silently collapsed to "0%" by the formatter.
  for (const decimals of [0, 1, 2, 3]) {
    const rounded = Number(p.toFixed(decimals));
    if (rounded === 0) continue;
    if (Math.abs(rounded - p) / p < 0.005) {
      return `${p.toFixed(decimals)}%`;
    }
  }
  return `${p.toFixed(3)}%`;
}

/**
 * Format a dollar amount as an *input* for the audit `formulaText` — full
 * precision (e.g. "$23,500,000,000") so a reader can re-evaluate the printed
 * formula and arrive at the printed result. Distinct from `formatMoney`,
 * which abbreviates to "$23.5B" for the *result* side and other UI surfaces.
 */
function formatExactMoneyForAudit(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * Format the risk-reduction percentage for the audit `formulaText` string.
 *
 * Always displays the *capped* percentage so the printed math is internally
 * consistent with the printed dollar result (Task #26). When capping binds,
 * appends a "(capped from X%)" annotation so the AI's original input is still
 * visible for review. Both percentages use the adaptive precision tiers from
 * `formatPctForAudit` so sub-1% rates never silently round to "0%".
 */
function formatRiskReductionPctForAudit(rawReductionPct: number, cappedReductionPct: number): string {
  const capped = formatPctForAudit(cappedReductionPct);
  if (rawReductionPct - cappedReductionPct > 1e-9) {
    return `${capped} (capped from ${formatPctForAudit(rawReductionPct)})`;
  }
  return capped;
}

/**
 * Format the revenue uplift percentage for the audit `formulaText` string.
 *
 * Mirrors `formatRiskReductionPctForAudit` (Task #26) for the revenue-benefit
 * branch (Task #36). Always displays the *capped* percentage so the printed
 * math is internally consistent with the printed dollar result, and appends a
 * "(capped from X%)" annotation when capping binds so the AI's original input
 * remains visible. Both percentages use the adaptive precision tiers from
 * `formatPctForAudit` so sub-1% rates never silently round to "0%".
 */
function formatUpliftPctForAudit(rawUpliftPct: number, cappedUpliftPct: number): string {
  const capped = formatPctForAudit(cappedUpliftPct);
  if (rawUpliftPct - cappedUpliftPct > 1e-9) {
    return `${capped} (capped from ${formatPctForAudit(rawUpliftPct)})`;
  }
  return capped;
}

/**
 * Format a structured per-use-case warning for the Validation Summary
 * `details` array when the HyperFormula engine binds the revenue-uplift cap
 * (`INPUT_BOUNDS.upliftPct.max`) on a single use case (Task #52).
 *
 * Mirrors the audit-string convention from `formatUpliftPctForAudit` (Task #36)
 * — same whole-number percentages, same "capped from X% to Y%" phrasing — so
 * admins comparing the two surfaces see consistent numbers. Includes the use
 * case ID when known so warnings can be filtered/aggregated by UC in admin
 * tooling without re-scraping the audit `formulaText`.
 */
function formatRevenueUpliftCapWarning(id: string | undefined, rawUpliftPct: number, cappedUpliftPct: number): string {
  const idPrefix = id ? `${id} ` : "";
  return `${idPrefix}revenue uplift capped from ${formatPctForAudit(rawUpliftPct)} to ${formatPctForAudit(cappedUpliftPct)}`;
}

/**
 * Format a structured per-use-case warning for the Validation Summary
 * `details` array when the HyperFormula engine binds the risk-reduction cap
 * (`INPUT_BOUNDS.riskReductionPct.max`) on a single use case (Task #76).
 *
 * Mirrors `formatRevenueUpliftCapWarning` (Task #52) and the audit-string
 * convention from `formatRiskReductionPctForAudit` (Task #26) — same
 * whole-number percentages, same "capped from X% to Y%" phrasing — so admins
 * comparing the two surfaces see consistent numbers. Includes the use case
 * ID when known so warnings can be filtered/aggregated by UC in admin tooling
 * without re-scraping the audit `formulaText`.
 */
function formatRiskReductionCapWarning(id: string | undefined, rawReductionPct: number, cappedReductionPct: number): string {
  const idPrefix = id ? `${id} ` : "";
  return `${idPrefix}risk reduction capped from ${formatPctForAudit(rawReductionPct)} to ${formatPctForAudit(cappedReductionPct)}`;
}

// Parse friction point cost from AI-generated text
function parseFrictionCostInputs(costText: string): { annualHours: number; loadedHourlyRate: number } | null {
  if (!costText || costText.toLowerCase().includes("no ") || costText === "$0") {
    return null;
  }

  // Try to parse from formula format: "X hours × $Y/hr"
  const hoursMatch = costText.match(/([\d,]+(?:\.\d+)?)\s*(?:hours|hrs)/i);
  const rateMatch = costText.match(/\$([\d,]+(?:\.\d+)?)\/(?:hr|hour)/i);

  if (hoursMatch && rateMatch) {
    const annualHours = parseFloat(hoursMatch[1].replace(/,/g, ""));
    const loadedHourlyRate = parseFloat(rateMatch[1].replace(/,/g, ""));
    return { annualHours, loadedHourlyRate };
  }

  // Try to extract hours and infer rate from $X format
  if (hoursMatch) {
    const annualHours = parseFloat(hoursMatch[1].replace(/,/g, ""));
    return { annualHours, loadedHourlyRate: DEFAULT_MULTIPLIERS.loadedHourlyRate };
  }

  // Try to parse from total cost and infer hours
  const costMatch = costText.match(/\$([\d,]+(?:\.\d+)?)(M|K)?/i);
  if (costMatch) {
    let totalCost = parseFloat(costMatch[1].replace(/,/g, ""));
    if (costMatch[2]?.toUpperCase() === "M") totalCost *= 1_000_000;
    if (costMatch[2]?.toUpperCase() === "K") totalCost *= 1_000;

    // Infer hours from cost at default rate
    const annualHours = totalCost / DEFAULT_MULTIPLIERS.loadedHourlyRate;
    return { annualHours, loadedHourlyRate: DEFAULT_MULTIPLIERS.loadedHourlyRate };
  }

  return null;
}

// Recalculate friction point cost using deterministic formula
// CRITICAL: Uses the role-specific loaded hourly rate from the standardized roles table,
// NOT the $150 default. The record's "Hourly Rate" field is set by verifyAndNormalizeRoles()
// which runs BEFORE this function.
function recalculateFrictionCost(record: Step3Record): {
  value: number;
  formulaText: string;
  annualHours: number;
  loadedHourlyRate: number;
  severity: string;
} {
  const costText = record["Estimated Annual Cost ($)"] || "";
  const existingHours = record["Annual Hours"];
  const existingRate = record["Hourly Rate"];
  // Also check "Loaded Hourly Rate" field (may be string like "$50/hr")
  const loadedRateField = (record as any)["Loaded Hourly Rate"];

  let annualHours: number = 0;
  let loadedHourlyRate: number = 0; // Start at 0 — will be set from role data

  // PRIORITY 1: Use the "Hourly Rate" field (set by verifyAndNormalizeRoles to the standardized rate)
  if (existingRate !== undefined && existingRate !== 0) {
    loadedHourlyRate = typeof existingRate === "number" ? existingRate : parseFloat(String(existingRate).replace(/[$,/hr]/g, "")) || 0;
  }

  // PRIORITY 2: If "Hourly Rate" was 0/missing, try "Loaded Hourly Rate" field from JSON
  if (loadedHourlyRate === 0 && loadedRateField) {
    loadedHourlyRate = typeof loadedRateField === "number" ? loadedRateField : parseFloat(String(loadedRateField).replace(/[$,/hr]/g, "")) || 0;
  }

  // PRIORITY 3: Only fall back to default if we truly have no role-specific rate
  if (loadedHourlyRate === 0) {
    console.warn(`[recalculateFrictionCost] No role-specific rate found for "${record["Friction Point"]?.substring(0, 40)}...", falling back to $${DEFAULT_MULTIPLIERS.loadedHourlyRate}/hr`);
    loadedHourlyRate = DEFAULT_MULTIPLIERS.loadedHourlyRate;
  }

  // Try to use explicit hours if available
  if (existingHours !== undefined) {
    annualHours = typeof existingHours === "number" ? existingHours : parseFloat(String(existingHours).replace(/,/g, "")) || 0;
  }

  // If no explicit hours, try to parse from the cost text
  if (annualHours === 0) {
    const parsed = parseFrictionCostInputs(costText);
    if (parsed) {
      annualHours = parsed.annualHours;
      // Do NOT override loadedHourlyRate from formula text — keep role-specific rate
    }
  }

  if (annualHours === 0) {
    console.warn(`[recalculateFrictionCost] Could not parse inputs from: ${costText}`);
    return {
      value: 0,
      formulaText: costText + " (could not validate)",
      annualHours: 0,
      loadedHourlyRate,
      severity: "Low"
    };
  }

  const result = hfCalculateFrictionCost({
    annualHours,
    loadedHourlyRate,
  });

  // Calculate severity based on the cost
  const driverImpact = record["Primary Driver Impact"]?.toLowerCase() || "";
  const severity = calculateFrictionSeverity({
    annualCost: result.value,
    affectsRevenue: driverImpact.includes("revenue") || driverImpact.includes("sales"),
    affectsCompliance: driverImpact.includes("compliance") || driverImpact.includes("regulatory") || driverImpact.includes("legal"),
    affectsCustomer: driverImpact.includes("customer") || driverImpact.includes("client"),
  });

  const formulaText = `${formatHours(annualHours)} × $${loadedHourlyRate}/hr = ${formatMoney(result.trace.output)} → ${formatMoney(result.value)}`;

  return {
    value: result.value,
    formulaText,
    annualHours,
    loadedHourlyRate,
    severity
  };
}

// Calculate token cost from Step 6 data
function calculateTokenCostFromStep6(record: Step6Record): { monthlyTokens: number; annualCost: number } {
  const runsPerMonth = record["Runs/Month"] || 0;
  const inputTokensPerRun = record["Input Tokens/Run"] || 0;
  const outputTokensPerRun = record["Output Tokens/Run"] || 0;

  const result = hfCalculateTokenCost({
    runsPerMonth,
    inputTokensPerRun,
    outputTokensPerRun,
  });

  const monthlyTokens = runsPerMonth * (inputTokensPerRun + outputTokensPerRun);

  return { monthlyTokens, annualCost: result.value };
}

// Post-process the entire analysis result
export function postProcessAnalysis(analysisResult: any): any {
  if (!analysisResult || !analysisResult.steps) {
    return analysisResult;
  }

  const steps = [...analysisResult.steps];

  // VRM v2.0 sector preset — analysisResult.vrm.sectorPreset takes precedence; fallback to baseline
  const sectorPreset: SectorPreset =
    (analysisResult.vrm?.sectorPreset && analysisResult.vrm.sectorPreset in SECTOR_PRESETS)
      ? analysisResult.vrm.sectorPreset
      : (analysisResult.sectorPreset && analysisResult.sectorPreset in SECTOR_PRESETS)
        ? analysisResult.sectorPreset
        : "baseline";

  // Find all steps
  const step0 = steps.find((s: any) => s.step === 0);
  const step3 = steps.find((s: any) => s.step === 3);
  const step4 = steps.find((s: any) => s.step === 4);
  const step5 = steps.find((s: any) => s.step === 5);
  let step6 = steps.find((s: any) => s.step === 6);
  const step7 = steps.find((s: any) => s.step === 7);

  // Extract Step 0 metadata for revenue and employee count
  // Buffer for Stage-C1 benchmark warnings raised during Step-2 normalization
  // (which runs before integrityWarnings is initialised).
  const pendingBenchmarkWarnings: Array<{
    code: string;
    severity: "info" | "warning" | "critical";
    message: string;
    recommendedAction: string;
  }> = [];

  let annualRevenueFromStep0 = 0;
  let totalEmployeesFromStep0 = 0;

  if (step0?.data) {
    const step0Data = Array.isArray(step0.data) ? step0.data[0] : step0.data;
    if (step0Data) {
      annualRevenueFromStep0 = parseNumber(step0Data["Annual Revenue ($)"]);
      totalEmployeesFromStep0 = typeof step0Data["Total Employees"] === "number"
        ? step0Data["Total Employees"]
        : parseNumber(String(step0Data["Total Employees"] || 0));
    }
  }

  // Fallback: extract revenue and employees from companyOverview if Step 0 data is empty
  if (annualRevenueFromStep0 === 0 && analysisResult.companyOverview?.annualRevenue) {
    annualRevenueFromStep0 = typeof analysisResult.companyOverview.annualRevenue === 'number'
      ? analysisResult.companyOverview.annualRevenue
      : parseNumber(String(analysisResult.companyOverview.annualRevenue));
    console.log(`[postProcessAnalysis] Revenue from companyOverview fallback: ${formatMoney(annualRevenueFromStep0)}`);
  }
  if (totalEmployeesFromStep0 === 0 && analysisResult.companyOverview?.totalEmployees) {
    totalEmployeesFromStep0 = typeof analysisResult.companyOverview.totalEmployees === 'number'
      ? analysisResult.companyOverview.totalEmployees
      : parseNumber(String(analysisResult.companyOverview.totalEmployees));
  }

  console.log(`[postProcessAnalysis] Company revenue: ${formatMoney(annualRevenueFromStep0)}, employees: ${totalEmployeesFromStep0}`);

  // ============================================
  // FUNCTION/SUB-FUNCTION NORMALIZATION (Steps 2, 3, 4)
  // MUST run BEFORE friction cost processing so role rates are standardized
  // ============================================
  const step2 = steps.find((s: any) => s.step === 2);

  // Normalize Step 2 (KPIs)
  if (step2?.data && Array.isArray(step2.data)) {
    for (const record of step2.data) {
      if (record["Function"]) {
        record["Function"] = normalizeFunctionName(record["Function"]);
      }
      if (record["Sub-Function"]) {
        record["Sub-Function"] = normalizeSubFunction(record["Function"] || "", record["Sub-Function"]);
      }
    }
    console.log(`[postProcessAnalysis] Normalized ${step2.data.length} Step 2 Function/Sub-Function values`);

    // STAGE C1 — benchmark citation gate (advisory until LLM contract updated)
    const industry =
      analysisResult?.companyOverview?.industry ??
      analysisResult?.industry ??
      "";
    const benchVal = validateBenchmarkCitations({
      industry: String(industry || ""),
      step2Records: step2.data as any[],
      hardReject: false,
    });
    for (const w of benchVal.warnings) {
      // Buffer for the integrity warning push (declared further down).
      pendingBenchmarkWarnings.push(w);
    }
  }

  // Normalize Step 3 (Friction Points) — functions, sub-functions, AND roles
  if (step3?.data && Array.isArray(step3.data)) {
    for (const record of step3.data) {
      if (record["Function"]) {
        record["Function"] = normalizeFunctionName(record["Function"]);
      }
      if (record["Sub-Function"]) {
        record["Sub-Function"] = normalizeSubFunction(record["Function"] || "", record["Sub-Function"]);
      }
    }
    console.log(`[postProcessAnalysis] Normalized ${step3.data.length} Step 3 Function/Sub-Function values`);

    // Normalize roles to standardized table — updates Hourly Rate to role-specific rate
    const roleVerification = verifyAndNormalizeRoles(step3.data, 'Function', 'Hourly Rate');
    console.log('[postProcessAnalysis] Role verification:', roleVerification.map(r =>
      `${r.frictionPoint}: ${r.originalRole || 'none'} → ${r.matchedRole} ($${r.standardizedRate}/hr) [${r.confidence}]`
    ).join('\n'));
  }

  // ============================================
  // STEP 3: FRICTION POINT PROCESSING
  // Runs AFTER role normalization so Hourly Rate reflects the actual role rate
  // ============================================
  let totalFrictionCost = 0;
  const frictionCostMap = new Map<string, number>(); // Map friction points to costs

  if (step3?.data && Array.isArray(step3.data)) {
    console.log("[postProcessAnalysis] Processing", step3.data.length, "friction points with deterministic formulas (using role-specific rates)");

    const correctedStep3Data: Step3Record[] = [];

    for (const record of step3.data as Step3Record[]) {
      const frictionResult = recalculateFrictionCost(record);
      totalFrictionCost += frictionResult.value;

      // Store friction cost by name for later linking to benefits
      const frictionPoint = record["Friction Point"] || "";
      frictionCostMap.set(frictionPoint, frictionResult.value);

      correctedStep3Data.push({
        ...record,
        "Estimated Annual Cost ($)": formatMoney(frictionResult.value),
        "Cost Formula": frictionResult.formulaText,
        "Annual Hours": Math.round(frictionResult.annualHours),
        "Hourly Rate": frictionResult.loadedHourlyRate,
        Severity: frictionResult.severity,
      });

      console.log(`[postProcessAnalysis] Friction: ${record["Friction Point"]?.substring(0, 30)}... = ${formatMoney(frictionResult.value)} (${frictionResult.severity}) [Rate: $${frictionResult.loadedHourlyRate}/hr, Role: ${record["Role"] || 'unknown'}]`);
    }

    step3.data = correctedStep3Data;
    console.log(`[postProcessAnalysis] Total Friction Cost: ${formatMoney(totalFrictionCost)}`);
  }

  // Normalize Step 4 (Use Cases) - Function/Sub-Function + AI Primitives
  if (step4?.data && Array.isArray(step4.data)) {
    for (const record of step4.data) {
      if (record["Function"]) {
        record["Function"] = normalizeFunctionName(record["Function"]);
      }
      if (record["Sub-Function"]) {
        record["Sub-Function"] = normalizeSubFunction(record["Function"] || "", record["Sub-Function"]);
      }
      if (record["AI Primitives"]) {
        record["AI Primitives"] = normalizeAIPrimitive(record["AI Primitives"]);
      }
    }
    console.log(`[postProcessAnalysis] Normalized ${step4.data.length} Step 4 Function/Sub-Function/AI Primitives values`);

    // Normalize and enrich agentic pattern fields
    for (const record of step4.data) {
      // Resolve Primary Pattern (legacy names → consolidated names)
      if (record["Primary Pattern"]) {
        record["Primary Pattern"] = resolvePatternName(record["Primary Pattern"]);
      } else {
        // Fallback: derive Primary Pattern from AI Primitives if missing
        const primitives = (record["AI Primitives"] || "").toLowerCase();
        if (primitives.includes("retrieval") || primitives.includes("research")) {
          record["Primary Pattern"] = "Tool Use";
        } else if (primitives.includes("content creation") || primitives.includes("generation")) {
          record["Primary Pattern"] = "Generator-Critic";
        } else if (primitives.includes("analysis") || primitives.includes("data")) {
          record["Primary Pattern"] = "ReAct Loop";
        } else if (primitives.includes("automation") || primitives.includes("workflow")) {
          record["Primary Pattern"] = "Orchestrator-Workers";
        } else {
          record["Primary Pattern"] = "Prompt Chaining";
        }
      }
      if (record["Alternative Pattern"]) {
        record["Alternative Pattern"] = resolvePatternName(record["Alternative Pattern"]);
      }
      // Normalize EPOCH Flags to comma-separated letter string
      const rawEpoch = record["EPOCH Flags"];
      if (rawEpoch && typeof rawEpoch === 'object' && !Array.isArray(rawEpoch)) {
        const validKeys = new Set(['E', 'P', 'O', 'C', 'H']);
        record["EPOCH Flags"] = Object.entries(rawEpoch)
          .filter(([k, v]) => validKeys.has(k.toUpperCase()) && v === true)
          .map(([k]) => k.toUpperCase())
          .join(', ');
      } else if (!rawEpoch) {
        record["EPOCH Flags"] = "";
      }

      // Derive Agentic Pattern lowercase ID from Primary Pattern
      const PATTERN_TO_ID: Record<string, string> = {
        "Reflection": "reflection",
        "Tool Use": "tool_use",
        "Planning": "planning",
        "ReAct Loop": "react",
        "Prompt Chaining": "planning",
        "Semantic Router": "planning",
        "Constitutional Guardrail": "reflection",
        "Orchestrator-Workers": "orchestrator_worker",
        "Agent Handoff": "agent_handoff",
        "Parallelization": "parallelization",
        "Generator-Critic": "generator_critic",
        "Group Chat": "group_chat",
      };
      const primaryPattern = record["Primary Pattern"] || "";
      record["Agentic Pattern"] = PATTERN_TO_ID[primaryPattern] || (record["Agentic Pattern"] || "planning");

      // Add pattern metadata for downstream consumption
      const patternSlug = primaryPattern.toLowerCase().replace(/\s+/g, '-');
      const primaryDef = getPatternById(patternSlug);
      if (primaryDef) {
        record["_patternType"] = primaryDef.type;
        record["_patternComplexity"] = primaryDef.complexity;
        record["_tokenMultiplier"] = primaryDef.tokenMultiplier;
        record["_implementationMonths"] = primaryDef.implementationMonths;
      }
    }
    console.log(`[postProcessAnalysis] Normalized ${step4.data.length} Step 4 agentic pattern fields`);
  }

  // Cross-step verification
  if (step2?.data && step3?.data && step4?.data) {
    const verification = verifyFunctionConsistency(step2.data, step3.data, step4.data);
    if (verification.warnings.length > 0) {
      console.log(`[postProcessAnalysis] Function consistency warnings:`);
      verification.warnings.forEach(w => console.log(`  - ${w}`));
    }
  }

  // ============================================
  // 1:1:1 MAPPING VALIDATION (KPIs → Frictions → Use Cases)
  // ============================================
  const mappingWarnings: string[] = [];
  if (step2?.data && step3?.data && step4?.data) {
    const kpiCount = (step2.data as any[]).length;
    const frictionCount = (step3.data as any[]).length;
    const useCaseCount = (step4.data as any[]).length;

    // Count validation
    if (kpiCount !== 10 || frictionCount !== 10 || useCaseCount !== 10) {
      mappingWarnings.push(
        `[MAPPING] Expected 10:10:10 but got KPIs=${kpiCount}, Frictions=${frictionCount}, UseCases=${useCaseCount}`
      );
    }

    // 1:1 friction-to-use-case validation
    const frictionNames = new Set((step3.data as any[]).map((r: any) => r["Friction Point"]));
    const targetFrictions = (step4.data as any[]).map((r: any) => r["Target Friction"]);
    const usedFrictions = new Set<string>();

    for (const tf of targetFrictions) {
      if (tf && !frictionNames.has(tf)) {
        mappingWarnings.push(`[MAPPING] Use case targets unknown friction: "${tf?.substring(0, 60)}..."`);
      }
      if (tf && usedFrictions.has(tf)) {
        mappingWarnings.push(`[MAPPING] Duplicate target friction: "${tf?.substring(0, 60)}..."`);
      }
      if (tf) usedFrictions.add(tf);
    }

    const unmappedFrictions = Array.from(frictionNames).filter(f => !usedFrictions.has(f));
    if (unmappedFrictions.length > 0) {
      mappingWarnings.push(
        `[MAPPING] ${unmappedFrictions.length} friction point(s) not targeted by any use case: ${unmappedFrictions.map(f => f?.substring(0, 40)).join(", ")}`
      );
    }

    if (mappingWarnings.length > 0) {
      console.log(`[postProcessAnalysis] 1:1:1 Mapping validation warnings:`);
      mappingWarnings.forEach(w => console.log(`  - ${w}`));
    } else {
      console.log(`[postProcessAnalysis] 1:1:1 Mapping validation PASSED: ${kpiCount}:${frictionCount}:${useCaseCount}`);
    }
  }

  // ============================================
  // BUILD STEP 3 FRICTION HOURS LOOKUP (for cross-referencing)
  // ============================================
  let frictionLookup = new Map<string, FrictionHoursLookup>();
  let totalStep3Hours = 0;
  if (step3?.data && Array.isArray(step3.data)) {
    frictionLookup = buildFrictionHoursLookup(step3.data as Step3Record[]);
    frictionLookup.forEach((entry) => {
      totalStep3Hours += entry.actualHours;
    });
    console.log(`[postProcessAnalysis] Built friction lookup: ${frictionLookup.size} entries, total Step 3 hours = ${totalStep3Hours.toLocaleString()}`);
  }

  // ============================================
  // STEP 5: BENEFITS QUANTIFICATION PROCESSING
  // ============================================
  if (!step5?.data || !Array.isArray(step5.data)) {
    console.log("[postProcessAnalysis] Step 5 data not found or invalid");
    return analysisResult;
  }

  console.log("[postProcessAnalysis] Processing", step5.data.length, "use cases with deterministic formulas + Step 3 cross-reference");

  // Recalculate all Step 5 benefits using deterministic formulas
  const correctedStep5Data: Step5Record[] = [];
  let totalCostBenefit = 0;
  let totalRevenueBenefit = 0;
  let totalCashFlowBenefit = 0;
  let totalRiskBenefit = 0;

  const useCaseBenefitsForValidation: Array<{
    id: string;
    costBenefit: number;
    revenueBenefit: number;
    cashFlowBenefit: number;
    riskBenefit: number;
    hoursSaved?: number;
  }> = [];

  // Per-UC cash-flow days for the portfolio-level guardrail (Task #107).
  // Even when each UC's `daysImprovement` sits inside per-UC INPUT_BOUNDS,
  // the SUM across UCs can implausibly exceed a working-capital month
  // because every UC discounts the same DSO/DPO/inventory pool. Captured
  // here, applied after the loop via `applyPortfolioCashflowGuardrail`.
  const useCaseCashFlowMeta: Array<{
    id: string;
    daysImprovement: number;
    cashFlowBenefit: number;
    indexInCorrected: number;
  }> = [];

  // Accumulate all per-use-case warnings during recalculation
  const allUseCaseWarnings: string[] = [];
  // Structured warnings (label-swap, realism, class gate, risk anchoring,
  // benchmark citations) routed to vrm.diagnostic.warnings so they render
  // in the existing MethodologyIntegrityPanel UI.
  const integrityWarnings: PortfolioWarning[] = [];
  // Drain Stage-C1 benchmark warnings buffered earlier into the same stream.
  for (const w of pendingBenchmarkWarnings) {
    integrityWarnings.push({
      severity: w.severity,
      code: w.code,
      message: w.message,
      recommendedAction: w.recommendedAction,
    });
  }
  let useCasesCapped = 0;
  let parametersClamped = 0;

  for (const record of step5.data as Step5Record[]) {
    // PRIORITY 1: Use structured formula labels (most reliable — AI provides raw inputs)
    // PRIORITY 2: Fall back to formula string parsing
    const structuredCostInputs = parseCostFromLabels(record["Cost Formula Labels"]);
    const structuredRevenueInputs = parseRevenueFromLabels(record["Revenue Formula Labels"]);
    const structuredCashFlowInputs = parseCashFlowFromLabels(record["Cash Flow Formula Labels"]);
    const structuredRiskInputs = parseRiskFromLabels(record["Risk Formula Labels"]);

    let costResult: { value: number; formulaText: string; warnings: string[] };
    let revenueResult: { value: number; formulaText: string; warnings: string[]; engineCapped: boolean };
    let cashFlowResult: { value: number; formulaText: string; warnings: string[]; daysImprovement?: number };
    let riskResult: { value: number; formulaText: string; warnings: string[]; engineCapped: boolean };

    // Track whether the HyperFormula engine bound a per-use-case cap on this
    // record. The engine caps `upliftPct` at INPUT_BOUNDS.upliftPct.max and
    // `riskReductionPct` at INPUT_BOUNDS.riskReductionPct.max inside
    // hfCalculateRevenueBenefit/hfCalculateRiskBenefit. The Validation Summary
    // log line previously only counted post-process portfolio-cap hits and
    // reported "0 UCs capped" even when the engine cap bound on every record,
    // hiding the fact that a portfolio leaned heavily on AI-overstated inputs
    // (Task #51).
    let useCaseHadEngineCap = false;

    // COST: Prefer structured labels
    if (structuredCostInputs) {
      const hfResult = hfCalculateCostBenefit({
        hoursSaved: structuredCostInputs.hoursSaved,
        loadedHourlyRate: structuredCostInputs.loadedHourlyRate,
        benefitsLoading: structuredCostInputs.efficiencyMultiplier,
        costRealizationMultiplier: structuredCostInputs.adoptionMultiplier,
        dataMaturityMultiplier: structuredCostInputs.dataMaturityMultiplier,
      });
      costResult = {
        value: hfResult.value,
        formulaText: `${formatHours(structuredCostInputs.hoursSaved)} × $${structuredCostInputs.loadedHourlyRate}/hr × ${structuredCostInputs.efficiencyMultiplier.toFixed(2)} × ${structuredCostInputs.adoptionMultiplier.toFixed(2)} × ${structuredCostInputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(hfResult.trace.output)} → ${formatMoney(hfResult.value)} [HF/labels]`,
        warnings: [],
      };
      console.log(`[postProcessAnalysis] ${record.ID}: Cost via STRUCTURED LABELS: ${formatMoney(hfResult.value)}`);
    } else {
      costResult = recalculateCostBenefit(
        record["Cost Formula"] || "",
        record.ID,
        step4?.data ? (step4.data as Step4Record[]) : null,
        frictionLookup,
        totalStep3Hours,
      );
    }

    // REVENUE: Prefer structured labels
    if (structuredRevenueInputs) {
      const hfResult = hfCalculateRevenueBenefit({
        upliftPct: structuredRevenueInputs.upliftPct,
        baselineRevenueAtRisk: structuredRevenueInputs.baselineRevenueAtRisk,
        revenueRealizationMultiplier: structuredRevenueInputs.revenueRealizationMultiplier,
        dataMaturityMultiplier: structuredRevenueInputs.dataMaturityMultiplier,
      });
      const cappedUpliftPct = hfResult.trace.inputs.upliftPct as number;
      const structuredRevenueEngineCapped =
        structuredRevenueInputs.upliftPct - cappedUpliftPct > 1e-9;
      if (structuredRevenueEngineCapped) useCaseHadEngineCap = true;
      const upliftPctText = formatUpliftPctForAudit(
        structuredRevenueInputs.upliftPct,
        cappedUpliftPct,
      );
      revenueResult = {
        value: hfResult.value,
        formulaText: `${upliftPctText} × ${formatExactMoneyForAudit(structuredRevenueInputs.baselineRevenueAtRisk)} × ${structuredRevenueInputs.revenueRealizationMultiplier.toFixed(2)} × ${structuredRevenueInputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(hfResult.trace.output)} → ${formatMoney(hfResult.value)} [HF/labels]`,
        warnings: structuredRevenueEngineCapped
          ? [formatRevenueUpliftCapWarning(record.ID, structuredRevenueInputs.upliftPct, cappedUpliftPct)]
          : [],
        engineCapped: structuredRevenueEngineCapped,
      };
      console.log(`[postProcessAnalysis] ${record.ID}: Revenue via STRUCTURED LABELS: ${formatMoney(hfResult.value)}`);
    } else {
      revenueResult = recalculateRevenueBenefit(record["Revenue Formula"] || "", record.ID);
      if (revenueResult.engineCapped) useCaseHadEngineCap = true;
    }

    // CASH FLOW: Prefer structured labels — but guard against label swap.
    //
    // The LLM occasionally puts "Revenue at Risk" (e.g. $14M) into the
    // "Annual Revenue" slot of the cash-flow formula labels. The math then
    // looks plausible but is calculated against the wrong base. We detect
    // this by comparing the LLM-supplied annualRevenue against the Step-0
    // company revenue: if it is below 50% of the company total (and Step-0
    // revenue is known), we reject the structured inputs and fall back to
    // the derived path (which always uses the canonical Step-0 revenue).
    const cashFlowLabelSwap =
      structuredCashFlowInputs &&
      annualRevenueFromStep0 > 0 &&
      structuredCashFlowInputs.annualRevenue < annualRevenueFromStep0 * 0.5;

    if (structuredCashFlowInputs && !cashFlowLabelSwap) {
      const hfResult = hfCalculateCashFlowBenefit({
        annualRevenue: structuredCashFlowInputs.annualRevenue,
        daysImprovement: structuredCashFlowInputs.daysImprovement,
        costOfCapital: structuredCashFlowInputs.costOfCapital,
        cashFlowRealizationMultiplier: structuredCashFlowInputs.cashFlowRealizationMultiplier,
        dataMaturityMultiplier: structuredCashFlowInputs.dataMaturityMultiplier,
      });
      cashFlowResult = {
        value: hfResult.value,
        formulaText: `${formatExactMoneyForAudit(structuredCashFlowInputs.annualRevenue)} × (${structuredCashFlowInputs.daysImprovement}/365) × ${structuredCashFlowInputs.costOfCapital.toFixed(2)} × ${structuredCashFlowInputs.cashFlowRealizationMultiplier.toFixed(2)} × ${structuredCashFlowInputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(hfResult.trace.output)} → ${formatMoney(hfResult.value)} [HF/labels]`,
        warnings: [],
        daysImprovement: structuredCashFlowInputs.daysImprovement,
      };
      console.log(`[postProcessAnalysis] ${record.ID}: CashFlow via STRUCTURED LABELS: ${formatMoney(hfResult.value)}`);
    } else if (cashFlowLabelSwap) {
      const id = record.ID || "UC";
      console.warn(
        `[postProcessAnalysis] ${id}: LABEL_SWAP_DETECTED structuredAnnualRevenue=${formatMoney(structuredCashFlowInputs!.annualRevenue)} vs step0Revenue=${formatMoney(annualRevenueFromStep0)}; ignoring structured cash-flow inputs and falling back to Step-3 derivation`,
      );
      // Push a structured warning so the methodology integrity panel renders it.
      integrityWarnings.push({
        severity: "warning",
        code: "LABEL_SWAP_DETECTED",
        message: `${id} cash-flow "Annual Revenue" of ${formatMoney(structuredCashFlowInputs!.annualRevenue)} is below 50% of company revenue (${formatMoney(annualRevenueFromStep0)}); the structured input was rejected and the value was re-derived from Step 3.`,
        recommendedAction:
          "Review the LLM cash-flow formula labels for this use case — the 'Annual Revenue' slot is being populated with a sub-segment figure (often Revenue at Risk) instead of the company total.",
      });
      // Force fallthrough to the Step-3-driven derived path below by setting
      // the recalculated value to 0; the existing derivation block then fires.
      cashFlowResult = {
        value: 0,
        formulaText: "",
        warnings: [
          `${id} cash flow label swap detected: structured "Annual Revenue" of ${formatMoney(structuredCashFlowInputs!.annualRevenue)} is below 50% of company revenue (${formatMoney(annualRevenueFromStep0)}); ignoring structured inputs and deriving from Step 3 driver impact.`,
        ],
        daysImprovement: 0,
      };
    } else {
      cashFlowResult = recalculateCashFlowBenefit(record["Cash Flow Formula"] || "");
    }

    // RISK: Prefer structured labels
    if (structuredRiskInputs) {
      const hfResult = hfCalculateRiskBenefit({
        riskReductionPct: structuredRiskInputs.probBefore,
        riskExposure: structuredRiskInputs.impactBefore,
        riskRealizationMultiplier: structuredRiskInputs.riskRealizationMultiplier,
        dataMaturityMultiplier: structuredRiskInputs.dataMaturityMultiplier,
      });
      const cappedReductionPct = hfResult.trace.inputs.riskReductionPct as number;
      const structuredRiskEngineCapped =
        structuredRiskInputs.probBefore - cappedReductionPct > 1e-9;
      if (structuredRiskEngineCapped) useCaseHadEngineCap = true;
      const reductionPctText = formatRiskReductionPctForAudit(
        structuredRiskInputs.probBefore,
        cappedReductionPct,
      );
      riskResult = {
        value: hfResult.value,
        formulaText: `${reductionPctText} × ${formatExactMoneyForAudit(structuredRiskInputs.impactBefore)} × ${structuredRiskInputs.riskRealizationMultiplier.toFixed(2)} × ${structuredRiskInputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(hfResult.trace.output)} → ${formatMoney(hfResult.value)} [HF/labels]`,
        warnings: structuredRiskEngineCapped
          ? [formatRiskReductionCapWarning(record.ID, structuredRiskInputs.probBefore, cappedReductionPct)]
          : [],
        engineCapped: structuredRiskEngineCapped,
      };
      console.log(`[postProcessAnalysis] ${record.ID}: Risk via STRUCTURED LABELS: ${formatMoney(hfResult.value)}`);
    } else {
      riskResult = recalculateRiskBenefit(record["Risk Formula"] || "", record.ID);
      if (riskResult.engineCapped) useCaseHadEngineCap = true;
    }

    // DERIVE MISSING BENEFITS FROM STEP 3 FRICTION DATA
    // When AI returns "No direct X impact", use the friction's Primary Driver Impact 
    // to generate benefit inputs from friction data + company data
    if (step4?.data && Array.isArray(step4.data)) {
      const step4Record = (step4.data as Step4Record[]).find((r: any) => r.ID === record.ID);
      if (step4Record) {
        const targetFriction = step4Record["Target Friction"]?.toString() || "";
        const step3Record = step3?.data ? (step3.data as Step3Record[]).find(
          (r: any) => r["Friction Point"] === targetFriction
        ) : null;
        
        if (step3Record) {
          const driverImpact = (step3Record["Primary Driver Impact"] || "").toLowerCase();
          const frictionHours = typeof step3Record["Annual Hours"] === "number" 
            ? step3Record["Annual Hours"] 
            : parseFloat(String(step3Record["Annual Hours"] || "0").replace(/,/g, ""));
          const frictionRate = typeof step3Record["Hourly Rate"] === "number"
            ? step3Record["Hourly Rate"]
            : parseFloat(String(step3Record["Hourly Rate"] || "0").replace(/[$,/hr]/g, ""));
          const frictionCost = frictionHours * frictionRate;
          
          if (frictionCost <= 0 && driverImpact) {
            console.warn(`[postProcessAnalysis] ${record.ID}: Cannot derive benefits — friction cost is $0 for "${targetFriction?.substring(0, 40)}..."`);
          }

          // If revenue formula returned $0 but friction driver suggests revenue impact
          if (revenueResult.value === 0 && frictionCost > 0 && (driverImpact.includes("revenue") || driverImpact.includes("sales"))) {
            const estimatedRevenueAtRisk = annualRevenueFromStep0 > 0 
              ? Math.min(annualRevenueFromStep0 * 0.20, frictionCost * 25) 
              : frictionCost * 25;
            const upliftPct = 0.003;
            const derivedRevenue = hfCalculateRevenueBenefit({
              upliftPct,
              baselineRevenueAtRisk: estimatedRevenueAtRisk,
            });
            const derivedCappedUpliftPct = derivedRevenue.trace.inputs.upliftPct as number;
            const derivedRevenueEngineCapped = upliftPct - derivedCappedUpliftPct > 1e-9;
            if (derivedRevenueEngineCapped) useCaseHadEngineCap = true;
            const derivedUpliftPctText = formatUpliftPctForAudit(
              upliftPct,
              derivedCappedUpliftPct,
            );
            const derivedRevenueWarnings = [`Revenue derived from Step 3 driver impact: ${driverImpact}`];
            if (derivedRevenueEngineCapped) {
              derivedRevenueWarnings.push(
                formatRevenueUpliftCapWarning(record.ID, upliftPct, derivedCappedUpliftPct),
              );
            }
            revenueResult = {
              value: derivedRevenue.value,
              formulaText: `${derivedUpliftPctText} × ${formatExactMoneyForAudit(estimatedRevenueAtRisk)} × 0.95 × 0.75 = ${formatMoney(derivedRevenue.trace.output)} → ${formatMoney(derivedRevenue.value)} [derived from ${driverImpact}]`,
              warnings: derivedRevenueWarnings,
              engineCapped: derivedRevenueEngineCapped,
            };
            console.log(`[postProcessAnalysis] ${record.ID}: Derived revenue from Step 3 driver "${driverImpact}": ${formatMoney(derivedRevenue.value)}`);
          }
          
          // If cash flow formula returned $0 but friction driver suggests cash flow impact  
          if (cashFlowResult.value === 0 && frictionCost > 0 && driverImpact.includes("cash flow")) {
            const daysImprovement = 3;
            const companyRevenue = annualRevenueFromStep0 > 0 ? annualRevenueFromStep0 : frictionCost * 100;
            const derivedCashFlow = hfCalculateCashFlowBenefit({
              annualRevenue: companyRevenue,
              daysImprovement,
            });
            // Preserve any prior warnings (e.g. LABEL_SWAP_DETECTED) so the
            // upstream label-swap detection does not get silently wiped when
            // we fall through to the Step-3 derived path.
            const priorCashFlowWarnings = cashFlowResult.warnings || [];
            cashFlowResult = {
              value: derivedCashFlow.value,
              formulaText: `${formatExactMoneyForAudit(companyRevenue)} × (${daysImprovement}/365) × 0.08 × 0.85 × 0.75 = ${formatMoney(derivedCashFlow.trace.output)} → ${formatMoney(derivedCashFlow.value)} [derived from ${driverImpact}]`,
              warnings: [
                ...priorCashFlowWarnings,
                `Cash flow derived from Step 3 driver impact: ${driverImpact}`,
              ],
              daysImprovement,
            };
            console.log(`[postProcessAnalysis] ${record.ID}: Derived cash flow from Step 3 driver "${driverImpact}": ${formatMoney(derivedCashFlow.value)}`);
          }
          
          // If risk formula returned $0 but friction driver suggests risk impact
          if (riskResult.value === 0 && frictionCost > 0 && (driverImpact.includes("risk") || driverImpact.includes("compliance"))) {
            const riskExposure = Math.min(frictionCost * 5, annualRevenueFromStep0 > 0 ? annualRevenueFromStep0 * 0.10 : frictionCost * 5);
            const riskReductionPct = 0.05;
            const derivedRisk = hfCalculateRiskBenefit({
              riskReductionPct,
              riskExposure,
            });
            const derivedCappedReductionPct = derivedRisk.trace.inputs.riskReductionPct as number;
            const derivedRiskEngineCapped = riskReductionPct - derivedCappedReductionPct > 1e-9;
            if (derivedRiskEngineCapped) useCaseHadEngineCap = true;
            const derivedReductionPctText = formatRiskReductionPctForAudit(
              riskReductionPct,
              derivedCappedReductionPct,
            );
            const derivedRiskWarnings = [`Risk derived from Step 3 driver impact: ${driverImpact}`];
            if (derivedRiskEngineCapped) {
              derivedRiskWarnings.push(
                formatRiskReductionCapWarning(record.ID, riskReductionPct, derivedCappedReductionPct),
              );
            }
            riskResult = {
              value: derivedRisk.value,
              formulaText: `${derivedReductionPctText} × ${formatExactMoneyForAudit(riskExposure)} × 0.80 × 0.75 = ${formatMoney(derivedRisk.trace.output)} → ${formatMoney(derivedRisk.value)} [derived from ${driverImpact}]`,
              warnings: derivedRiskWarnings,
              engineCapped: derivedRiskEngineCapped,
            };
            console.log(`[postProcessAnalysis] ${record.ID}: Derived risk from Step 3 driver "${driverImpact}": ${formatMoney(derivedRisk.value)}`);
          }
        }
      }
    }

    // Collect all warnings from individual recalculations
    const ucWarnings = [
      ...costResult.warnings,
      ...revenueResult.warnings,
      ...cashFlowResult.warnings,
      ...riskResult.warnings,
    ];

    let costVal = costResult.value;
    let revVal = revenueResult.value;
    let cfVal = cashFlowResult.value;
    let riskVal = riskResult.value;

    // ========================================================================
    // STAGE B1 — Class-aware benefit gating
    // If the LLM has declared a Use Case Class, reject any benefit pillars
    // that contradict the declaration (e.g. revenue benefit on a use case
    // declared cost-only). When the field is absent, emit advisory warnings.
    // ========================================================================
    {
      const declared = readDeclaredClasses(record);
      const gate = gateBenefitsByClass({
        useCaseId: record.ID || "UC",
        declaredClasses: declared,
        revenueBenefit: revVal,
        costBenefit: costVal,
        riskBenefit: riskVal,
        cashFlowBenefit: cfVal,
      });
      revVal = gate.adjusted.revenue;
      costVal = gate.adjusted.cost;
      riskVal = gate.adjusted.risk;
      cfVal = gate.adjusted.cashFlow;
      for (const w of gate.warnings) {
        integrityWarnings.push({
          severity: w.severity,
          code: w.code,
          message: w.message,
          recommendedAction: w.recommendedAction,
        });
      }
    }

    // ========================================================================
    // STAGE B2 — Risk source-of-truth (anchor to lossCategory + Step-2 KPI)
    // ========================================================================
    {
      const step2KpiIds = new Set<string>();
      const step2Recs = (step2?.data as any[]) || [];
      for (const k of step2Recs) {
        const id = k?.["KPI ID"] ?? k?.["ID"] ?? k?.kpiId;
        if (id) step2KpiIds.add(String(id));
      }
      const anchor = readRiskAnchorFromRecord(record);
      const ra = validateRiskAnchoring({
        useCaseId: record.ID || "UC",
        riskBenefit: riskVal,
        lossCategory: anchor.lossCategory,
        kpiAnchorId: anchor.kpiAnchorId,
        step2KpiIds,
        hardReject: false, // advisory until LLM contract is updated
      });
      riskVal = ra.adjustedRiskBenefit;
      for (const w of ra.warnings) {
        integrityWarnings.push({
          severity: w.severity,
          code: w.code,
          message: w.message,
          recommendedAction: w.recommendedAction,
        });
      }
    }

    let ucTotal = costVal + revVal + cfVal + riskVal;

    // Clamp Probability of Success to bounds
    const rawProb = typeof record["Probability of Success"] === 'number'
      ? record["Probability of Success"]
      : parseFloat(String(record["Probability of Success"])) || 0.75;
    const prob = clamp(rawProb, INPUT_BOUNDS.probabilityOfSuccess.min, INPUT_BOUNDS.probabilityOfSuccess.max);

    // Expected Value = Total Annual Benefit × Probability of Success
    const expectedValue = ucTotal * prob;

    totalCostBenefit += costVal;
    totalRevenueBenefit += revVal;
    totalCashFlowBenefit += cfVal;
    totalRiskBenefit += riskVal;

    // Extract hours saved for cross-validation
    const costFormula = record["Cost Formula"] || "";
    const costInputs = parseCostFormulaInputs(costFormula);
    const hoursSaved = costInputs?.hoursSaved || 0;

    useCaseBenefitsForValidation.push({
      id: record.ID,
      costBenefit: costVal,
      revenueBenefit: revVal,
      cashFlowBenefit: cfVal,
      riskBenefit: riskVal,
      hoursSaved,
    });

    // Capture per-UC cash-flow days for the portfolio guardrail. The index
    // is set later (immediately after we push the orderedStep5Record) so the
    // guardrail can mutate the correct record by index.
    useCaseCashFlowMeta.push({
      id: record.ID,
      daysImprovement: cashFlowResult.daysImprovement ?? 0,
      cashFlowBenefit: cfVal,
      indexInCorrected: -1, // filled in below after push
    });

    const buildCostLabels = (inputs: CostInputs, value: number) => ({
      components: [
        { label: "Hours Saved", value: inputs.hoursSaved },
        { label: "Loaded Hourly Rate", value: inputs.loadedHourlyRate },
        { label: "Benefits Loading", value: inputs.efficiencyMultiplier },
        { label: "Adoption Rate", value: inputs.adoptionMultiplier },
        { label: "Data Maturity", value: inputs.dataMaturityMultiplier },
      ],
      result: formatMoney(value),
    });
    const buildRevenueLabels = (inputs: RevenueInputs, value: number) => ({
      components: [
        { label: "Revenue Uplift %", value: inputs.upliftPct },
        { label: "Revenue at Risk", value: inputs.baselineRevenueAtRisk },
        { label: "Realization Factor", value: inputs.revenueRealizationMultiplier },
        { label: "Data Maturity", value: inputs.dataMaturityMultiplier },
      ],
      result: formatMoney(value),
    });
    const buildCashFlowLabels = (inputs: CashFlowInputs, value: number) => ({
      components: [
        { label: "Annual Revenue", value: inputs.annualRevenue },
        { label: "Days Improved", value: inputs.daysImprovement },
        { label: "Cost of Capital", value: inputs.costOfCapital },
        { label: "Realization Factor", value: inputs.cashFlowRealizationMultiplier },
        { label: "Data Maturity", value: inputs.dataMaturityMultiplier },
      ],
      result: formatMoney(value),
    });
    const buildRiskLabels = (inputs: RiskInputs, value: number) => ({
      components: [
        { label: "Risk Reduction %", value: inputs.probBefore },
        { label: "Risk Exposure", value: inputs.impactBefore },
        { label: "Realization Factor", value: inputs.riskRealizationMultiplier },
        { label: "Data Maturity", value: inputs.dataMaturityMultiplier },
      ],
      result: formatMoney(value),
    });

    const costAnnotation = structuredCostInputs
      ? buildCostLabels(structuredCostInputs, costVal)
      : annotateFormula(costResult.formulaText, "cost");
    const revenueAnnotation = structuredRevenueInputs
      ? buildRevenueLabels(structuredRevenueInputs, revVal)
      : annotateFormula(revenueResult.formulaText, "revenue");
    const cashFlowAnnotation = structuredCashFlowInputs
      ? buildCashFlowLabels(structuredCashFlowInputs, cfVal)
      : annotateFormula(cashFlowResult.formulaText, "cashflow");
    const riskAnnotation = structuredRiskInputs
      ? buildRiskLabels(structuredRiskInputs, riskVal)
      : annotateFormula(riskResult.formulaText, "risk");

    const orderedStep5Record: Record<string, any> = {
      "ID": record.ID,
      "Use Case": record["Use Case"],
      "Total Annual Value ($)": formatMoney(ucTotal),
      "Probability of Success": prob,
      "Expected Value ($)": formatMoney(expectedValue),
      "Cost Benefit ($)": formatMoney(costVal),
      "Cost Formula": costResult.formulaText,
      "Cost Formula Labels": costAnnotation,
      "Revenue Benefit ($)": formatMoney(revVal),
      "Revenue Formula": revenueResult.formulaText,
      "Revenue Formula Labels": revenueAnnotation,
      "Risk Benefit ($)": formatMoney(riskVal),
      "Risk Formula": riskResult.formulaText,
      "Risk Formula Labels": riskAnnotation,
      "Cash Flow Benefit ($)": formatMoney(cfVal),
      "Cash Flow Formula": cashFlowResult.formulaText,
      "Cash Flow Formula Labels": cashFlowAnnotation,
    };
    for (const key of Object.keys(record)) {
      if (!(key in orderedStep5Record)) {
        orderedStep5Record[key] = (record as any)[key];
      }
    }
    correctedStep5Data.push(orderedStep5Record as Step5Record);
    // Wire the most-recently-pushed UC to its meta entry so the portfolio
    // cash-flow guardrail (run after the loop) can mutate the right record.
    if (useCaseCashFlowMeta.length > 0) {
      useCaseCashFlowMeta[useCaseCashFlowMeta.length - 1].indexInCorrected =
        correctedStep5Data.length - 1;
    }

    // Collect per-use-case warnings for the validation report
    allUseCaseWarnings.push(...ucWarnings);

    // Count this use case toward the Validation Summary's "UCs capped" tally
    // when the HyperFormula engine bound a per-use-case cap on the revenue
    // uplift or the risk-reduction percentage. Without this, the rolled-up
    // summary admins use to spot-check a portfolio reports "0 UCs capped"
    // even when every use case relied on AI-overstated inputs that the
    // engine quietly clamped (Task #51).
    if (useCaseHadEngineCap) useCasesCapped++;

    console.log(`[postProcessAnalysis] ${record.ID}: Cost=${formatMoney(costVal)}, Revenue=${formatMoney(revVal)}, CashFlow=${formatMoney(cfVal)}, Risk=${formatMoney(riskVal)}, Total=${formatMoney(ucTotal)}, P(S)=${prob}, EV=${formatMoney(expectedValue)}${ucWarnings.length > 0 ? ` [${ucWarnings.length} warnings]` : ''}${useCaseHadEngineCap ? ' [engine-capped]' : ''}`);
  }

  // ============================================
  // PORTFOLIO CASH-FLOW GUARDRAIL (Task #107)
  //
  // Per-UC `INPUT_BOUNDS.daysImprovement.max` (= 90) caps a single use case
  // in isolation. It cannot detect the aggregation failure where N use cases
  // each book a credible-looking 5–10 days of working-capital improvement
  // against the SAME company revenue base — those days sum to a portfolio
  // total that double-counts the same DSO/DPO/inventory pool (Constellation
  // Energy: 10 UCs × ~9 days each = 92 cumulative days against $22.4B,
  // producing $288M of cash-flow benefit that was 63% of total reported
  // value and not CFO-defensible).
  //
  // If the portfolio total exceeds PORTFOLIO_BOUNDS.cumulativeDaysImprovement.max
  // (= 30 days ≈ one month of working capital), every per-UC cash-flow value
  // is prorated by `30 / sum(days)` so the portfolio respects a single
  // shared working-capital denominator. Audit reconciliation
  // (printed math == printed dollar) is preserved by appending the scale
  // factor as an explicit term to each cash-flow `formulaText`.
  // ============================================
  {
    const guardrail = applyPortfolioCashflowGuardrail({
      perUseCase: useCaseCashFlowMeta.map((m) => ({
        id: m.id,
        daysImprovement: m.daysImprovement,
        cashFlowBenefit: m.cashFlowBenefit,
      })),
    });
    if (guardrail.capBound) {
      const factor = guardrail.scaleFactor;
      console.log(
        `[postProcessAnalysis] PORTFOLIO_CASHFLOW_DAYS_CAP: cumulative ${guardrail.cumulativeDaysRaw.toFixed(1)} days → ${guardrail.cumulativeDaysCapped} days (scale ${factor.toFixed(3)}) across ${useCaseCashFlowMeta.filter((m) => m.daysImprovement > 0).length} cash-flow UCs`,
      );

      let scaledTotal = 0;
      const ucsActuallyScaled: string[] = [];
      for (let i = 0; i < useCaseCashFlowMeta.length; i++) {
        const meta = useCaseCashFlowMeta[i];
        const scaledOut = guardrail.perUseCase[i];
        const newCfVal = scaledOut.scaledCashFlowBenefit;
        scaledTotal += newCfVal;

        // Only mutate records where there was a non-zero days/benefit to scale.
        if (meta.cashFlowBenefit <= 0 || meta.daysImprovement <= 0) continue;
        if (meta.indexInCorrected < 0 || meta.indexInCorrected >= correctedStep5Data.length) continue;

        const rec = correctedStep5Data[meta.indexInCorrected] as any;
        const oldCfVal = meta.cashFlowBenefit;
        ucsActuallyScaled.push(meta.id);

        // Append the prorate term to the formulaText so audit reconciliation
        // (printed math evaluates to printed dollar) is preserved.
        // Original formulaText already ends with "→ $X"; append "× factor → $Y".
        // Use 6-decimal precision so `oldCfVal × printedFactor` reconciles to
        // `formatMoney(newCfVal)` within tolerance even when the abbreviated
        // result has limited precision.
        const scaledNote = ` × ${factor.toFixed(6)} (portfolio days cap) → ${formatMoney(newCfVal)}`;
        const oldFormulaText = String(rec["Cash Flow Formula"] || "");
        rec["Cash Flow Formula"] = oldFormulaText + scaledNote;
        rec["Cash Flow Benefit ($)"] = formatMoney(newCfVal);

        // Update the structured Cash Flow Formula Labels result if present so
        // downstream consumers (exports, UI) reflect the prorated value.
        const labels = rec["Cash Flow Formula Labels"];
        if (labels && typeof labels === "object") {
          if (typeof labels.result === "object" && labels.result !== null) {
            labels.result.value = newCfVal;
          } else if ("result" in labels) {
            labels.result = { value: newCfVal, label: "Cash Flow Benefit", format: "currency" };
          }
          // Mark the portfolio adjustment in the annotation for traceability.
          labels.portfolioCashflowGuardrail = {
            scaleFactor: factor,
            originalValue: oldCfVal,
            scaledValue: newCfVal,
            cumulativeDaysRaw: guardrail.cumulativeDaysRaw,
            cumulativeDaysCapped: guardrail.cumulativeDaysCapped,
          };
        }

        // Mirror the new value into the validation array so cross-validate
        // (and the benefits cap) operate on the corrected portfolio.
        const valEntry = useCaseBenefitsForValidation.find((v) => v.id === meta.id);
        if (valEntry) valEntry.cashFlowBenefit = newCfVal;

        // Recompute the per-UC `Total Annual Value ($)` and `Expected Value ($)`
        // so the Step 5 row reflects the prorated cash-flow total. Without
        // this, downstream consumers that read row totals (topUseCases,
        // exports, executive dashboard per-UC fields) would show the pre-cap
        // total alongside post-cap portfolio rollups — an internal inconsistency
        // (architect review, Task #107).
        const recCost = parseNumber(rec["Cost Benefit ($)"]);
        const recRev = parseNumber(rec["Revenue Benefit ($)"]);
        const recRisk = parseNumber(rec["Risk Benefit ($)"]);
        const newUcTotal = recCost + recRev + newCfVal + recRisk;
        const recProbRaw = typeof rec["Probability of Success"] === "number"
          ? rec["Probability of Success"]
          : parseFloat(String(rec["Probability of Success"] ?? 0.75)) || 0.75;
        const recProb = clamp(
          recProbRaw,
          INPUT_BOUNDS.probabilityOfSuccess.min,
          INPUT_BOUNDS.probabilityOfSuccess.max,
        );
        rec["Total Annual Value ($)"] = formatMoney(newUcTotal);
        rec["Expected Value ($)"] = formatMoney(newUcTotal * recProb);
      }

      // Update rolled-up totals so totalAnnualValue, headline, multi-year
      // projection, and IRR/payback all flow from the corrected cash-flow base.
      totalCashFlowBenefit = scaledTotal;

      // Surface a portfolio-level warning so the Validation Summary panel
      // and methodology-integrity panel both show the cap fired.
      const portfolioMsg =
        `Portfolio cash-flow capped: cumulative working-capital improvement of ` +
        `${guardrail.cumulativeDaysRaw.toFixed(1)} days exceeded the ` +
        `${guardrail.cumulativeDaysCapped}-day portfolio ceiling; all ${ucsActuallyScaled.length} ` +
        `cash-flow use case${ucsActuallyScaled.length === 1 ? "" : "s"} prorated by ` +
        `${factor.toFixed(3)}× to prevent double-counting the same DSO/DPO/inventory pool.`;
      allUseCaseWarnings.push(portfolioMsg);
      integrityWarnings.push({
        severity: "warning",
        code: "PORTFOLIO_CASHFLOW_DAYS_CAP",
        message: portfolioMsg,
        recommendedAction:
          "Reduce per-use-case `daysImprovement` so the portfolio total stays within ~30 days (one month of working capital). Each UC discounting the same receivables/payables/inventory pool above this threshold double-counts cash that was already freed by an earlier UC.",
      });

      // Per-UC structured warnings — one per affected use case so admins can
      // see which specific UCs were prorated, mirroring the per-UC pattern
      // used by revenue/risk caps.
      for (let j = 0; j < useCaseCashFlowMeta.length; j++) {
        const meta = useCaseCashFlowMeta[j];
        const out = guardrail.perUseCase[j];
        if (meta.cashFlowBenefit <= 0 || meta.daysImprovement <= 0) continue;
        const ucMsg =
          `${meta.id} cash flow prorated from ${formatMoney(out.originalCashFlowBenefit)} ` +
          `to ${formatMoney(out.scaledCashFlowBenefit)} (× ${factor.toFixed(3)}) — ` +
          `portfolio days cap.`;
        allUseCaseWarnings.push(ucMsg);
        integrityWarnings.push({
          severity: "info",
          code: "PORTFOLIO_CASHFLOW_DAYS_CAP_UC",
          message: ucMsg,
          recommendedAction:
            "Lower this use case's `daysImprovement` so the portfolio total stays within ~30 days; alternatively, consolidate overlapping working-capital initiatives into one use case.",
        });
        useCasesCapped++;
      }
    }
  }

  // ============================================
  // PORTFOLIO CASH-FLOW SHARE CAP (Task #107).
  //
  // If cash flow exceeds PORTFOLIO_BOUNDS.cashFlowShareOfTotalValue.max
  // (35%) of total annual value, scale every UC's cash flow down so the
  // share equals exactly the cap. Mirror the days-cap pattern: update Step
  // 5 rows, formula text, Total Annual Value, EV, validation array, and
  // emit per-UC + portfolio integrity warnings.
  // ============================================
  {
    const otherPillars = totalCostBenefit + totalRevenueBenefit + totalRiskBenefit;
    const provisionalTotal = otherPillars + totalCashFlowBenefit;
    if (provisionalTotal > 0 && totalCashFlowBenefit > 0) {
      const cap = PORTFOLIO_BOUNDS.cashFlowShareOfTotalValue.max;
      const cfShare = totalCashFlowBenefit / provisionalTotal;
      if (cfShare > cap) {
        // Solve for new cash flow such that new_cf / (other + new_cf) = cap
        // ⇒ new_cf = cap × other / (1 − cap).
        const targetCashFlow = (cap * otherPillars) / (1 - cap);
        const shareScale = totalCashFlowBenefit > 0
          ? Math.max(0, targetCashFlow) / totalCashFlowBenefit
          : 1;

        let newPortfolioCashFlow = 0;
        const scaledIds: string[] = [];

        for (let j = 0; j < useCaseCashFlowMeta.length; j++) {
          const meta = useCaseCashFlowMeta[j];
          if (meta.cashFlowBenefit <= 0) continue;
          const rec = correctedStep5Data[meta.indexInCorrected] as any;
          const oldCfVal = parseNumber(rec["Cash Flow Benefit ($)"]);
          const newCfVal = Math.floor(oldCfVal * shareScale);
          newPortfolioCashFlow += newCfVal;

          const oldFormulaText = String(rec["Cash Flow Formula"] || "");
          rec["Cash Flow Formula"] =
            oldFormulaText +
            ` × ${shareScale.toFixed(6)} (portfolio cash-flow share cap) → ${formatMoney(newCfVal)}`;
          rec["Cash Flow Benefit ($)"] = formatMoney(newCfVal);

          const cfLabels = rec["Cash Flow Formula Labels"];
          if (cfLabels && typeof cfLabels === "object" && cfLabels.result) {
            cfLabels.result = formatMoney(newCfVal);
            cfLabels.portfolioCashflowShareCap = {
              cap,
              scaleFactor: shareScale,
              originalValue: oldCfVal,
              scaledValue: newCfVal,
            };
          }

          // Recompute per-UC totals and EV.
          const cost = parseNumber(rec["Cost Benefit ($)"]);
          const revenue = parseNumber(rec["Revenue Benefit ($)"]);
          const risk = parseNumber(rec["Risk Benefit ($)"]);
          const newTotalAnnual = cost + revenue + newCfVal + risk;
          const probSuccess = parseNumber(rec["Probability of Success"]) || 0.75;
          const newEV = newTotalAnnual * probSuccess;
          rec["Total Annual Value ($)"] = formatMoney(newTotalAnnual);
          rec["Expected Value ($)"] = formatMoney(newEV);

          // Mirror into validation array.
          const validationEntry = useCaseBenefitsForValidation.find((v) => v.id === meta.id);
          if (validationEntry) {
            validationEntry.cashFlowBenefit = newCfVal;
            (validationEntry as any).totalAnnualValue = newTotalAnnual;
          }

          scaledIds.push(meta.id);

          // Per-UC structured warning.
          integrityWarnings.push({
            severity: "info",
            code: "PORTFOLIO_CASHFLOW_SHARE_UC",
            message:
              `${meta.id} cash flow further prorated from ${formatMoney(oldCfVal)} to ` +
              `${formatMoney(newCfVal)} (× ${shareScale.toFixed(3)}) — portfolio cash-flow share cap.`,
            recommendedAction:
              "Cash-flow benefits across the portfolio exceeded the 35% concentration ceiling. Verify each UC discounts a distinct working-capital pool.",
          });
          useCasesCapped++;
        }

        totalCashFlowBenefit = newPortfolioCashFlow;

        const portfolioMsg =
          `Portfolio cash-flow share capped from ${(cfShare * 100).toFixed(1)}% to ` +
          `${(cap * 100).toFixed(0)}% of total annual value; ${scaledIds.length} ` +
          `cash-flow use case${scaledIds.length === 1 ? "" : "s"} prorated by ` +
          `${shareScale.toFixed(3)}× to prevent CFO-implausible cash-flow concentration.`;
        allUseCaseWarnings.push(portfolioMsg);
        integrityWarnings.push({
          severity: "warning",
          code: "PORTFOLIO_CASHFLOW_SHARE",
          message: portfolioMsg,
          recommendedAction:
            "Re-examine each cash-flow use case to confirm it discounts a distinct receivables/payables/inventory pool. If two UCs target the same pool, merge them or zero out one of the cash-flow lines.",
        });
      }
    }
  }

  // ============================================
  // PORTFOLIO TOTAL VALUE / REVENUE CAP (Task #107).
  //
  // If total annual value exceeds PORTFOLIO_BOUNDS.totalValueAsShareOfRevenue.max
  // (5%) of company revenue, scale ALL four pillars uniformly so the
  // portfolio total equals exactly the cap. CFOs uniformly dismiss
  // year-one programs claiming > 5% of revenue from a single AI initiative
  // bundle; this gate prevents the report from going to slide review with
  // a defeating headline.
  // ============================================
  {
    const totalSoFar = totalCostBenefit + totalRevenueBenefit + totalCashFlowBenefit + totalRiskBenefit;
    if (annualRevenueFromStep0 > 0 && totalSoFar > 0) {
      const revenueCap = PORTFOLIO_BOUNDS.totalValueAsShareOfRevenue.max;
      const valueShare = totalSoFar / annualRevenueFromStep0;
      if (valueShare > revenueCap) {
        const targetTotal = annualRevenueFromStep0 * revenueCap;
        const revScale = targetTotal / totalSoFar;
        const scaledIds: string[] = [];

        let newCost = 0, newRevenue = 0, newCashFlow = 0, newRisk = 0;

        for (let i = 0; i < correctedStep5Data.length; i++) {
          const rec = correctedStep5Data[i] as any;
          const oldCost = parseNumber(rec["Cost Benefit ($)"]);
          const oldRev = parseNumber(rec["Revenue Benefit ($)"]);
          const oldCf = parseNumber(rec["Cash Flow Benefit ($)"]);
          const oldRisk = parseNumber(rec["Risk Benefit ($)"]);

          const sCost = Math.floor(oldCost * revScale);
          const sRev = Math.floor(oldRev * revScale);
          const sCf = Math.floor(oldCf * revScale);
          const sRisk = Math.floor(oldRisk * revScale);

          newCost += sCost; newRevenue += sRev; newCashFlow += sCf; newRisk += sRisk;

          // Update each pillar value and append a portfolio-revenue-cap
          // annotation to its formula so audit reconciliation still holds.
          if (oldCost > 0) {
            rec["Cost Benefit ($)"] = formatMoney(sCost);
            const f = String(rec["Cost Formula"] || "");
            if (f) rec["Cost Formula"] = f + ` × ${revScale.toFixed(6)} (portfolio revenue cap) → ${formatMoney(sCost)}`;
          }
          if (oldRev > 0) {
            rec["Revenue Benefit ($)"] = formatMoney(sRev);
            const f = String(rec["Revenue Formula"] || "");
            if (f) rec["Revenue Formula"] = f + ` × ${revScale.toFixed(6)} (portfolio revenue cap) → ${formatMoney(sRev)}`;
          }
          if (oldCf > 0) {
            rec["Cash Flow Benefit ($)"] = formatMoney(sCf);
            const f = String(rec["Cash Flow Formula"] || "");
            if (f) rec["Cash Flow Formula"] = f + ` × ${revScale.toFixed(6)} (portfolio revenue cap) → ${formatMoney(sCf)}`;
          }
          if (oldRisk > 0) {
            rec["Risk Benefit ($)"] = formatMoney(sRisk);
            const f = String(rec["Risk Formula"] || "");
            if (f) rec["Risk Formula"] = f + ` × ${revScale.toFixed(6)} (portfolio revenue cap) → ${formatMoney(sRisk)}`;
          }

          const newTotalAnnual = sCost + sRev + sCf + sRisk;
          const probSuccess = parseNumber(rec["Probability of Success"]) || 0.75;
          rec["Total Annual Value ($)"] = formatMoney(newTotalAnnual);
          rec["Expected Value ($)"] = formatMoney(newTotalAnnual * probSuccess);

          const validationEntry = useCaseBenefitsForValidation.find((v) => v.id === rec.ID);
          if (validationEntry) {
            validationEntry.costBenefit = sCost;
            validationEntry.revenueBenefit = sRev;
            validationEntry.cashFlowBenefit = sCf;
            validationEntry.riskBenefit = sRisk;
            (validationEntry as any).totalAnnualValue = newTotalAnnual;
          }

          if (oldCost + oldRev + oldCf + oldRisk > 0) scaledIds.push(rec.ID);
        }

        totalCostBenefit = newCost;
        totalRevenueBenefit = newRevenue;
        totalCashFlowBenefit = newCashFlow;
        totalRiskBenefit = newRisk;

        const portfolioMsg =
          `Portfolio total annual value capped from ${(valueShare * 100).toFixed(2)}% to ` +
          `${(revenueCap * 100).toFixed(0)}% of company revenue (${formatMoney(annualRevenueFromStep0)}); ` +
          `${scaledIds.length} use case${scaledIds.length === 1 ? "" : "s"} prorated by ` +
          `${revScale.toFixed(3)}× across all four benefit pillars.`;
        allUseCaseWarnings.push(portfolioMsg);
        integrityWarnings.push({
          severity: "warning",
          code: "PORTFOLIO_TOTAL_VS_REVENUE_CAP",
          message: portfolioMsg,
          recommendedAction:
            "Total annual value exceeded 5% of company revenue — implausibly high for a one-year AI program. Verify probability weighting and data-maturity haircuts; check for double-counting between use cases.",
        });
        useCasesCapped += scaledIds.length;
      }
    }
  }

  // ============================================
  // STEP 5: CROSS-VALIDATION & BENEFITS CAP
  // ============================================
  const validationWarnings: string[] = [...allUseCaseWarnings, ...mappingWarnings];
  let benefitsCapped = false;
  let capScaleFactor = 1.0;
  const originalTotal = totalCostBenefit + totalRevenueBenefit + totalCashFlowBenefit + totalRiskBenefit;

  if (annualRevenueFromStep0 > 0) {
    const validationResult = crossValidateUseCases({
      useCaseBenefits: useCaseBenefitsForValidation,
      annualRevenue: annualRevenueFromStep0,
      totalEmployees: totalEmployeesFromStep0,
    });

    validationWarnings.push(...validationResult.warnings);

    if (validationResult.metrics.benefitsCapped) {
      benefitsCapped = true;
      capScaleFactor = validationResult.metrics.scaleFactor;
      console.log(`[postProcessAnalysis] Portfolio benefits exceed threshold (advisory only, no scaling). Scale factor = ${capScaleFactor.toFixed(2)}`);
    }
  }

  // Update Step 5 data with scaled benefits
  step5.data = correctedStep5Data;

  // ============================================
  // FRICTION RECOVERY: LINK STEP 3 TO STEP 5
  // ============================================
  const frictionRecoveryMap = new Map<string, Array<{
    useCaseId: string;
    useCaseName: string;
    recoveryAmount: number;
    recoveryPct: number;
  }>>();

  if (step4?.data && Array.isArray(step4.data)) {
    for (const step4Record of step4.data as Step4Record[]) {
      const targetFriction = step4Record["Target Friction"]?.toString() || "";
      if (!targetFriction) continue;

      // Find the friction cost for this target
      const frictionCost = frictionCostMap.get(targetFriction) || 0;
      if (frictionCost === 0) continue;

      // Find the corresponding Step 5 benefit
      const step5Record = correctedStep5Data.find(r => r.ID === step4Record.ID);
      if (!step5Record) continue;

      const useCaseBenefit = parseNumber(step5Record["Total Annual Value ($)"]);
      const recovery = calculateFrictionRecovery(frictionCost, useCaseBenefit);

      if (!frictionRecoveryMap.has(targetFriction)) {
        frictionRecoveryMap.set(targetFriction, []);
      }
      frictionRecoveryMap.get(targetFriction)!.push({
        useCaseId: step4Record.ID,
        useCaseName: step4Record["Use Case"],
        recoveryAmount: recovery.recoveryAmount,
        recoveryPct: recovery.recoveryPct,
      });

      console.log(`[postProcessAnalysis] Friction Recovery: Use Case ${step4Record.ID} recovers ${formatMoney(recovery.recoveryAmount)} (${(recovery.recoveryPct * 100).toFixed(0)}%) from friction "${targetFriction}"`);
    }
  }

  // Recalculate Step 6: New 4-component readiness score (1-10) + token costs
  // Column order: ID, Use Case, Readiness Score, Organizational Capacity,
  //   Data Availability & Quality, Technical Infrastructure, Governance,
  //   Time To Value, Monthly Tokens, Runs/Month, Input Tokens/Run, Output Tokens/Run
  let totalMonthlyTokens = 0;

  if (step6?.data && Array.isArray(step6.data)) {
    const correctedStep6Data: any[] = [];

    // Ensure Time-to-Value exists
    for (const row of step6.data as Step6Record[]) {
      if (!row['Time-to-Value'] && !row['Time-to-Value (months)']) {
        row['Time-to-Value'] = 6; // Default 6 months
      }
    }

    for (const record of step6.data as Step6Record[]) {
      const tokenResult = calculateTokenCostFromStep6(record);
      totalMonthlyTokens += tokenResult.monthlyTokens;

      // Extract 4 readiness components — support both new (1-10) and legacy (1-5) field names
      // New fields come from updated AI prompt; legacy fields from older reports
      const orgCapacity = record["Organizational Capacity"]
        ?? record["Change Mgmt (1-5)"] ?? record["Change Mgmt"] ?? 5;
      const dataQuality = record["Data Availability & Quality"]
        ?? record["Data Readiness (1-5)"] ?? record["Data Readiness"] ?? 5;
      const techInfra = record["Technical Infrastructure"] ?? 5;
      const governance = record["Governance"] ?? 5;

      // Scale legacy 1-5 values to 1-10 if they appear to be on old scale
      const scaleToTen = (v: number): number => {
        if (typeof v !== 'number' || isNaN(v)) return 5;
        // If value is <= 5, likely on old 1-5 scale — map to 1-10
        if (v <= 5) return Math.round(1 + ((v - 1) / 4) * 9);
        return Math.min(10, Math.max(1, Math.round(v)));
      };

      // Only scale if the record has legacy fields (not new 1-10 fields)
      const hasNewFields = record["Organizational Capacity"] !== undefined
        || record["Technical Infrastructure"] !== undefined
        || record["Governance"] !== undefined;

      const oc = hasNewFields ? Math.min(10, Math.max(1, Math.round(orgCapacity as number))) : scaleToTen(orgCapacity as number);
      const dq = hasNewFields ? Math.min(10, Math.max(1, Math.round(dataQuality as number))) : scaleToTen(dataQuality as number);
      const ti = hasNewFields ? Math.min(10, Math.max(1, Math.round(techInfra as number))) : scaleToTen(techInfra as number);
      const gov = hasNewFields ? Math.min(10, Math.max(1, Math.round(governance as number))) : scaleToTen(governance as number);

      // Calculate composite readiness score using weighted formula (legacy v1 = 0.30/0.30/0.20/0.20)
      const readinessResult = calculateReadinessScore({
        organizationalCapacity: oc,
        dataAvailabilityQuality: dq,
        technicalInfrastructure: ti,
        governance: gov,
      });

      // VRM v2.0 weighted readiness using preset weights (default = baseline 0.35/0.30/0.20/0.15)
      const readinessV2 = computeWeightedReadiness(
        { orgCapacity: oc, dataReadiness: dq, governance: gov, techInfrastructure: ti },
        sectorPreset,
      );

      // Knock-out fields — AI may emit these; default to null (unconfirmed) when absent
      const sponsorRaw = record["Has Named Sponsor"];
      const dataAvailRaw = record["Data Available For Engagement"];
      const ttpRaw = record["Time-to-Pilot (weeks)"] ?? record["Time To Pilot Weeks"];
      const hasNamedSponsor = typeof sponsorRaw === 'boolean' ? sponsorRaw : null;
      const dataAvailableForEngagement = typeof dataAvailRaw === 'boolean' ? dataAvailRaw : null;
      const timeToPilotWeeks = typeof ttpRaw === 'number' && !isNaN(ttpRaw) ? ttpRaw : null;

      // Sub-component scores — pass through if AI provided them; otherwise will be null
      const subComponents = record["Sub-Components"] && typeof record["Sub-Components"] === 'object'
        ? record["Sub-Components"]
        : null;

      const ttv = record["Time-to-Value (months)"] ?? record["Time-to-Value"] ?? 6;

      // Build record with new column order
      const orderedRecord: Record<string, any> = {
        "ID": record.ID,
        "Use Case": record["Use Case"],
        "Readiness Score": readinessV2,
        "Readiness Score v1": readinessResult.value,
        "Organizational Capacity": oc,
        "Data Availability & Quality": dq,
        "Technical Infrastructure": ti,
        "Governance": gov,
        "Has Named Sponsor": hasNamedSponsor,
        "Data Available For Engagement": dataAvailableForEngagement,
        "Time-to-Pilot (weeks)": timeToPilotWeeks,
        "Time To Value": ttv,
        "Monthly Tokens": tokenResult.monthlyTokens,
        "Runs/Month": record["Runs/Month"],
        "Input Tokens/Run": record["Input Tokens/Run"],
        "Output Tokens/Run": record["Output Tokens/Run"],
      };

      if (subComponents) orderedRecord["Sub-Components"] = subComponents;

      // Preserve Strategic Theme if present
      if (record["Strategic Theme"]) {
        orderedRecord["Strategic Theme"] = record["Strategic Theme"];
      }

      // Preserve v2.1 hard knockout fields from Step 6 so Step 7 can read them
      orderedRecord["Legally Prohibited"] = record["Legally Prohibited"] === true;
      orderedRecord["Technically Infeasible"] = record["Technically Infeasible"] === true;

      correctedStep6Data.push(orderedRecord);

      console.log(`[postProcessAnalysis] Readiness: ${record.ID} — OC=${oc} DQ=${dq} TI=${ti} GOV=${gov} → v1=${readinessResult.value} v2=${readinessV2} (preset=${sectorPreset}) sponsor=${hasNamedSponsor} data=${dataAvailableForEngagement} ttp=${timeToPilotWeeks}`);
    }

    step6.data = correctedStep6Data;
  }

  // ============================================
  // STEP 6 RECOVERY: Synthesize missing Step 6 records from Step 5 data
  // ============================================
  // The AI sometimes omits Step 6 entirely or generates fewer records than Step 5.
  // When Step 6 is missing, Step 7 priority scoring breaks because it depends on
  // readiness scores from Step 6. We recover by synthesizing Step 6 records with
  // conservative defaults for each Step 5 use case.

  if (correctedStep5Data.length > 0) {
    const synthesizeStep6Record = (s5: Step5Record): Record<string, any> => {
      // A3: token estimator overhaul. The legacy flat 800/800 default
      // grossly undercounted realistic agentic Claude workloads. Instead we
      // derive a defensible estimate from the use-case record's structural
      // signals (multi-agent, RAG, tool use, complexity keywords).
      const tokenEstimate = estimateFromUseCaseRecord(s5);
      const inputTokens = tokenEstimate.inputTokens;
      const outputTokens = tokenEstimate.outputTokens;
      const runsPerMonth = 1000;
      const monthlyTokens = runsPerMonth * (inputTokens + outputTokens);
      const tokenResult = hfCalculateTokenCost({
        runsPerMonth,
        inputTokensPerRun: inputTokens,
        outputTokensPerRun: outputTokens,
      });
      totalMonthlyTokens += monthlyTokens;
      const oc = 5, dq = 5, ti = 5, gov = 5;
      const readinessV2 = computeWeightedReadiness(
        { orgCapacity: oc, dataReadiness: dq, governance: gov, techInfrastructure: ti },
        sectorPreset,
      );
      const record: Record<string, any> = {
        "ID": s5.ID,
        "Use Case": s5["Use Case"],
        "Readiness Score": readinessV2,
        "Organizational Capacity": oc,
        "Data Availability & Quality": dq,
        "Technical Infrastructure": ti,
        "Governance": gov,
        "Time To Value": 6,
        "Has Named Sponsor": false,
        "Data Available For Engagement": false,
        "Time-to-Pilot (weeks)": 12,
        "Monthly Tokens": monthlyTokens,
        "Runs/Month": runsPerMonth,
        "Input Tokens/Run": inputTokens,
        "Output Tokens/Run": outputTokens,
        // v2.2 hard knock-out fields — match the non-synthesized path at the
        // end of the readiness loop so the staleness checker
        // (`missing-step6-knockout-fields`) does not re-flag synthesized
        // reports on every backfill run.
        "Legally Prohibited": false,
        "Technically Infeasible": false,
      };
      if (s5["Strategic Theme"]) {
        record["Strategic Theme"] = s5["Strategic Theme"];
      }
      return record;
    };

    if (!step6 || !step6.data || (step6.data as any[]).length === 0) {
      // Case 1: Step 6 is entirely missing or empty — create from Step 5
      const synthesizedStep6 = correctedStep5Data.map(synthesizeStep6Record);
      if (!step6) {
        const newStep6 = {
          step: 6,
          title: "Readiness & Token Modeling",
          content: "Synthesized from Step 5 use cases with conservative default readiness scores and token estimates.",
          data: synthesizedStep6,
        };
        steps.push(newStep6);
        step6 = newStep6;
      } else {
        step6.data = synthesizedStep6;
      }
      console.warn(`[postProcessAnalysis] Step 6 recovery: created all ${synthesizedStep6.length} records from Step 5 (Step 6 was missing/empty)`);
    } else if (step6?.data && Array.isArray(step6.data)) {
      // Case 2: Step 6 exists but may be incomplete — fill in missing records
      const step6IDs = new Set((step6.data as any[]).map((r: any) => r.ID));
      let recoveredCount = 0;
      for (const s5 of correctedStep5Data) {
        if (!step6IDs.has(s5.ID)) {
          (step6.data as any[]).push(synthesizeStep6Record(s5));
          recoveredCount++;
        }
      }
      if (recoveredCount > 0) {
        console.warn(`[postProcessAnalysis] Step 6 recovery: synthesized ${recoveredCount} missing records from Step 5 (total now: ${(step6.data as any[]).length})`);
      }
    }
  }

  // ============================================
  // STEP 7 RECOVERY: Synthesize missing records from Step 5 data
  // ============================================
  // The AI sometimes generates incomplete Step 7 data (fewer records than Steps 4/5/6).
  // When this happens, synthesize the missing Step 7 records so the recalculation loop
  // processes all use cases. The recalculation block fills in Priority Score, Readiness
  // Score, Value Score, TTV Score, Tier, and Phase from Step 5/6 data.

  // Case 1: Step 7 exists but is incomplete
  if (step7?.data && Array.isArray(step7.data) && correctedStep5Data.length > 0) {
    const step7IDs = new Set((step7.data as Step7Record[]).map(r => r.ID));
    let recoveredCount = 0;

    for (const s5 of correctedStep5Data) {
      if (!step7IDs.has(s5.ID)) {
        (step7.data as Step7Record[]).push({
          ID: s5.ID,
          "Use Case": s5["Use Case"],
          "Strategic Theme": s5["Strategic Theme"],
        });
        recoveredCount++;
      }
    }

    if (recoveredCount > 0) {
      console.log(`[postProcessAnalysis] Step 7 recovery: synthesized ${recoveredCount} missing records from Step 5 (total now: ${(step7.data as any[]).length})`);
    }
  }

  // Case 2: Step 7 is missing entirely or empty — create from Step 5
  // VRM v2.1 — engagement config + portfolio diagnostic outer scope so the
  // vrm metadata block at the end of postprocessing always has well-defined values.
  let engagementCfg: EngagementConfig = resolveEngagementConfig(
    (analysisResult as any).engagementConfig,
  );
  let portfolioDiagnostic: ReturnType<typeof computePortfolioDiagnostic> | null = null;
  // Hoisted to outer scope so the v2.2 vrm metadata block (built below) can
  // reference it even when the conditional that populates it is skipped — and
  // so it's defined under strict mode regardless of code path.
  let portfolioDiagnosticV22:
    | ReturnType<typeof computePortfolioDiagnosticV22>
    | null = null;

  let step7Active = step7;
  if ((!step7Active || !step7Active.data || (step7Active.data as any[]).length === 0) && correctedStep5Data.length > 0) {
    const synthesizedStep7: Step7Record[] = correctedStep5Data.map(s5 => ({
      ID: s5.ID,
      "Use Case": s5["Use Case"],
      "Strategic Theme": s5["Strategic Theme"],
    }));

    if (!step7Active) {
      const newStep7 = { step: 7, title: "Priority Scoring & Roadmap", content: "", data: synthesizedStep7 };
      steps.push(newStep7);
      step7Active = newStep7;
    } else {
      step7Active.data = synthesizedStep7;
    }
    console.log(`[postProcessAnalysis] Step 7 recovery: created all ${synthesizedStep7.length} records from Step 5`);
  }

  // Recalculate Step 7 priority scores using new formula:
  //   Priority = (Readiness Score × 0.5) + (Normalized Value × 0.5)
  //   Both on 1-10 scale, so Priority is 1-10
  //   Value normalization: min-max across all use cases in this report
  if (step7Active?.data && Array.isArray(step7Active.data) && step6?.data) {
    // Step 1: Compute EV/friction ratios for friction-based value scoring
    // Value Score = (Expected Value / Friction Annual Cost), normalized 1-10 via min-max
    const allRatios: number[] = [];
    const ratioByUseCase: Record<string, number> = {};

    for (const record of step7Active.data as Step7Record[]) {
      const step5Record = correctedStep5Data.find(r => r.ID === record.ID);
      const step4Record = step4?.data ? (step4.data as any[]).find((r: any) => r.ID === record.ID) : null;

      // Expected Value = Total Annual Value × Probability of Success
      const totalValue = step5Record ? parseNumber(step5Record["Total Annual Value ($)"]) : 0;
      const probability = step5Record ? parseNumber(step5Record["Probability of Success (0-1)"]) || parseNumber(step5Record["Probability of Success"]) || 0.7 : 0.7;
      const expectedValue = totalValue * probability;

      // Get friction cost from the friction-to-use-case mapping
      const targetFriction = step4Record?.["Target Friction"]?.toString() || "";
      const frictionCost = frictionCostMap.get(targetFriction) || 0;

      const ratio = frictionCost > 0 ? expectedValue / frictionCost : 0;
      allRatios.push(ratio);
      ratioByUseCase[record.ID] = ratio;
    }

    // VRM v2.1 — log-transformed min-max normalization (replaces v2.0 plain min-max).
    // Smooths heavy-tailed EV/Friction distributions so a strong portfolio doesn't bunch at the low end.
    const step7Records = step7Active.data as Step7Record[];
    const orderedIds = step7Records.map(r => r.ID);
    const orderedRatios = orderedIds.map(id => ratioByUseCase[id] ?? 0);
    const normalizedArray = normalizeValueScores(orderedRatios);
    const normalizedByUseCase: Record<string, number> = {};
    const rawRatioByUseCase: Record<string, number> = {};
    orderedIds.forEach((id, idx) => {
      normalizedByUseCase[id] = normalizedArray[idx];
      rawRatioByUseCase[id] = orderedRatios[idx];
    });
    const minRatio = orderedRatios.length > 0 ? Math.min(...orderedRatios) : 0;
    const maxRatio = orderedRatios.length > 0 ? Math.max(...orderedRatios) : 0;
    console.log(`[postProcessAnalysis] Value Scores (v3 winsorized-percentile log-norm): raw EV/Friction range [${minRatio.toFixed(2)} - ${maxRatio.toFixed(2)}] → normalized [${Math.min(...normalizedArray).toFixed(2)} - ${Math.max(...normalizedArray).toFixed(2)}]`);

    // Step 2: Build corrected Step 7 data with new priority scoring
    const correctedStep7Data: any[] = [];

    // VRM v2.1 — Build the portfolio scoring set first so quadrant assignment can run cross-portfolio.
    // We carry forward absoluteAnnualValue, valueScoreRaw, and the new hard knock-out fields.
    const portfolioScorings: UseCaseScoringV21[] = step7Records.map(record => {
      const s5 = correctedStep5Data.find(r => r.ID === record.ID);
      const s6 = (step6.data as any[]).find(r => r.ID === record.ID);
      const r2 = s6?.["Readiness Score"] ?? 5;
      const v = normalizedByUseCase[record.ID] ?? 5.5;
      const totalAnnualValue = parseNumber(s5?.["Total Annual Value ($)"]);
      const probabilityRaw = parseNumber(s5?.["Probability of Success"]);
      const probabilityOfSuccess = probabilityRaw > 1 ? probabilityRaw / 100 : probabilityRaw;
      const absoluteAnnualValue = totalAnnualValue * (probabilityOfSuccess || 0);
      return {
        id: record.ID,
        valueScore: v,
        valueScoreRaw: rawRatioByUseCase[record.ID] ?? 0,
        absoluteAnnualValue,
        readinessScore: r2,
        componentScores: {
          orgCapacity: s6?.["Organizational Capacity"] ?? 5,
          dataReadiness: s6?.["Data Availability & Quality"] ?? 5,
          governance: s6?.["Governance"] ?? 5,
          techInfrastructure: s6?.["Technical Infrastructure"] ?? 5,
        },
        hasNamedSponsor: typeof s6?.["Has Named Sponsor"] === 'boolean' ? s6["Has Named Sponsor"] : null,
        dataAvailableForEngagement: typeof s6?.["Data Available For Engagement"] === 'boolean' ? s6["Data Available For Engagement"] : null,
        timeToPilotWeeks: typeof s6?.["Time-to-Pilot (weeks)"] === 'number' ? s6["Time-to-Pilot (weeks)"] : null,
        legallyProhibited: s6?.["Legally Prohibited"] === true,
        technicallyInfeasible: s6?.["Technically Infeasible"] === true,
      };
    });
    // v2.2 is the active path; v2.1 + v2.0 are preserved as shadow columns for
    // backward-compatible JSON consumers and any UI still keyed off them.
    const quadrantMap = assignPortfolioQuadrantsV21(portfolioScorings, engagementCfg);
    const quadrantMapV20 = assignPortfolioQuadrants(portfolioScorings as UseCaseScoring[]);
    const classificationMapV22 = assignClassificationsV22(portfolioScorings, engagementCfg);
    portfolioDiagnosticV22 = computePortfolioDiagnosticV22(portfolioScorings, classificationMapV22);
    portfolioDiagnostic = computePortfolioDiagnostic(portfolioScorings, quadrantMap, engagementCfg);
    console.log(`[postProcessAnalysis] VRM v2.2 diagnostic: ${portfolioDiagnosticV22.prototypingCandidatesCount} prototyping candidates / ${portfolioDiagnosticV22.totalUseCases} total (Champions=${portfolioDiagnosticV22.championCount}, Lead Champs=${portfolioDiagnosticV22.leadChampionCount}, QW=${portfolioDiagnosticV22.quickWinCount}, Strat=${portfolioDiagnosticV22.strategicCount}, Found=${portfolioDiagnosticV22.foundationCount}, Conditional=${portfolioDiagnosticV22.conditionalCount}). Warnings: ${portfolioDiagnosticV22.warnings.map(w => w.code).join(', ') || 'none'}.`);

    for (const record of step7Records) {
      const step6Record = (step6.data as any[]).find(r => r.ID === record.ID);
      const readinessScore = step6Record?.["Readiness Score"] ?? step6Record?.["Feasibility Score"] ?? 5;
      const normalizedValue = normalizedByUseCase[record.ID] ?? 5.5;
      const ttv = step6Record?.["Time To Value"] ?? step6Record?.["Time-to-Value"] ?? 6;

      // New priority: (Readiness × 0.5) + (Normalized Value × 0.5)
      const priorityResult = calculateNewPriorityScore({
        readinessScore,
        normalizedValue,
      });

      const ttvScore = calculateTTVBubbleScore(ttv as number);
      const v1Tier = getNewPriorityTier(priorityResult.value, normalizedValue, readinessScore);
      const phase = getNewRecommendedPhase(priorityResult.value, readinessScore);

      // VRM v2.2 classification (active path) — primary "Priority Tier" + Quadrant v2 alias.
      // VRM v2.1 + v2.0 retained as shadow columns for backward-compatible consumers.
      const v2 = quadrantMap.get(record.ID)!;
      const v20 = quadrantMapV20.get(record.ID);
      const v22 = classificationMapV22.get(record.ID)!;
      const v22Label = classificationLabelV22(v22);

      // v2.1 wave label kept for shadow Priority Tier v2.1 column
      const v21TierLabel = v2.wave
        ? `${QUADRANT_LABELS[v2.quadrant]} (${v2.wave})`
        : QUADRANT_LABELS[v2.quadrant];

      // Build record with new column order:
      // ID, Use Case, Priority Tier (v2.2), Recommended Phase, Priority Score, Readiness Score, Value Score, TTV Score
      const step7Entry: Record<string, any> = {
        "ID": record.ID,
        "Use Case": record["Use Case"],
        "Priority Tier": v22Label,
        "Priority Tier v2.1": v21TierLabel,
        "Priority Tier v1": v1Tier,
        "Quadrant v2.2": v22.quadrant,
        "Tier v2.2": v22.tier,
        "Is Conditional v2.2": v22.isConditional,
        "Conditional Gap v2.2": v22.conditionalGap ?? null,
        "Quadrant v2.1": v2.quadrant,
        "Quadrant v2.0": v20?.quadrant ?? v2.quadrant,
        "Quadrant v2": v22.quadrant, // legacy alias now reflects v2.2 (active geometry)
        "Quadrant Layer": v2.layer,
        "Quadrant Rationale": v22.rationale,
        "Quadrant Rationale v2.1": v2.rationale,
        "Recommended Phase": phase,
        "Priority Score": priorityResult.value,
        "Readiness Score": readinessScore,
        "Value Score": normalizedValue,
        "Value Score Raw": Math.round((rawRatioByUseCase[record.ID] ?? 0) * 100) / 100,
        "Absolute Annual Value ($)": Math.round((portfolioScorings.find(p => p.id === record.ID)?.absoluteAnnualValue) ?? 0),
        "TTV Score": Math.round(ttvScore * 100) / 100,
      };

      // Hard/soft floor failures: prefer v2.2 (same evaluation, more recent semantics).
      const hardFailures = v22.hardFailures ?? v2.hardFailures ?? [];
      const softBlockers = v22.softBlockers ?? v2.softBlockers ?? [];
      if (hardFailures.length > 0) {
        step7Entry["Hard Knock-Out Reasons"] = hardFailures;
        step7Entry["Floor Failure Reasons"] = hardFailures; // backward compat
      }
      if (softBlockers.length > 0) {
        step7Entry["Soft Blockers"] = softBlockers;
      }

      // Conditional Champion Meta — synthesize from v2.2 safety-net promotion if applicable;
      // otherwise fall back to v2.1's metadata. Sprint sized 4-12 weeks based on largest gap.
      if (v22.isConditional && v22.conditionalGap) {
        const gv = v22.conditionalGap.gapToChampion.v;
        const gr = v22.conditionalGap.gapToChampion.r;
        const maxGap = Math.max(gv, gr);
        const sprintWeeks = Math.max(4, Math.min(12, 4 + Math.ceil(maxGap * 2)));
        const gaps: { component: string; current: number; required: number }[] = [];
        if (gv > 0) {
          gaps.push({ component: "Value Score", current: Math.round(normalizedValue * 10) / 10, required: QUADRANT_CUT });
        }
        if (gr > 0) {
          gaps.push({ component: "Readiness Score", current: Math.round(readinessScore * 10) / 10, required: QUADRANT_CUT });
        }
        step7Entry["Conditional Champion Meta"] = {
          proposedSprintWeeks: sprintWeeks,
          gaps,
          fromQuadrant: v22.conditionalGap.fromQuadrant,
          source: "v2.2-safety-net",
        };
      } else if (v2.conditionalChampionMeta) {
        step7Entry["Conditional Champion Meta"] = v2.conditionalChampionMeta;
      }
      if (v2.wave) {
        step7Entry["Wave"] = v2.wave;
      }

      // Preserve Strategic Theme if present
      if (record["Strategic Theme"]) {
        step7Entry["Strategic Theme"] = record["Strategic Theme"];
      }

      correctedStep7Data.push(step7Entry);

      console.log(`[postProcessAnalysis] Priority: ${record.ID} — Readiness=${readinessScore} Value=${normalizedValue} → Priority=${priorityResult.value} → v1=${v1Tier} v2=${v2.quadrant} (Layer ${v2.layer}, ${phase})`);
    }

    correctedStep7Data.sort((a: any, b: any) => {
      // v2.2 ordering: Lead Champion → Champion → Champion (Conditional) → Lead Quick Win → Quick Win → Strategic → Foundation
      const tierRank = (t: string) => {
        if (!t) return 99;
        if (t.includes('Champion (Lead)')) return 1;
        if (t.includes('Champion (Conditional)') || t.includes('Conditional Champion')) return 3;
        if (t.includes('Champion')) return 2;
        if (t.includes('Quick Win (Lead)')) return 4;
        if (t.includes('Quick Win')) return 5;
        if (t.includes('Strategic')) return 6;
        return 7;
      };
      const ta = tierRank(a["Priority Tier"]);
      const tb = tierRank(b["Priority Tier"]);
      if (ta !== tb) return ta - tb;
      return (b["Priority Score"] || 0) - (a["Priority Score"] || 0);
    });

    step7Active.data = correctedStep7Data;
  }

  // ============================================
  // STEP 7: POST-PROCESSING - THREE-SCENARIO SUMMARY & NPV
  // ============================================
  let totalAnnualValue = totalCostBenefit + totalRevenueBenefit + totalCashFlowBenefit + totalRiskBenefit;

  // Generate three-scenario summary
  const scenarioSummary = generateThreeScenarioSummary({
    baseBenefitAtFullAdoption: totalAnnualValue,
    implementationCost: totalFrictionCost * 0.5, // Use 50% of friction cost as proxy for implementation cost
  });

  // Calculate multi-year projection (5-year NPV and payback)
  const multiYearProjection = calculateMultiYearProjection({
    annualBenefit: totalAnnualValue,
    implementationCost: totalFrictionCost * 0.5,
  });

  console.log(`[postProcessAnalysis] Three-Scenario Summary: ${scenarioSummary.headline}`);
  console.log(`[postProcessAnalysis] NPV (5-year): ${formatMoney(multiYearProjection.npv)}, Payback: ${multiYearProjection.paybackMonths} months`);

  // A2: Aggregate realism gates. These flag CFO-killer numbers (IRR > 100%,
  // payback under 3 months, total annual value > 2% of company revenue) so
  // they surface in the methodology integrity panel instead of silently
  // flowing into the executive dashboard.
  const realismFlags: RealismFlag[] = computeRealismFlags({
    totalAnnualValue,
    companyRevenue: annualRevenueFromStep0 > 0 ? annualRevenueFromStep0 : undefined,
    irr: multiYearProjection.irr,
    paybackMonths: multiYearProjection.paybackMonths,
  });
  if (realismFlags.length > 0) {
    console.warn(
      `[postProcessAnalysis] Realism flags: ${realismFlags
        .map((f) => `${f.severity}:${f.code}`)
        .join(", ")}`,
    );
    // Promote realism flags into the methodology integrity warnings stream.
    // PortfolioWarning severities are info|warning|critical, so map "warn" → "warning".
    for (const f of realismFlags) {
      integrityWarnings.push({
        severity: f.severity === "warn" ? "warning" : "critical",
        code: f.code,
        message: f.message,
        recommendedAction: f.remediation,
      });
    }
  }

  // ============================================
  // IRR / PAYBACK DISPLAY CLAMPS (Task #107).
  //
  // CFO-killer numbers (IRR > 200%, payback < 6 months) lose all credibility
  // on slide one. We clamp the *displayed* values to a qualitative band
  // ("200%+", "<6 mo") and preserve the raw values in dedicated audit-trail
  // fields (`irrRaw`, `paybackMonthsRaw`) so the methodology integrity panel
  // and exports can still show them. Computed BEFORE the vrm-block return so
  // the warnings end up in vrm.diagnostic.warnings.
  // ============================================
  let rawIrr = multiYearProjection.irr;
  let rawPayback = multiYearProjection.paybackMonths;
  const IRR_DISPLAY_CEILING = 2.0; // 200%
  const PAYBACK_DISPLAY_FLOOR_MONTHS = 6;

  let irrDisplay: string;
  if (rawIrr === null || !Number.isFinite(rawIrr)) {
    irrDisplay = "N/A";
  } else if (rawIrr > IRR_DISPLAY_CEILING) {
    irrDisplay = `${(IRR_DISPLAY_CEILING * 100).toFixed(0)}%+`;
    integrityWarnings.push({
      severity: "warning",
      code: "IRR_DISPLAY_CLAMPED",
      message: `IRR clamped from ${(rawIrr * 100).toFixed(0)}% to "${irrDisplay}" for executive display. Raw value preserved in audit trail.`,
      recommendedAction:
        "An IRR above 200% is rarely defensible to a CFO. Verify implementation cost includes change management, integration, and ongoing operational overhead.",
    });
  } else {
    irrDisplay = `${(rawIrr * 100).toFixed(1)}%`;
  }

  let paybackDisplay: number | string = rawPayback;
  if (typeof rawPayback === "number" && rawPayback >= 0 && rawPayback < PAYBACK_DISPLAY_FLOOR_MONTHS) {
    paybackDisplay = `<${PAYBACK_DISPLAY_FLOOR_MONTHS} mo`;
    integrityWarnings.push({
      severity: "warning",
      code: "PAYBACK_DISPLAY_CLAMPED",
      message: `Payback clamped from ${rawPayback} months to "${paybackDisplay}" for executive display. Raw value preserved in audit trail.`,
      recommendedAction:
        "Sub-6-month payback usually means implementation cost is understated. Confirm the cost basis is fully loaded.",
    });
  }

  // ============================================
  // CFO REALITY CHECK (Task #107 follow-up) — independent verification.
  //
  // Runs an independent believability check (does NOT share assumptions
  // with the calculation engine) against industry-typical year-1 AI
  // program ranges. When the moderate scenario is flagged IMPLAUSIBLE,
  // every pillar is uniformly scaled down so the moderate scenario lands
  // on the believable midline (~0.75% of revenue). Per-UC totals are
  // recomputed and a structured `cfoRealityCheck` block is attached to
  // the output for the executive panel and audit trail.
  // ============================================
  let cfoRealityCheckResult: ReturnType<typeof runCfoRealityCheck> | null = null;
  let preCfoRescale: {
    totalAnnualValue: number;
    totalCostBenefit: number;
    totalRevenueBenefit: number;
    totalCashFlowBenefit: number;
    totalRiskBenefit: number;
    moderateScenario: number;
    irr: number | null;
    paybackMonths: number | string;
    irrDisplay: string;
    paybackDisplay: number | string;
  } | null = null;
  try {
    if (annualRevenueFromStep0 > 0) {
      const ucList = (correctedStep5Data as any[]).map((r) => ({
        id: String(r.ID || ""),
        totalAnnualValue: parseNumber(r["Total Annual Value ($)"]),
      }));
      const check = runCfoRealityCheck({
        totalAnnualValue,
        totalCostBenefit,
        totalRevenueBenefit,
        totalCashFlowBenefit,
        totalRiskBenefit,
        companyAnnualRevenue: annualRevenueFromStep0,
        scenarios: {
          conservative: scenarioSummary.conservative.totalBenefit,
          moderate: scenarioSummary.moderate.totalBenefit,
          aggressive: scenarioSummary.aggressive.totalBenefit,
        },
        perUseCase: ucList,
      });
      cfoRealityCheckResult = check;

      // Push every finding into the integrity warnings stream.
      for (const f of check.findings) {
        integrityWarnings.push({
          severity: f.verdict === "IMPLAUSIBLE" ? "critical" : "warning",
          code: f.code,
          message: f.message,
          recommendedAction: f.recommendedAction,
        });
      }

      // If moderate scenario is IMPLAUSIBLE, scale all four pillars
      // uniformly so the canonical totals re-center on the CFO-believable
      // midline. Mirrors the PORTFOLIO_TOTAL_VS_REVENUE_CAP pattern: scale
      // per-UC values, append a prorate annotation to each non-zero
      // formula string, recompute Total Annual Value / EV per row, and
      // re-derive scenario / multi-year / IRR off the new base.
      const cfoScale = check.recommendedScale;
      if (cfoScale > 0 && cfoScale < 1) {
        // Snapshot the pre-rescale figures so the audit panel can show
        // both the original and the post-rescale numbers.
        preCfoRescale = {
          totalAnnualValue,
          totalCostBenefit,
          totalRevenueBenefit,
          totalCashFlowBenefit,
          totalRiskBenefit,
          moderateScenario: scenarioSummary.moderate.totalBenefit,
          irr: rawIrr,
          paybackMonths: rawPayback,
          irrDisplay,
          paybackDisplay,
        };
        let nCost = 0, nRev = 0, nCf = 0, nRisk = 0;
        for (let i = 0; i < correctedStep5Data.length; i++) {
          const rec = correctedStep5Data[i] as any;
          const oCost = parseNumber(rec["Cost Benefit ($)"]);
          const oRev = parseNumber(rec["Revenue Benefit ($)"]);
          const oCf = parseNumber(rec["Cash Flow Benefit ($)"]);
          const oRisk = parseNumber(rec["Risk Benefit ($)"]);
          const sCost = Math.floor(oCost * cfoScale);
          const sRev = Math.floor(oRev * cfoScale);
          const sCf = Math.floor(oCf * cfoScale);
          const sRisk = Math.floor(oRisk * cfoScale);
          nCost += sCost; nRev += sRev; nCf += sCf; nRisk += sRisk;
          if (oCost > 0) {
            rec["Cost Benefit ($)"] = formatMoney(sCost);
            const f = String(rec["Cost Formula"] || "");
            if (f) rec["Cost Formula"] = f + ` × ${cfoScale.toFixed(6)} (CFO reality check) → ${formatMoney(sCost)}`;
          }
          if (oRev > 0) {
            rec["Revenue Benefit ($)"] = formatMoney(sRev);
            const f = String(rec["Revenue Formula"] || "");
            if (f) rec["Revenue Formula"] = f + ` × ${cfoScale.toFixed(6)} (CFO reality check) → ${formatMoney(sRev)}`;
          }
          if (oCf > 0) {
            rec["Cash Flow Benefit ($)"] = formatMoney(sCf);
            const f = String(rec["Cash Flow Formula"] || "");
            if (f) rec["Cash Flow Formula"] = f + ` × ${cfoScale.toFixed(6)} (CFO reality check) → ${formatMoney(sCf)}`;
          }
          if (oRisk > 0) {
            rec["Risk Benefit ($)"] = formatMoney(sRisk);
            const f = String(rec["Risk Formula"] || "");
            if (f) rec["Risk Formula"] = f + ` × ${cfoScale.toFixed(6)} (CFO reality check) → ${formatMoney(sRisk)}`;
          }
          const newTotal = sCost + sRev + sCf + sRisk;
          const probSuccess = parseNumber(rec["Probability of Success"]) || 0.75;
          rec["Total Annual Value ($)"] = formatMoney(newTotal);
          rec["Expected Value ($)"] = formatMoney(newTotal * probSuccess);
          const ve = useCaseBenefitsForValidation.find((v) => v.id === rec.ID);
          if (ve) {
            ve.costBenefit = sCost; ve.revenueBenefit = sRev;
            ve.cashFlowBenefit = sCf; ve.riskBenefit = sRisk;
            (ve as any).totalAnnualValue = newTotal;
          }
        }
        totalCostBenefit = nCost;
        totalRevenueBenefit = nRev;
        totalCashFlowBenefit = nCf;
        totalRiskBenefit = nRisk;
        // Re-derive totals + scenarios + multi-year off the new base.
        totalAnnualValue = totalCostBenefit + totalRevenueBenefit + totalCashFlowBenefit + totalRiskBenefit;
        const newScenarioSummary = generateThreeScenarioSummary({
          baseBenefitAtFullAdoption: totalAnnualValue,
          implementationCost: totalFrictionCost * 0.5,
        });
        scenarioSummary.conservative = newScenarioSummary.conservative;
        scenarioSummary.moderate = newScenarioSummary.moderate;
        scenarioSummary.aggressive = newScenarioSummary.aggressive;
        const newMyp = calculateMultiYearProjection({
          annualBenefit: totalAnnualValue,
          implementationCost: totalFrictionCost * 0.5,
        });
        multiYearProjection.npv = newMyp.npv;
        multiYearProjection.irr = newMyp.irr;
        multiYearProjection.paybackMonths = newMyp.paybackMonths;
        multiYearProjection.totalBenefitOverPeriod = newMyp.totalBenefitOverPeriod;

        // Re-derive IRR/payback display values off the rescaled
        // multi-year projection. Without this the response would carry
        // pre-rescale display strings while every other figure
        // reflected the rescaled portfolio.
        rawIrr = newMyp.irr;
        rawPayback = newMyp.paybackMonths;
        if (rawIrr === null || !Number.isFinite(rawIrr)) {
          irrDisplay = "N/A";
        } else if (rawIrr > IRR_DISPLAY_CEILING) {
          irrDisplay = `${(IRR_DISPLAY_CEILING * 100).toFixed(0)}%+`;
        } else {
          irrDisplay = `${(rawIrr * 100).toFixed(1)}%`;
        }
        if (typeof rawPayback === "number" && rawPayback >= 0 && rawPayback < PAYBACK_DISPLAY_FLOOR_MONTHS) {
          paybackDisplay = `<${PAYBACK_DISPLAY_FLOOR_MONTHS} mo`;
        } else {
          paybackDisplay = rawPayback;
        }

        integrityWarnings.push({
          severity: "critical",
          code: "CFO_REALITY_RESCALE",
          message:
            `CFO reality check rescaled the portfolio by ${cfoScale.toFixed(3)}× ` +
            `(moderate scenario was IMPLAUSIBLE at ${(scenarioSummary.moderate.totalBenefit / annualRevenueFromStep0 * 100).toFixed(2)}% ` +
            `of revenue; rebased to land on the believable ~0.75% midline). All four pillars and scenario / NPV / IRR figures were re-derived.`,
          recommendedAction:
            "The headline now reflects an independently-verified CFO-believable target. The pre-rescale figures are preserved at the top-level `preCfoRescale` field for the audit trail.",
        });
      }
    }
  } catch (err) {
    console.warn("[postProcessAnalysis] CFO reality check skipped:", err);
  }

  // ============================================
  // HEADLINE RECONCILIATION OVERRIDE (Task #107).
  //
  // The LLM-authored `executiveSummary.headline` embeds dollar figures (e.g.
  // "$420M in first-year value"). When the LLM hallucinates these — or when
  // post-processing reshapes totals (portfolio caps) — the headline can
  // diverge from canonical scenarioSummary by > 10%. That is the single most
  // common CFO-killer: slide 1 says one number, slide 5 says another. We
  // override the headline with canonical numbers and emit a
  // HEADLINE_RECONCILIATION_OVERRIDE warning. Mutates analysisResult so the
  // override flows through `...analysisResult` in the return.
  // ============================================
  try {
    // Canonical reference is `totalAnnualValue` — the post-processed rollup
    // that flows into every downstream surface (executive dashboard,
    // exports, scenarios). This is the single source of truth the headline
    // must agree with on slide 1.
    const canonicalFirstYear = totalAnnualValue;
    const exec = (analysisResult as any).executiveSummary;
    if (exec && typeof exec.headline === "string" && exec.headline.length > 0) {
      const dollarFigures = parseDollarFiguresFromHeadline(exec.headline);
      if (dollarFigures.length > 0 && canonicalFirstYear > 0) {
        const llmFirstYear = dollarFigures[0];
        const divergence = Math.abs(llmFirstYear - canonicalFirstYear) / canonicalFirstYear;
        // ONE-WAY override: only rewrite the headline when the LLM
        // **exaggerated upward** vs canonical (LLM > canonical by > 10%).
        // When the LLM is more conservative than canonical, do NOT replace
        // — that situation almost always means canonical is the inflated
        // figure (the very Constellation Energy regression that triggered
        // this follow-up). Instead emit an audit warning so the
        // methodology panel surfaces the gap.
        const llmExceedsCanonical = llmFirstYear > canonicalFirstYear;
        if (divergence > 0.10 && !llmExceedsCanonical) {
          integrityWarnings.push({
            severity: "warning",
            code: "HEADLINE_LLM_MORE_CONSERVATIVE",
            message:
              `Executive-summary headline (${formatMoney(llmFirstYear)}) is ` +
              `${(divergence * 100).toFixed(0)}% lower than canonical totals ` +
              `(${formatMoney(canonicalFirstYear)}). Headline NOT overridden — ` +
              `the LLM's conservative figure was preserved because canonical-above-LLM ` +
              `is usually a sign that the post-processor inflated totals, not that the LLM hallucinated.`,
            recommendedAction:
              "Investigate why the canonical rollup exceeds the LLM's narrative. Common causes: working-capital double-counting that the portfolio caps did not catch, or a use case whose probability weighting was set too high.",
          });
        } else if (divergence > 0.10) {
          const originalHeadline = exec.headline;
          exec.headlineLLMOriginal = originalHeadline;
          exec.headline =
            `Canonical first-year value: ${formatMoney(canonicalFirstYear)} ` +
            `(LLM-stated ${formatMoney(llmFirstYear)} differed by ${(divergence * 100).toFixed(0)}%; ` +
            `using post-processed canonical figure).`;
          integrityWarnings.push({
            severity: "warning",
            code: "HEADLINE_RECONCILIATION_OVERRIDE",
            message:
              `Executive-summary headline diverged from canonical first-year value by ` +
              `${(divergence * 100).toFixed(0)}% (LLM said ${formatMoney(llmFirstYear)}, ` +
              `canonical is ${formatMoney(canonicalFirstYear)}). Headline overridden.`,
            recommendedAction:
              "The original LLM headline is preserved at executiveSummary.headlineLLMOriginal. Review why the model's narrative diverged — usually because portfolio caps reshaped the totals after the LLM wrote the summary.",
          });
        }
      }
    }
  } catch (err) {
    console.warn("[postProcessAnalysis] Headline reconciliation skipped:", err);
  }

  // ============================================
  // Update executive dashboard with deterministic calculations
  // ============================================

  // Use the deterministic value per million tokens function
  const valuePerMillion = calculateValuePerMillionTokens({
    totalAnnualValue,
    totalMonthlyTokens,
  });

  // Get top 10 use cases sorted by Tier (descending: Champions first) then Priority Score
  const tierRankForSort = (t: string) => {
    if (!t) return 5;
    if (t.includes('Conditional Champion')) return 2;
    if (t.includes('Champion')) return 1;
    if (t.includes('Quick Win')) return 3;
    if (t.includes('Strategic')) return 4;
    return 5;
  };
  const sortedUseCases = [...(step7Active?.data || step7?.data || [])].sort(
    (a: any, b: any) => {
      const ta = tierRankForSort(a["Priority Tier"]);
      const tb = tierRankForSort(b["Priority Tier"]);
      if (ta !== tb) return ta - tb;
      return (b["Priority Score"] || 0) - (a["Priority Score"] || 0);
    }
  );

  const topUseCases = sortedUseCases.slice(0, 10).map((uc: any, index: number) => {
    const step5Record = correctedStep5Data.find(r => r.ID === uc.ID);
    return {
      rank: index + 1,
      useCase: uc["Use Case"],
      priorityScore: uc["Priority Score"] || uc["Priority Score (0-100)"] || 0,
      priorityTier: uc["Priority Tier"] || "",
      monthlyTokens: (step6?.data as any[])?.find(r => r.ID === uc.ID)?.["Monthly Tokens"] || 0,
      annualValue: parseNumber(step5Record?.["Total Annual Value ($)"]),
    };
  });

  const validatedTotal = totalCostBenefit + totalRevenueBenefit + totalCashFlowBenefit + totalRiskBenefit;
  const validationSummary = {
    useCasesCapped,
    parametersClamped,
    portfolioScaleFactor: capScaleFactor,
    originalTotal,
    validatedTotal,
    details: validationWarnings,
  };

  console.log(`[postProcessAnalysis] Validation Summary: ${useCasesCapped} UCs capped, ${parametersClamped} params clamped, portfolio scale=${capScaleFactor.toFixed(3)}, original=${formatMoney(originalTotal)}, validated=${formatMoney(validatedTotal)}`);

  // VRM v2.2 metadata block — active geometry uses 5.5 quadrant cut + 7.5 lead-tier marker.
  // schemaVersion = 2.2; v2.1 + v2.0 readers can still pull legacy thresholds from this block.
  const vrmBlock = {
    schemaVersion: VRM_SCHEMA_VERSION,
    priorSchemaVersion: VRM_PRIOR_SCHEMA_VERSION_V21,
    priorSchemaVersionV20: VRM_PRIOR_SCHEMA_VERSION,
    rubricVersion: VRM_RUBRIC_VERSION,
    sectorPreset,
    sectorPresetLabel: SECTOR_PRESETS[sectorPreset].label,
    weights: getWeightsForPreset(sectorPreset),
    baselineWeights: BASELINE_WEIGHTS,
    engagementConfig: engagementCfg,
    quadrantThresholds: {
      // v2.2 active geometry
      cut: QUADRANT_CUT,
      leadTierCut: LEAD_TIER_CUT,
      minPrototypingCandidates: MIN_PROTOTYPING_CANDIDATES,
      // v2.1 / v2.0 shadow values for back-compat readers
      championMin: engagementCfg.championMin,
      quickStrategicMin: engagementCfg.quickStrategicMin,
      valueFloor: 6.0, // legacy alias for v2.0 readers
      maxTimeToPilotWeeks: engagementCfg.maxTimeToPilotWeeks,
      valueFloorBand: engagementCfg.valueFloor,
    },
    valueNormalization: "log10-percentile-winsorized",
    valueNormalizationVersion: VALUE_NORMALIZATION_VERSION,
    diagnostic: portfolioDiagnosticV22
      ? {
          ...portfolioDiagnosticV22,
          // Convenience aliases the existing UI is keyed off (v2.1 names)
          conditionalChampionCount: portfolioDiagnosticV22.conditionalCount,
          // Merge VRM warnings with structured integrity warnings (label-swap,
          // realism gates) so they all render in MethodologyIntegrityPanel.
          // Map to UI-friendly key names for the warnings (the UI reads `remediation`).
          warnings: ([
            ...(portfolioDiagnosticV22.warnings || []),
            ...integrityWarnings,
          ]).map((w) => ({
            ...w,
            remediation: (w as any).recommendedAction ?? (w as any).remediation,
          })),
        }
      : null,
    // v2.1 diagnostic kept for any downstream consumer still reading the prior shape
    diagnosticV21: portfolioDiagnostic
      ? {
          ...portfolioDiagnostic,
          championCount: portfolioDiagnostic.byQuadrant.champion ?? 0,
          conditionalChampionCount: portfolioDiagnostic.byQuadrant.conditional_champion ?? 0,
          quickWinCount: portfolioDiagnostic.byQuadrant.quick_win ?? 0,
          strategicCount: portfolioDiagnostic.byQuadrant.strategic ?? 0,
          foundationCount: portfolioDiagnostic.byQuadrant.foundation ?? 0,
          foundationHardCount: Math.round(
            (portfolioDiagnostic.hardFloorFailureRate ?? 0) * (portfolioDiagnostic.totalUseCases ?? 0),
          ),
          foundationSoftCount: Math.max(
            0,
            (portfolioDiagnostic.byQuadrant.foundation ?? 0) -
              Math.round((portfolioDiagnostic.hardFloorFailureRate ?? 0) * (portfolioDiagnostic.totalUseCases ?? 0)),
          ),
          prototypingCandidatesPct:
            portfolioDiagnostic.totalUseCases > 0
              ? Math.round((portfolioDiagnostic.prototypingCandidatesCount / portfolioDiagnostic.totalUseCases) * 100)
              : 0,
          warnings: (portfolioDiagnostic.warnings || []).map((w) => ({
            ...w,
            remediation: (w as any).recommendedAction ?? (w as any).remediation,
          })),
        }
      : null,
  };

  const correctedResult = {
    ...analysisResult,
    steps,
    vrm: vrmBlock,
    validationWarnings,
    benefitsCapped,
    capScaleFactor,
    validationSummary,
    frictionRecovery: Array.from(frictionRecoveryMap.entries()).map(([friction, recoveries]) => ({
      frictionPoint: friction,
      recoveries,
    })),
    scenarioAnalysis: {
      conservative: {
        annualBenefit: formatMoney(scenarioSummary.conservative.totalBenefit),
        npv: formatMoney(scenarioSummary.conservative.npv),
        paybackMonths: scenarioSummary.conservative.paybackMonths,
      },
      moderate: {
        annualBenefit: formatMoney(scenarioSummary.moderate.totalBenefit),
        npv: formatMoney(scenarioSummary.moderate.npv),
        paybackMonths: scenarioSummary.moderate.paybackMonths,
      },
      aggressive: {
        annualBenefit: formatMoney(scenarioSummary.aggressive.totalBenefit),
        npv: formatMoney(scenarioSummary.aggressive.npv),
        paybackMonths: scenarioSummary.aggressive.paybackMonths,
      },
    },
    multiYearProjection: {
      npv: formatMoney(multiYearProjection.npv),
      paybackMonths: paybackDisplay,
      paybackMonthsRaw: rawPayback,
      irr: irrDisplay,
      irrRaw: rawIrr,
      totalBenefitOverPeriod: formatMoney(multiYearProjection.totalBenefitOverPeriod),
    },
    realismFlags,
    executiveDashboard: {
      totalRevenueBenefit,
      totalCostBenefit,
      totalCashFlowBenefit,
      totalRiskBenefit,
      totalAnnualValue,
      totalMonthlyTokens,
      valuePerMillionTokens: valuePerMillion.value,
      topUseCases,
    },
    cfoRealityCheck: cfoRealityCheckResult,
    preCfoRescale,
  };

  console.log(`[postProcessAnalysis] Dashboard totals: TotalValue=${formatMoney(totalAnnualValue)}, Cost=${formatMoney(totalCostBenefit)}, Revenue=${formatMoney(totalRevenueBenefit)}, CashFlow=${formatMoney(totalCashFlowBenefit)}, Risk=${formatMoney(totalRiskBenefit)}`);

  return correctedResult;
}

/**
 * Parse dollar figures (e.g. "$420M", "$1.2B", "$25,500,000") out of an
 * LLM-authored executive-summary headline. Used by the
 * HEADLINE_RECONCILIATION_OVERRIDE gate to catch divergence between the
 * narrative and the canonical post-processed totals.
 *
 * Returns figures in raw dollars, in the order they appear.
 */
function parseDollarFiguresFromHeadline(headline: string): number[] {
  const re = /\$\s*([\d,]+(?:\.\d+)?)\s*(B|M|K|billion|million|thousand)?/gi;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(headline)) !== null) {
    const raw = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(raw)) continue;
    const suffix = (m[2] || "").toLowerCase();
    let mult = 1;
    if (suffix === "b" || suffix === "billion") mult = 1e9;
    else if (suffix === "m" || suffix === "million") mult = 1e6;
    else if (suffix === "k" || suffix === "thousand") mult = 1e3;
    out.push(raw * mult);
  }
  return out;
}
