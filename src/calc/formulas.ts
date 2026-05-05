// src/calc/formulas.ts
// Deterministic Formula Registry for BlueAlly AI Calculations
// All monetary outputs must store a trace: formula + resolved inputs + intermediate steps
// REDESIGNED: Fixes cash flow formula, adds scenario support, benefits cap, NPV, adoption curves,
// 5-criterion priority scoring, friction-benefit linking, and input validation

import { getRoleRate, STANDARDIZED_BENEFITS_LOADING } from '../../shared/standardizedRoles';

export interface FormulaInput {
  [key: string]: number;
}

export interface FormulaTrace {
  formula: string;
  inputs: FormulaInput;
  intermediates?: Record<string, number>;
  output: number;
}

export interface CalculationResult {
  value: number;
  trace: FormulaTrace;
}

// ============================================================================
// SCENARIO SUPPORT
// ============================================================================
export type Scenario = 'conservative' | 'moderate' | 'aggressive';

export const SCENARIO_MULTIPLIERS: Record<Scenario, number> = {
  conservative: 0.60,
  moderate: 1.00,
  aggressive: 1.30,
};

// Adoption curves by scenario (Year 1 / Year 2 / Year 3)
export const ADOPTION_CURVES: Record<Scenario, { y1: number; y2: number; y3: number }> = {
  conservative: { y1: 0.25, y2: 0.50, y3: 0.70 },
  moderate:     { y1: 0.40, y2: 0.65, y3: 0.85 },
  aggressive:   { y1: 0.55, y2: 0.80, y3: 0.95 },
};

// ============================================================================
// INPUT VALIDATION BOUNDS
// ============================================================================
export const INPUT_BOUNDS = {
  hoursSaved:           { min: 0, max: 500_000, label: 'Hours Saved' },
  loadedHourlyRate:     { min: 35, max: 500, label: 'Loaded Hourly Rate' },
  upliftPct:            { min: 0, max: 0.05, label: 'Revenue Uplift %' },
  baselineRevenueAtRisk:{ min: 0, max: 500_000_000_000, label: 'Baseline Revenue at Risk' },
  daysImprovement:      { min: 0, max: 90, label: 'Days Improvement' },
  annualRevenue:        { min: 0, max: 500_000_000_000, label: 'Annual Revenue' },
  costOfCapital:        { min: 0.01, max: 0.25, label: 'Cost of Capital' },
  probBefore:           { min: 0, max: 1.0, label: 'Probability Before' },
  impactBefore:         { min: 0, max: 10_000_000_000, label: 'Impact Before' },
  probAfter:            { min: 0, max: 1.0, label: 'Probability After' },
  impactAfter:          { min: 0, max: 10_000_000_000, label: 'Impact After' },
  runsPerMonth:         { min: 0, max: 10_000_000, label: 'Runs per Month' },
  annualHours:          { min: 0, max: 500_000, label: 'Annual Hours' },
  riskExposure:         { min: 0, max: 5_000_000_000, label: 'Risk Exposure' },
  riskReductionPct:     { min: 0, max: 0.50, label: 'Risk Reduction %' },
  probabilityOfSuccess: { min: 0.40, max: 0.85, label: 'Probability of Success' },
} as const;

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  clampedInputs: Record<string, number>;
}

/**
 * Validate and clamp numeric inputs to reasonable bounds
 */
export function validateInputs(inputs: Record<string, number>, bounds: Record<string, { min: number; max: number; label: string }>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const clampedInputs: Record<string, number> = {};

  for (const [key, value] of Object.entries(inputs)) {
    const bound = bounds[key];
    if (!bound) {
      clampedInputs[key] = value;
      continue;
    }

    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(`${bound.label}: must be a valid number`);
      clampedInputs[key] = 0;
      continue;
    }

    if (value < bound.min) {
      warnings.push(`${bound.label}: ${value} below minimum ${bound.min}, clamped`);
      clampedInputs[key] = bound.min;
    } else if (value > bound.max) {
      warnings.push(`${bound.label}: ${value} above maximum ${bound.max}, clamped`);
      clampedInputs[key] = bound.max;
    } else {
      clampedInputs[key] = value;
    }
  }

  return { isValid: errors.length === 0, errors, warnings, clampedInputs };
}

// ============================================================================
// NAMED CONSTANTS (no more magic numbers)
// ============================================================================
export const ROUNDING = {
  BENEFIT_PRECISION: 1,         // No rounding — exact deterministic values
  FRICTION_PRECISION: 10_000,   // Round DOWN to nearest $10K
  TOKEN_DECIMALS: 2,            // Token costs: 2 decimal places
} as const;

/**
 * @deprecated Use calculateNewPriorityScore() instead.
 * Legacy 5-criterion priority weights on a 0-100 scale.
 */
export const PRIORITY_WEIGHTS = {
  strategicAlignment: 0.25,
  financialImpact: 0.25,
  implementationComplexity: 0.20,
  dataReadiness: 0.15,
  timeToValue: 0.15,
} as const;

/**
 * @deprecated Use NEW_PRIORITY_TIERS and getNewPriorityTier() instead.
 * Legacy 4-tier system with 80/60/40 thresholds on a 0-100 scale.
 */
export const PRIORITY_TIERS = {
  TIER_1: { min: 80, label: 'Tier 1 — Quick Win' },
  TIER_2: { min: 60, label: 'Tier 2 — Strategic' },
  TIER_3: { min: 40, label: 'Tier 3 — Foundation' },
  TIER_4: { min: 0,  label: 'Tier 4 — Horizon' },
} as const;

export const TTV_THRESHOLDS = {
  PERFECT_MONTHS: 3,   // 3 months or less = 100 score
  ZERO_MONTHS: 18,     // 18+ months = 0 score (changed from 12 to be more realistic)
} as const;

// Global default multipliers — documented with rationale
export const DEFAULT_MULTIPLIERS = {
  // Fully-loaded labor rate including wages, benefits, overhead
  loadedHourlyRate: 150,

  // Benefits loading factor: adds 35% for employer costs (taxes, benefits, space)
  benefitsLoading: 1.35,

  // Data maturity adjustment (Level 2 default = 0.75)
  // Level 1: 0.60, Level 2: 0.75, Level 3: 0.85, Level 4: 0.95, Level 5: 1.00
  dataMaturityMultiplier: 0.75,

  // Driver-specific realization multipliers (confidence in benefit type)
  // Revenue: 95% — most measurable, tied to pipeline/bookings
  revenueRealizationMultiplier: 0.95,
  // Cost: 90% — requires adoption tracking, some leakage expected
  costRealizationMultiplier: 0.90,
  // Cash Flow: 85% — working capital is harder to control precisely
  cashFlowRealizationMultiplier: 0.85,
  // Risk: 80% — most uncertain, actuarial nature
  riskRealizationMultiplier: 0.80,

  // Default cost of capital (WACC proxy) for cash flow calculations
  defaultCostOfCapital: 0.08,  // 8%

  // Token pricing (Claude 3.5 Sonnet defaults)
  inputTokenPricePerM: 3.00,
  outputTokenPricePerM: 15.00,

  // Benefits cap: maximum total benefits as % of annual revenue
  benefitsCapPct: 0.03,  // 3% of annual revenue — conservative, CFO-credible

  // Risk reduction cap: max reduction vs current exposure
  riskReductionCapPct: 0.08,  // 8% max risk reduction per use case
};

/**
 * Get the loaded hourly rate for a standardized role.
 * When using standardized roles, benefits loading should be 1.0
 * since the rate already includes all employer costs.
 */
export function getLoadedRateForRole(roleId: string, overrides?: Record<string, number>): {
  rate: number;
  benefitsLoading: number;
} {
  const rate = overrides?.[roleId] ?? getRoleRate(roleId);
  return {
    rate,
    benefitsLoading: STANDARDIZED_BENEFITS_LOADING, // 1.0 — rate is already fully loaded
  };
}

// ============================================================================
// DATA MATURITY LEVELS
// ============================================================================
export const DATA_MATURITY_LEVELS: Record<number, { label: string; multiplier: number }> = {
  1: { label: 'Ad-hoc (scattered, no governance)', multiplier: 0.60 },
  2: { label: 'Repeatable (some processes)', multiplier: 0.75 },
  3: { label: 'Defined (documented, some automation)', multiplier: 0.85 },
  4: { label: 'Managed (measured, controlled)', multiplier: 0.95 },
  5: { label: 'Optimizing (continuous improvement)', multiplier: 1.00 },
};

export function getDataMaturityMultiplier(level: number): number {
  const clamped = Math.max(1, Math.min(5, Math.round(level)));
  return DATA_MATURITY_LEVELS[clamped].multiplier;
}

// ============================================================================
// CORE BENEFIT FORMULAS
// ============================================================================

/**
 * Cost Benefit Calculation
 * FORMULA: Hours × Rate × BenefitsLoading × Realization × DataMaturity × ScenarioMultiplier
 */
export function calculateCostBenefit(inputs: {
  hoursSaved: number;
  loadedHourlyRate?: number;
  benefitsLoading?: number;
  costRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
}): CalculationResult {
  const {
    hoursSaved,
    loadedHourlyRate = DEFAULT_MULTIPLIERS.loadedHourlyRate,
    benefitsLoading = DEFAULT_MULTIPLIERS.benefitsLoading,
    costRealizationMultiplier = DEFAULT_MULTIPLIERS.costRealizationMultiplier,
    dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
    scenario = 'moderate',
  } = inputs;

  const scenarioMultiplier = SCENARIO_MULTIPLIERS[scenario];
  const rawValue = hoursSaved * loadedHourlyRate * benefitsLoading * costRealizationMultiplier * dataMaturityMultiplier * scenarioMultiplier;
  const roundedValue = Math.floor(rawValue / ROUNDING.BENEFIT_PRECISION) * ROUNDING.BENEFIT_PRECISION;

  return {
    value: roundedValue,
    trace: {
      formula: 'HoursSaved × LoadedRate × BenefitsLoading × Realization × DataMaturity × Scenario',
      inputs: { hoursSaved, loadedHourlyRate, benefitsLoading, costRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier },
      intermediates: { rawValue },
      output: rawValue,
    },
  };
}

/**
 * Revenue Benefit Calculation
 * FORMULA: UpliftPct × BaselineRevenue × Margin × Realization × DataMaturity × Scenario
 */
export function calculateRevenueBenefit(inputs: {
  upliftPct: number;
  baselineRevenueAtRisk: number;
  marginPct?: number;
  revenueRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
}): CalculationResult {
  const {
    upliftPct,
    baselineRevenueAtRisk,
    marginPct = 1.0,
    revenueRealizationMultiplier = DEFAULT_MULTIPLIERS.revenueRealizationMultiplier,
    dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
    scenario = 'moderate',
  } = inputs;

  // Cap uplift at INPUT_BOUNDS.upliftPct.max (5%) per use case — conservative.
  // The HyperFormula production path enforces the same cap inline; see
  // `hfCalculateRevenueBenefit` in src/calc/hyperformulaEngine.ts.
  const cappedUplift = Math.min(upliftPct, INPUT_BOUNDS.upliftPct.max);
  const scenarioMultiplier = SCENARIO_MULTIPLIERS[scenario];
  const rawValue = cappedUplift * baselineRevenueAtRisk * marginPct * revenueRealizationMultiplier * dataMaturityMultiplier * scenarioMultiplier;
  const roundedValue = Math.floor(rawValue / ROUNDING.BENEFIT_PRECISION) * ROUNDING.BENEFIT_PRECISION;

  return {
    value: roundedValue,
    trace: {
      formula: 'UpliftPct × BaselineRevenue × Margin × Realization × DataMaturity × Scenario',
      inputs: { upliftPct: cappedUplift, baselineRevenueAtRisk, marginPct, revenueRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier },
      intermediates: { rawValue },
      output: rawValue,
    },
  };
}

/**
 * Cash Flow Benefit Calculation — FIXED
 *
 * OLD (WRONG): DaysImprovement × DailyRevenue × Multipliers
 *   → Treated DSO as direct revenue (inflated 100-200x)
 *
 * NEW (CORRECT): AnnualRevenue × (DaysImprovement / 365) × CostOfCapital × Realization × DataMaturity × Scenario
 *   → Calculates financing cost saved by releasing working capital
 *
 * Example: $365M revenue, 15 days DSO improvement, 8% WACC
 *   Working capital freed = $365M × 15/365 = $15M
 *   Annual benefit = $15M × 8% = $1.2M (the financing cost saved)
 */
export function calculateCashFlowBenefit(inputs: {
  daysImprovement: number;
  annualRevenue: number;
  costOfCapital?: number;
  cashFlowRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
  // Legacy support: if dailyRevenue is provided instead of annualRevenue, convert
  dailyRevenue?: number;
}): CalculationResult {
  const {
    daysImprovement,
    costOfCapital = DEFAULT_MULTIPLIERS.defaultCostOfCapital,
    cashFlowRealizationMultiplier = DEFAULT_MULTIPLIERS.cashFlowRealizationMultiplier,
    dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
    scenario = 'moderate',
  } = inputs;

  // Handle legacy dailyRevenue input by converting to annualRevenue
  const annualRevenue = inputs.annualRevenue || (inputs.dailyRevenue ? inputs.dailyRevenue * 365 : 0);

  const scenarioMultiplier = SCENARIO_MULTIPLIERS[scenario];

  // CORRECT FORMULA: Working capital released × cost of capital
  const workingCapitalFreed = annualRevenue * (daysImprovement / 365);
  const annualFinancingSaved = workingCapitalFreed * costOfCapital;
  const rawValue = annualFinancingSaved * cashFlowRealizationMultiplier * dataMaturityMultiplier * scenarioMultiplier;
  const roundedValue = Math.floor(rawValue / ROUNDING.BENEFIT_PRECISION) * ROUNDING.BENEFIT_PRECISION;

  return {
    value: roundedValue,
    trace: {
      formula: 'AnnualRevenue × (DaysImprovement / 365) × CostOfCapital × Realization × DataMaturity × Scenario',
      inputs: { annualRevenue, daysImprovement, costOfCapital, cashFlowRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier },
      intermediates: { workingCapitalFreed, annualFinancingSaved, rawValue },
      output: rawValue,
    },
  };
}

/**
 * Risk Benefit Calculation
 * FORMULA: (ProbBefore × ImpactBefore - ProbAfter × ImpactAfter) × Realization × DataMaturity × Scenario
 * CAPPED at 50% of current exposure (probBefore × impactBefore)
 */
export function calculateRiskBenefit(inputs: {
  probBefore: number;
  impactBefore: number;
  probAfter: number;
  impactAfter: number;
  riskRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
}): CalculationResult {
  const {
    probBefore,
    impactBefore,
    probAfter,
    impactAfter,
    riskRealizationMultiplier = DEFAULT_MULTIPLIERS.riskRealizationMultiplier,
    dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
    scenario = 'moderate',
  } = inputs;

  const scenarioMultiplier = SCENARIO_MULTIPLIERS[scenario];
  const riskBefore = probBefore * impactBefore;
  const riskAfter = probAfter * impactAfter;
  const riskReduction = riskBefore - riskAfter;

  // CAP: Risk reduction cannot exceed 50% of current exposure
  const maxReduction = riskBefore * DEFAULT_MULTIPLIERS.riskReductionCapPct;
  const cappedReduction = Math.min(riskReduction, maxReduction);

  const rawValue = cappedReduction * riskRealizationMultiplier * dataMaturityMultiplier * scenarioMultiplier;
  const roundedValue = Math.floor(rawValue / ROUNDING.BENEFIT_PRECISION) * ROUNDING.BENEFIT_PRECISION;

  return {
    value: roundedValue,
    trace: {
      formula: 'min(RiskReduction, 8% of Exposure) × Realization × DataMaturity × Scenario',
      inputs: { probBefore, impactBefore, probAfter, impactAfter, riskRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier },
      intermediates: { riskBefore, riskAfter, riskReduction, maxReduction, cappedReduction, rawValue },
      output: rawValue,
    },
  };
}

// ============================================================================
// AGGREGATION WITH BENEFITS CAP
// ============================================================================

/**
 * Total Annual Value Calculation — WITH REVENUE CAP
 * FORMULA: min(Sum of all drivers, annualRevenue × benefitsCapPct)
 */
export function calculateTotalAnnualValue(inputs: {
  costBenefit: number;
  revenueBenefit: number;
  cashFlowBenefit: number;
  riskBenefit: number;
  annualRevenue?: number;
  benefitsCapPct?: number;
}): CalculationResult & { isCapped: boolean; capAmount: number } {
  const {
    costBenefit,
    revenueBenefit,
    cashFlowBenefit,
    riskBenefit,
    annualRevenue = 0,
    benefitsCapPct = DEFAULT_MULTIPLIERS.benefitsCapPct,
  } = inputs;

  const sumBenefits = costBenefit + revenueBenefit + cashFlowBenefit + riskBenefit;
  const capAmount = annualRevenue > 0 ? annualRevenue * benefitsCapPct : Infinity;
  const cappedValue = Math.min(sumBenefits, capAmount);
  const isCapped = sumBenefits > capAmount;
  const roundedValue = Math.floor(cappedValue / ROUNDING.BENEFIT_PRECISION) * ROUNDING.BENEFIT_PRECISION;

  return {
    value: roundedValue,
    isCapped,
    capAmount: capAmount === Infinity ? 0 : capAmount,
    trace: {
      formula: isCapped
        ? `min(Sum of Drivers, ${(benefitsCapPct * 100).toFixed(0)}% of Revenue) — CAPPED`
        : 'CostBenefit + RevenueBenefit + CashFlowBenefit + RiskBenefit',
      inputs: { costBenefit, revenueBenefit, cashFlowBenefit, riskBenefit, annualRevenue, benefitsCapPct },
      intermediates: { sumBenefits, capAmount: capAmount === Infinity ? 0 : capAmount, isCapped: isCapped ? 1 : 0 },
      output: cappedValue,
    },
  };
}

// ============================================================================
// CROSS-USE-CASE VALIDATION (Common Sense Guardrails)
// ============================================================================

export interface CrossValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  metrics: {
    totalBenefitsVsRevenue: number;      // ratio
    totalFTESavingsVsHeadcount: number;  // ratio
    totalRevenueBenefitVsRevenue: number; // ratio
    benefitsCapped: boolean;
    scaleFactor: number;                  // 1.0 if not scaled, <1.0 if capped
  };
}

export function crossValidateUseCases(inputs: {
  useCaseBenefits: Array<{
    costBenefit: number;
    revenueBenefit: number;
    cashFlowBenefit: number;
    riskBenefit: number;
    hoursSaved?: number;
  }>;
  annualRevenue: number;
  totalEmployees: number;
  benefitsCapPct?: number;
}): CrossValidationResult {
  const {
    useCaseBenefits,
    annualRevenue,
    totalEmployees,
    benefitsCapPct = DEFAULT_MULTIPLIERS.benefitsCapPct,
  } = inputs;

  const warnings: string[] = [];
  const errors: string[] = [];

  // Sum all benefits
  let totalCost = 0, totalRevenue = 0, totalCashFlow = 0, totalRisk = 0, totalHours = 0;
  for (const uc of useCaseBenefits) {
    totalCost += uc.costBenefit;
    totalRevenue += uc.revenueBenefit;
    totalCashFlow += uc.cashFlowBenefit;
    totalRisk += uc.riskBenefit;
    totalHours += uc.hoursSaved || 0;
  }

  const totalBenefits = totalCost + totalRevenue + totalCashFlow + totalRisk;
  const benefitsRatio = annualRevenue > 0 ? totalBenefits / annualRevenue : 0;
  const revenueRatio = annualRevenue > 0 ? totalRevenue / annualRevenue : 0;

  // Check: Total benefits vs revenue
  if (annualRevenue > 0 && benefitsRatio > benefitsCapPct) {
    warnings.push(`Total benefits ($${formatMoney(totalBenefits)}) exceed ${(benefitsCapPct * 100).toFixed(0)}% of annual revenue ($${formatMoney(annualRevenue)}). Benefits will be proportionally scaled.`);
  }

  // Check: Revenue benefits alone shouldn't exceed 30% of total revenue
  if (annualRevenue > 0 && revenueRatio > 0.30) {
    warnings.push(`Total revenue benefits ($${formatMoney(totalRevenue)}) exceed 30% of annual revenue. This may indicate double-counting across use cases.`);
  }

  // Check: FTE savings vs headcount
  const fteEquivalent = totalHours / 2080; // Standard annual hours per FTE
  const fteRatio = totalEmployees > 0 ? fteEquivalent / totalEmployees : 0;
  if (totalEmployees > 0 && fteRatio > 0.20) {
    warnings.push(`Total hours saved (${totalHours.toLocaleString()}) implies ${fteEquivalent.toFixed(0)} FTE equivalents — more than 20% of ${totalEmployees} employees. Verify for double-counting.`);
  }

  // Calculate scale factor if capping needed
  const cap = annualRevenue > 0 ? annualRevenue * benefitsCapPct : Infinity;
  const scaleFactor = totalBenefits > cap ? cap / totalBenefits : 1.0;

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
    metrics: {
      totalBenefitsVsRevenue: benefitsRatio,
      totalFTESavingsVsHeadcount: fteRatio,
      totalRevenueBenefitVsRevenue: revenueRatio,
      benefitsCapped: scaleFactor < 1.0,
      scaleFactor,
    },
  };
}

// ============================================================================
// NPV, PAYBACK, AND MULTI-YEAR PROJECTIONS
// ============================================================================

export interface MultiYearProjection {
  years: Array<{
    year: number;
    adoptionRate: number;
    grossBenefit: number;
    adjustedBenefit: number;
    implementationCost: number;
    netBenefit: number;
    cumulativeNetBenefit: number;
    discountFactor: number;
    presentValue: number;
  }>;
  npv: number;
  paybackMonths: number;
  irr: number | null; // null if not calculable
  totalBenefitOverPeriod: number;
}

export function calculateMultiYearProjection(inputs: {
  annualBenefit: number;          // First-year annual benefit at full adoption
  implementationCost: number;     // Total implementation cost
  discountRate?: number;          // WACC / discount rate (default 10%)
  scenario?: Scenario;
  years?: number;                 // Projection period (default 5)
}): MultiYearProjection {
  const {
    annualBenefit,
    implementationCost,
    discountRate = 0.10,
    scenario = 'moderate',
    years = 5,
  } = inputs;

  const adoption = ADOPTION_CURVES[scenario];
  const projectionYears: MultiYearProjection['years'] = [];
  let cumulativeNet = 0;
  let totalPV = 0;
  let paybackMonths = -1;
  let totalBenefit = 0;

  for (let y = 1; y <= years; y++) {
    // Adoption rate: Y1, Y2, Y3+
    const adoptionRate = y === 1 ? adoption.y1 : y === 2 ? adoption.y2 : adoption.y3;
    const grossBenefit = annualBenefit;
    const adjustedBenefit = grossBenefit * adoptionRate;

    // Implementation cost spread: 60% Y1, 30% Y2, 10% Y3
    const implCostThisYear = y === 1 ? implementationCost * 0.60
      : y === 2 ? implementationCost * 0.30
      : y === 3 ? implementationCost * 0.10
      : 0;

    const netBenefit = adjustedBenefit - implCostThisYear;
    cumulativeNet += netBenefit;
    totalBenefit += adjustedBenefit;

    const discountFactor = 1 / Math.pow(1 + discountRate, y);
    const pv = netBenefit * discountFactor;
    totalPV += pv;

    // Calculate payback: find month within year where cumulative goes positive
    if (paybackMonths < 0 && cumulativeNet >= 0) {
      const prevCumulative = cumulativeNet - netBenefit;
      if (prevCumulative < 0 && netBenefit > 0) {
        const monthsIntoYear = Math.ceil((-prevCumulative / netBenefit) * 12);
        paybackMonths = (y - 1) * 12 + monthsIntoYear;
      } else {
        paybackMonths = (y - 1) * 12;
      }
    }

    projectionYears.push({
      year: y,
      adoptionRate,
      grossBenefit,
      adjustedBenefit,
      implementationCost: implCostThisYear,
      netBenefit,
      cumulativeNetBenefit: cumulativeNet,
      discountFactor,
      presentValue: pv,
    });
  }

  // Simple IRR approximation using bisection method
  let irr: number | null = null;
  try {
    const cashFlows = [-implementationCost];
    for (const yr of projectionYears) {
      cashFlows.push(yr.adjustedBenefit - (yr.year <= 3 ? yr.implementationCost : 0));
    }
    irr = calculateIRR(cashFlows);
  } catch {
    irr = null;
  }

  return {
    years: projectionYears,
    npv: Math.round(totalPV),
    paybackMonths: paybackMonths >= 0 ? paybackMonths : years * 12,
    irr,
    totalBenefitOverPeriod: totalBenefit,
  };
}

function calculateIRR(cashFlows: number[], guess: number = 0.10, maxIterations: number = 100, tolerance: number = 0.0001): number | null {
  let rate = guess;
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const factor = Math.pow(1 + rate, t);
      npv += cashFlows[t] / factor;
      dnpv -= t * cashFlows[t] / (factor * (1 + rate));
    }
    if (Math.abs(npv) < tolerance) {
      // Apply the unreasonable-rate guard on convergence too. Newton can
      // legitimately converge to rates like 16 (1600%) for trivially small
      // implementation costs vs huge benefits — the math is correct but the
      // number is meaningless to a CFO and breaks every realism gate.
      // Without this check the convergence path bypassed the guard at the
      // bottom of the function, surfaced by tests/output-realism.test.ts.
      return Math.abs(rate) < 10 ? rate : null;
    }
    if (dnpv === 0) return null;
    rate = rate - npv / dnpv;
  }
  return Math.abs(rate) < 10 ? rate : null; // Reject unreasonable rates
}

// ============================================================================
// TOKEN COST CALCULATION
// ============================================================================

export function calculateTokenCost(inputs: {
  runsPerMonth: number;
  inputTokensPerRun: number;
  outputTokensPerRun: number;
  inputTokenPricePerM?: number;
  outputTokenPricePerM?: number;
}): CalculationResult {
  const {
    runsPerMonth,
    inputTokensPerRun,
    outputTokensPerRun,
    inputTokenPricePerM = DEFAULT_MULTIPLIERS.inputTokenPricePerM,
    outputTokenPricePerM = DEFAULT_MULTIPLIERS.outputTokenPricePerM,
  } = inputs;

  const monthlyInputTokens = runsPerMonth * inputTokensPerRun;
  const monthlyOutputTokens = runsPerMonth * outputTokensPerRun;
  const monthlyTokens = monthlyInputTokens + monthlyOutputTokens;
  const monthlyInputCost = (monthlyInputTokens / 1_000_000) * inputTokenPricePerM;
  const monthlyOutputCost = (monthlyOutputTokens / 1_000_000) * outputTokenPricePerM;
  const annualCost = 12 * (monthlyInputCost + monthlyOutputCost);

  return {
    value: Math.round(annualCost * 100) / 100,
    trace: {
      formula: '12 × ((MonthlyInputTokens/1M × InputPrice) + (MonthlyOutputTokens/1M × OutputPrice))',
      inputs: { runsPerMonth, inputTokensPerRun, outputTokensPerRun, inputTokenPricePerM, outputTokenPricePerM },
      intermediates: { monthlyInputTokens, monthlyOutputTokens, monthlyTokens, monthlyInputCost, monthlyOutputCost },
      output: annualCost,
    },
  };
}

export function calculateValuePerMillionTokens(inputs: {
  totalAnnualValue: number;
  totalMonthlyTokens: number;
}): CalculationResult {
  const { totalAnnualValue, totalMonthlyTokens } = inputs;
  const millionTokens = totalMonthlyTokens / 1_000_000;
  const value = millionTokens > 0 ? totalAnnualValue / millionTokens : 0;

  return {
    value: Math.round(value),
    trace: {
      formula: 'TotalAnnualValue / (TotalMonthlyTokens / 1M)',
      inputs: { totalAnnualValue, totalMonthlyTokens },
      intermediates: { millionTokens },
      output: value,
    },
  };
}

// ============================================================================
// PRIORITY SCORING — 5-CRITERION MATRIX (BlueAlly Standard)
// ============================================================================

/**
 * @deprecated Use calculateNewPriorityScore() instead.
 * Legacy 5-Criterion Priority Score on a 0-100 scale.
 *
 * WEIGHTS:
 *   Strategic Alignment: 25%
 *   Financial Impact: 25%
 *   Implementation Complexity: 20% (inverse — lower complexity = higher score)
 *   Data Readiness: 15%
 *   Time to Value: 15%
 *
 * Result: 0-100 score
 */
export function calculatePriorityScore(inputs: {
  totalAnnualValue: number;
  timeToValueMonths: number;
  dataReadiness: number;       // 1-5, where 5 = easy/ready
  integrationComplexity: number; // 1-5, where 5 = hard
  changeMgmt: number;          // 1-5, where 5 = hard
  strategicAlignment?: number;  // 1-5, where 5 = highly aligned (default 3)
}): CalculationResult & {
  strategicScore: number;
  financialScore: number;
  complexityScore: number;
  dataReadinessScore: number;
  ttvScore: number;
} {
  const {
    totalAnnualValue,
    timeToValueMonths,
    dataReadiness,
    integrationComplexity,
    changeMgmt,
    strategicAlignment = 3,
  } = inputs;

  // Strategic Alignment Score (0-100): 1-5 scale → 0-100
  const strategicScore = Math.min(100, Math.round(((strategicAlignment - 1) / 4) * 100));

  // Financial Impact Score (0-100): $10M+ = 100, linear below
  const financialScore = Math.min(100, Math.round((totalAnnualValue / 10_000_000) * 100));

  // Implementation Complexity Score (0-100): Lower complexity = higher score
  // Combine integration complexity and change management (both 1-5 where 5=hard)
  const avgComplexity = (integrationComplexity + changeMgmt) / 2;
  const complexityScore = Math.round(((5 - avgComplexity) / 4) * 100);

  // Data Readiness Score (0-100): 1-5 scale → 0-100
  const dataReadinessScore = Math.round(((dataReadiness - 1) / 4) * 100);

  // TTV Score (0-100): 3 months = 100, 18+ months = 0
  let ttvScore: number;
  if (timeToValueMonths <= TTV_THRESHOLDS.PERFECT_MONTHS) {
    ttvScore = 100;
  } else if (timeToValueMonths >= TTV_THRESHOLDS.ZERO_MONTHS) {
    ttvScore = 0;
  } else {
    const range = TTV_THRESHOLDS.ZERO_MONTHS - TTV_THRESHOLDS.PERFECT_MONTHS;
    ttvScore = Math.round(100 - ((timeToValueMonths - TTV_THRESHOLDS.PERFECT_MONTHS) / range) * 100);
  }

  // Weighted composite
  const priorityScore = Math.round(
    PRIORITY_WEIGHTS.strategicAlignment * strategicScore +
    PRIORITY_WEIGHTS.financialImpact * financialScore +
    PRIORITY_WEIGHTS.implementationComplexity * complexityScore +
    PRIORITY_WEIGHTS.dataReadiness * dataReadinessScore +
    PRIORITY_WEIGHTS.timeToValue * ttvScore
  );

  return {
    value: Math.min(100, priorityScore),
    strategicScore,
    financialScore,
    complexityScore,
    dataReadinessScore,
    ttvScore,
    trace: {
      formula: `Strategic(${(PRIORITY_WEIGHTS.strategicAlignment * 100).toFixed(0)}%) + Financial(${(PRIORITY_WEIGHTS.financialImpact * 100).toFixed(0)}%) + Complexity(${(PRIORITY_WEIGHTS.implementationComplexity * 100).toFixed(0)}%) + DataReady(${(PRIORITY_WEIGHTS.dataReadiness * 100).toFixed(0)}%) + TTV(${(PRIORITY_WEIGHTS.timeToValue * 100).toFixed(0)}%)`,
      inputs: { totalAnnualValue, timeToValueMonths, dataReadiness, integrationComplexity, changeMgmt, strategicAlignment },
      intermediates: { strategicScore, financialScore, complexityScore, dataReadinessScore, ttvScore },
      output: priorityScore,
    },
  };
}

/**
 * @deprecated Use getNewPriorityTier() instead.
 * Legacy 4-tier assignment using 80/60/40 thresholds on a 0-100 scale.
 */
export function getPriorityTier(priorityScore: number): string {
  if (priorityScore >= PRIORITY_TIERS.TIER_1.min) return PRIORITY_TIERS.TIER_1.label;
  if (priorityScore >= PRIORITY_TIERS.TIER_2.min) return PRIORITY_TIERS.TIER_2.label;
  if (priorityScore >= PRIORITY_TIERS.TIER_3.min) return PRIORITY_TIERS.TIER_3.label;
  return PRIORITY_TIERS.TIER_4.label;
}

/**
 * @deprecated Use getNewRecommendedPhase() instead.
 * Legacy phase recommendation using 80/60/40 thresholds and TTV months.
 */
export function getRecommendedPhase(priorityScore: number, timeToValueMonths: number): string {
  if (priorityScore >= 80 && timeToValueMonths <= 6) return 'Phase 1';
  if (priorityScore >= 60 && timeToValueMonths <= 9) return 'Phase 2';
  if (priorityScore >= 40) return 'Phase 3';
  return 'Phase 4';
}

// ============================================================================
// FRICTION COST — WITH BENEFIT LINKING
// ============================================================================

export function calculateFrictionCost(inputs: {
  annualHours?: number;
  loadedHourlyRate: number;
  headcount?: number;
  hoursPerFTE?: number;
  frictionPercentage?: number;
}): CalculationResult {
  const {
    annualHours,
    loadedHourlyRate,
    headcount,
    hoursPerFTE = 2080,
    frictionPercentage,
  } = inputs;

  let calculatedHours: number;
  let formulaDescription: string;

  if (annualHours !== undefined && annualHours > 0) {
    calculatedHours = annualHours;
    formulaDescription = 'AnnualHours × LoadedHourlyRate';
  } else if (headcount !== undefined && frictionPercentage !== undefined) {
    calculatedHours = headcount * hoursPerFTE * frictionPercentage;
    formulaDescription = 'Headcount × HoursPerFTE × FrictionPercentage × LoadedHourlyRate';
  } else if (headcount !== undefined) {
    calculatedHours = headcount * hoursPerFTE;
    formulaDescription = 'Headcount × HoursPerFTE × LoadedHourlyRate';
  } else {
    return {
      value: 0,
      trace: {
        formula: 'Unable to calculate — missing hours or headcount',
        inputs: { annualHours: annualHours || 0, loadedHourlyRate },
        output: 0,
      },
    };
  }

  // Validate hours within bounds
  calculatedHours = Math.min(calculatedHours, INPUT_BOUNDS.annualHours.max);

  const rawValue = calculatedHours * loadedHourlyRate;
  const roundedValue = Math.floor(rawValue / ROUNDING.FRICTION_PRECISION) * ROUNDING.FRICTION_PRECISION;

  return {
    value: roundedValue,
    trace: {
      formula: formulaDescription,
      inputs: { annualHours: calculatedHours, loadedHourlyRate, headcount: headcount || 0, hoursPerFTE, frictionPercentage: frictionPercentage || 0 },
      intermediates: { calculatedHours, rawValue },
      output: rawValue,
    },
  };
}

export function calculateFrictionSeverity(inputs: {
  annualCost: number;
  affectsRevenue?: boolean;
  affectsCompliance?: boolean;
  affectsCustomer?: boolean;
}): 'Critical' | 'High' | 'Medium' | 'Low' {
  const { annualCost, affectsRevenue, affectsCompliance, affectsCustomer } = inputs;

  if (affectsRevenue || affectsCompliance || annualCost >= 5_000_000) return 'Critical';
  if (annualCost >= 1_000_000 || affectsCustomer) return 'High';
  if (annualCost >= 250_000) return 'Medium';
  return 'Low';
}

/**
 * Link a friction point to a use case benefit, showing recovery percentage
 */
export function calculateFrictionRecovery(frictionCost: number, useCaseBenefit: number): {
  recoveryAmount: number;
  recoveryPct: number;
  label: string;
} {
  if (frictionCost <= 0) return { recoveryAmount: 0, recoveryPct: 0, label: 'No friction link' };
  const recoveryAmount = Math.min(useCaseBenefit, frictionCost);
  const recoveryPct = recoveryAmount / frictionCost;
  return {
    recoveryAmount,
    recoveryPct,
    label: `Recovers ${formatMoney(recoveryAmount)} (${(recoveryPct * 100).toFixed(0)}%) of ${formatMoney(frictionCost)} friction burden`,
  };
}

// ============================================================================
// THREE-SCENARIO SUMMARY GENERATOR
// ============================================================================

export interface ThreeScenarioSummary {
  conservative: { totalBenefit: number; npv: number; paybackMonths: number };
  moderate:     { totalBenefit: number; npv: number; paybackMonths: number };
  aggressive:   { totalBenefit: number; npv: number; paybackMonths: number };
  headline: string; // Always uses conservative for executive-facing number
}

export function generateThreeScenarioSummary(inputs: {
  baseBenefitAtFullAdoption: number; // The "moderate" (1.0x) annual benefit
  implementationCost: number;
  discountRate?: number;
}): ThreeScenarioSummary {
  const { baseBenefitAtFullAdoption, implementationCost, discountRate = 0.10 } = inputs;

  const scenarios: Record<Scenario, { totalBenefit: number; npv: number; paybackMonths: number }> = {} as any;

  for (const scenario of ['conservative', 'moderate', 'aggressive'] as Scenario[]) {
    const adjusted = baseBenefitAtFullAdoption * SCENARIO_MULTIPLIERS[scenario];
    const projection = calculateMultiYearProjection({
      annualBenefit: adjusted,
      implementationCost,
      discountRate,
      scenario,
    });
    scenarios[scenario] = {
      totalBenefit: adjusted,
      npv: projection.npv,
      paybackMonths: projection.paybackMonths,
    };
  }

  return {
    ...scenarios,
    headline: `${formatMoney(scenarios.conservative.totalBenefit)} conservative first-year value (${formatMoney(scenarios.moderate.totalBenefit)} moderate, ${formatMoney(scenarios.aggressive.totalBenefit)} aggressive)`,
  };
}

// ============================================================================
// SAFE WRAPPER FUNCTIONS — ENFORCE INPUT_BOUNDS BEFORE CALCULATION
// These wrappers clamp all inputs to reasonable ranges before calling the
// underlying calculation functions. Use these in the post-processor.
// ============================================================================

export interface SafeCalculationResult extends CalculationResult {
  validationWarnings: string[];
  inputsClamped: boolean;
}

/**
 * Safe Cost Benefit — validates & clamps inputs before calculation
 */
export function calculateCostBenefitSafe(inputs: {
  hoursSaved: number;
  loadedHourlyRate?: number;
  benefitsLoading?: number;
  costRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
}): SafeCalculationResult {
  const validation = validateInputs(
    {
      hoursSaved: inputs.hoursSaved,
      loadedHourlyRate: inputs.loadedHourlyRate || DEFAULT_MULTIPLIERS.loadedHourlyRate,
    },
    INPUT_BOUNDS
  );

  const clampedInputs = {
    ...inputs,
    hoursSaved: validation.clampedInputs.hoursSaved ?? inputs.hoursSaved,
    loadedHourlyRate: validation.clampedInputs.loadedHourlyRate ?? inputs.loadedHourlyRate,
  };

  const result = calculateCostBenefit(clampedInputs);
  return {
    ...result,
    validationWarnings: validation.warnings,
    inputsClamped: validation.warnings.length > 0,
  };
}

/**
 * Safe Revenue Benefit — validates & clamps inputs before calculation
 */
export function calculateRevenueBenefitSafe(inputs: {
  upliftPct: number;
  baselineRevenueAtRisk: number;
  marginPct?: number;
  revenueRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
}): SafeCalculationResult {
  const validation = validateInputs(
    {
      upliftPct: inputs.upliftPct,
      baselineRevenueAtRisk: inputs.baselineRevenueAtRisk,
    },
    INPUT_BOUNDS
  );

  const clampedInputs = {
    ...inputs,
    upliftPct: validation.clampedInputs.upliftPct ?? inputs.upliftPct,
    baselineRevenueAtRisk: validation.clampedInputs.baselineRevenueAtRisk ?? inputs.baselineRevenueAtRisk,
  };

  const result = calculateRevenueBenefit(clampedInputs);
  return {
    ...result,
    validationWarnings: validation.warnings,
    inputsClamped: validation.warnings.length > 0,
  };
}

/**
 * Safe Cash Flow Benefit — validates & clamps inputs before calculation
 */
export function calculateCashFlowBenefitSafe(inputs: {
  daysImprovement: number;
  annualRevenue: number;
  costOfCapital?: number;
  cashFlowRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
  dailyRevenue?: number;
}): SafeCalculationResult {
  const validation = validateInputs(
    {
      daysImprovement: inputs.daysImprovement,
      annualRevenue: inputs.annualRevenue,
      costOfCapital: inputs.costOfCapital || DEFAULT_MULTIPLIERS.defaultCostOfCapital,
    },
    INPUT_BOUNDS
  );

  const clampedInputs = {
    ...inputs,
    daysImprovement: validation.clampedInputs.daysImprovement ?? inputs.daysImprovement,
    annualRevenue: validation.clampedInputs.annualRevenue ?? inputs.annualRevenue,
    costOfCapital: validation.clampedInputs.costOfCapital ?? inputs.costOfCapital,
  };

  const result = calculateCashFlowBenefit(clampedInputs);
  return {
    ...result,
    validationWarnings: validation.warnings,
    inputsClamped: validation.warnings.length > 0,
  };
}

/**
 * Safe Risk Benefit — validates & clamps inputs before calculation
 */
export function calculateRiskBenefitSafe(inputs: {
  probBefore: number;
  impactBefore: number;
  probAfter: number;
  impactAfter: number;
  riskRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
}): SafeCalculationResult {
  const validation = validateInputs(
    {
      probBefore: inputs.probBefore,
      impactBefore: inputs.impactBefore,
      probAfter: inputs.probAfter,
      impactAfter: inputs.impactAfter,
    },
    INPUT_BOUNDS
  );

  const clampedInputs = {
    ...inputs,
    probBefore: validation.clampedInputs.probBefore ?? inputs.probBefore,
    impactBefore: validation.clampedInputs.impactBefore ?? inputs.impactBefore,
    probAfter: validation.clampedInputs.probAfter ?? inputs.probAfter,
    impactAfter: validation.clampedInputs.impactAfter ?? inputs.impactAfter,
  };

  const result = calculateRiskBenefit(clampedInputs);
  return {
    ...result,
    validationWarnings: validation.warnings,
    inputsClamped: validation.warnings.length > 0,
  };
}

// ============================================================================
// FORMATTERS
// ============================================================================

export function formatMoney(value: number): string {
  const rounded = Math.round(value);
  if (rounded >= 1_000_000_000) {
    const b = rounded / 1_000_000_000;
    return b === Math.floor(b) ? `$${Math.floor(b)}B` : `$${b.toFixed(1)}B`;
  }
  if (rounded >= 1_000_000) {
    const m = rounded / 1_000_000;
    return m === Math.floor(m) ? `$${Math.floor(m)}M` : `$${m.toFixed(1)}M`;
  }
  if (rounded >= 1_000) {
    return `$${Math.round(rounded / 1_000)}K`;
  }
  return `$${rounded}`;
}

export function formatPercentage(value: number, decimals: number = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function roundTimelineUp(months: number): number {
  return Math.ceil(months);
}

export function roundBenefitDown(value: number): number {
  return Math.floor(value / ROUNDING.BENEFIT_PRECISION) * ROUNDING.BENEFIT_PRECISION;
}

export function formatHours(hours: number, includeLabel: boolean = true): string {
  const suffix = includeLabel ? ' hours' : '';
  const rounded = Math.round(hours);
  if (rounded >= 1000000) {
    const m = Math.round(rounded / 1000000 * 10) / 10;
    return m === Math.floor(m) ? `${Math.floor(m).toLocaleString()}M${suffix}` : `${m.toFixed(1)}M${suffix}`;
  }
  return `${rounded.toLocaleString()}${suffix}`;
}

// ============================================================================
// READINESS SCORE — 4-Component Weighted System (1-10 Scale)
// Replaces the old Effort Score (1-5) + Data Readiness + Integration Complexity + Change Mgmt
// ============================================================================

export const READINESS_WEIGHTS = {
  organizationalCapacity: 0.30,
  dataAvailabilityQuality: 0.30,
  technicalInfrastructure: 0.20,
  governance: 0.20,
} as const;

/**
 * Calculate Readiness Score from 4 weighted components (each 1-10).
 * Higher = more ready to implement.
 *
 * Formula: (OrgCapacity × 0.30) + (DataQuality × 0.30) + (TechInfra × 0.20) + (Governance × 0.20)
 *
 * Components:
 *   1. Organizational Capacity (30%): AI talent, leadership champions, change readiness
 *   2. Data Availability & Quality (30%): System integration, data quality, digital maturity
 *   3. Technical Infrastructure (20%): Cloud/API readiness, DevOps, modern stack
 *   4. Governance (20%): AI ethics, model monitoring, compliance frameworks
 */
export function calculateReadinessScore(inputs: {
  organizationalCapacity: number;     // 1-10
  dataAvailabilityQuality: number;    // 1-10
  technicalInfrastructure: number;    // 1-10
  governance: number;                 // 1-10
}): CalculationResult & {
  organizationalCapacity: number;
  dataAvailabilityQuality: number;
  technicalInfrastructure: number;
  governance: number;
} {
  // Clamp all inputs to 1-10
  const oc = Math.max(1, Math.min(10, inputs.organizationalCapacity));
  const dq = Math.max(1, Math.min(10, inputs.dataAvailabilityQuality));
  const ti = Math.max(1, Math.min(10, inputs.technicalInfrastructure));
  const gov = Math.max(1, Math.min(10, inputs.governance));

  const score =
    (oc * READINESS_WEIGHTS.organizationalCapacity) +
    (dq * READINESS_WEIGHTS.dataAvailabilityQuality) +
    (ti * READINESS_WEIGHTS.technicalInfrastructure) +
    (gov * READINESS_WEIGHTS.governance);

  // Round to 2 decimal places
  const roundedScore = Math.round(score * 100) / 100;

  return {
    value: roundedScore,
    organizationalCapacity: oc,
    dataAvailabilityQuality: dq,
    technicalInfrastructure: ti,
    governance: gov,
    trace: {
      formula: `(OrgCapacity × ${READINESS_WEIGHTS.organizationalCapacity}) + (DataQuality × ${READINESS_WEIGHTS.dataAvailabilityQuality}) + (TechInfra × ${READINESS_WEIGHTS.technicalInfrastructure}) + (Governance × ${READINESS_WEIGHTS.governance})`,
      inputs: { organizationalCapacity: oc, dataAvailabilityQuality: dq, technicalInfrastructure: ti, governance: gov },
      intermediates: {
        ocWeighted: oc * READINESS_WEIGHTS.organizationalCapacity,
        dqWeighted: dq * READINESS_WEIGHTS.dataAvailabilityQuality,
        tiWeighted: ti * READINESS_WEIGHTS.technicalInfrastructure,
        govWeighted: gov * READINESS_WEIGHTS.governance,
      },
      output: roundedScore,
    },
  };
}

// ============================================================================
// VALUE NORMALIZATION — Min-Max to 1-10 Scale
// Deterministic, repeatable normalization across use cases in a report
// ============================================================================

/**
 * Normalize an array of dollar values to a 1-10 scale using min-max normalization.
 * Formula: Score = 1 + ((value - min) / (max - min)) × 9
 *
 * If all values are equal, all get 5.5.
 * Dynamically updates when user changes values.
 */
export function normalizeValuesToScale(values: number[]): number[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range === 0) {
    // All values equal — return midpoint
    return values.map(() => 5.5);
  }

  return values.map(v => {
    const normalized = 1 + ((v - min) / range) * 9;
    return Math.round(normalized * 100) / 100;
  });
}

/**
 * Normalize a single value given the min and max of its cohort.
 */
export function normalizeValueToScale(value: number, min: number, max: number): number {
  if (max === min) return 5.5;
  const normalized = 1 + ((value - min) / (max - min)) * 9;
  return Math.round(normalized * 100) / 100;
}

// ============================================================================
// VALUE SCORE FROM FRICTION — Expected Value / Friction Cost, normalized 1-10
// More deterministic than pure dollar-based min-max normalization.
// Directly ties use case value to the friction cost it addresses.
// ============================================================================

/**
 * Calculate Value Score as (Expected Value / Friction Annual Cost), normalized 1-10.
 *
 * @param expectedValue - Total Annual Value × Probability of Success
 * @param frictionCost - Annual cost of the friction point this use case targets
 * @param allRatios - Array of EV/friction ratios for ALL use cases in the cohort
 * @returns Normalized score 1-10 (5.5 if all ratios are equal)
 */
export function calculateValueScoreFromFriction(
  expectedValue: number,
  frictionCost: number,
  allRatios: number[],
): number {
  const rawRatio = frictionCost > 0 ? expectedValue / frictionCost : 0;
  const minRatio = Math.min(...allRatios);
  const maxRatio = Math.max(...allRatios);
  if (maxRatio === minRatio) return 5.5;
  return Math.round((1 + ((rawRatio - minRatio) / (maxRatio - minRatio)) * 9) * 100) / 100;
}

// ============================================================================
// TTV BUBBLE SIZING — Time to Value score for matrix bubble size
// ============================================================================

/**
 * Calculate TTV score for bubble sizing.
 * Formula: 1 - MIN(TTV/12, 1)
 *
 * 3 months → 0.75 (large bubble)
 * 10 months → 0.167 (medium bubble)
 * 12+ months → 0 (minimum size bubble, still visible)
 */
export function calculateTTVBubbleScore(ttvMonths: number): number {
  return Math.max(0, 1 - Math.min(ttvMonths / 12, 1));
}

// ============================================================================
// NEW PRIORITY SCORING — Simple 50/50 Readiness + Value
// Replaces the 5-criterion weighted matrix
// ============================================================================

export const NEW_PRIORITY_TIERS = {
  TIER_1: { label: 'Tier 1 — Champions' },
  TIER_2: { label: 'Tier 2 — Quick Wins' },
  TIER_3: { label: 'Tier 3 — Strategic' },
  TIER_4: { label: 'Tier 4 — Foundation' },
} as const;

/**
 * New Priority Score = (Readiness Score × 0.5) + (Normalized Value Score × 0.5)
 * Both inputs on 1-10 scale → output is 1-10
 */
export function calculateNewPriorityScore(inputs: {
  readinessScore: number;  // 1-10
  normalizedValue: number;   // 1-10
}): CalculationResult {
  const rs = Math.max(1, Math.min(10, inputs.readinessScore));
  const nv = Math.max(1, Math.min(10, inputs.normalizedValue));

  const score = (rs * 0.5) + (nv * 0.5);
  const roundedScore = Math.round(score * 100) / 100;

  return {
    value: roundedScore,
    trace: {
      formula: '(Readiness × 0.5) + (NormalizedValue × 0.5)',
      inputs: { readinessScore: rs, normalizedValue: nv },
      output: roundedScore,
    },
  };
}

/**
 * New Priority Tier Assignment — aligned with matrix quadrants
 * Tier 1 Champions: Priority >= 7.5
 * Tier 2 Quick Wins: Value < 5.5 AND Readiness >= 5.5
 * Tier 3 Strategic: Value >= 5.5 AND Readiness < 5.5
 * Tier 4 Foundation: everything else (Priority < 5.0)
 */
export function getNewPriorityTier(
  priorityScore: number,
  normalizedValue: number,
  readinessScore: number
): string {
  if (priorityScore >= 7.5) return NEW_PRIORITY_TIERS.TIER_1.label;
  if (normalizedValue < 5.5 && readinessScore >= 5.5) return NEW_PRIORITY_TIERS.TIER_2.label;
  if (normalizedValue >= 5.5 && readinessScore < 5.5) return NEW_PRIORITY_TIERS.TIER_3.label;
  return NEW_PRIORITY_TIERS.TIER_4.label;
}

/**
 * Recommended phase based on new priority and readiness
 */
export function getNewRecommendedPhase(priorityScore: number, readinessScore: number): string {
  if (priorityScore >= 7.5 && readinessScore >= 6) return 'Phase 1';
  if (priorityScore >= 6.0 && readinessScore >= 5) return 'Phase 2';
  if (priorityScore >= 4.5) return 'Phase 3';
  return 'Phase 4';
}
