// server/calculation-postprocessor.ts
// Post-processes AI-generated analysis to ensure all calculations are deterministic and accurate

import {
  calculateCostBenefit,
  calculateRevenueBenefit,
  calculateCashFlowBenefit,
  calculateRiskBenefit,
  calculateTokenCost,
  calculateTotalAnnualValue,
  calculatePriorityScore,
  calculateValuePerMillionTokens,
  getPriorityTier,
  getRecommendedPhase,
  formatMoney,
  formatHours,
  calculateFrictionCost,
  calculateFrictionSeverity,
  DEFAULT_MULTIPLIERS,
} from "../src/calc/formulas";

interface Step3Record {
  Function: string;
  "Sub-Function": string;
  "Friction Point": string;
  Severity?: string;
  "Primary Driver Impact"?: string;
  "Estimated Annual Cost ($)"?: string;
  "Annual Hours"?: number | string;
  "Hourly Rate"?: number | string;
  "Cost Formula"?: string;
}

interface Step5Record {
  ID: string;
  "Use Case": string;
  "Revenue Benefit ($)"?: string;
  "Revenue Formula"?: string;
  "Cost Benefit ($)"?: string;
  "Cost Formula"?: string;
  "Cash Flow Benefit ($)"?: string;
  "Cash Flow Formula"?: string;
  "Risk Benefit ($)"?: string;
  "Risk Formula"?: string;
  "Total Annual Value ($)"?: string;
  "Probability of Success"?: number;
}

interface Step6Record {
  ID: string;
  "Use Case": string;
  "Data Readiness (1-5)": number;
  "Integration Complexity (1-5)": number;
  "Change Mgmt (1-5)": number;
  "Effort Score (1-5)": number;
  "Time-to-Value (months)": number;
  "Input Tokens/Run": number;
  "Output Tokens/Run": number;
  "Runs/Month": number;
  "Monthly Tokens"?: number;
  "Annual Token Cost ($)"?: string;
}

interface Step7Record {
  ID: string;
  "Use Case": string;
  "Value Score (0-40)"?: number;
  "TTV Score (0-30)"?: number;
  "Effort Score (0-30)"?: number;
  "Priority Score (0-100)"?: number;
  "Priority Tier"?: string;
  "Recommended Phase"?: string;
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
  let efficiencyMultiplier = DEFAULT_MULTIPLIERS.efficiencyMultiplier;
  let adoptionMultiplier = DEFAULT_MULTIPLIERS.adoptionMultiplier;
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
    hoursSaved,
    loadedHourlyRate,
    efficiencyMultiplier,
    adoptionMultiplier,
    dataMaturityMultiplier,
  };
}

// Recalculate cost benefit using deterministic formula
function recalculateCostBenefit(formula: string): { value: number; formulaText: string } {
  if (isNoValue(formula)) {
    return { value: 0, formulaText: "No direct cost reduction" };
  }
  
  const inputs = parseCostFormulaInputs(formula);
  
  if (!inputs) {
    console.log(`[recalculateCostBenefit] Could not parse inputs from: ${formula}`);
    return { value: 0, formulaText: formula };
  }
  
  // Use the deterministic formula function
  const result = calculateCostBenefit({
    hoursSaved: inputs.hoursSaved,
    loadedHourlyRate: inputs.loadedHourlyRate,
    efficiencyMultiplier: inputs.efficiencyMultiplier,
    adoptionMultiplier: inputs.adoptionMultiplier,
    dataMaturityMultiplier: inputs.dataMaturityMultiplier,
  });
  
  // Generate formula text with correct result (hours formatted to max 2 decimals)
  const newFormula = `${formatHours(inputs.hoursSaved)} × $${inputs.loadedHourlyRate}/hr × ${inputs.efficiencyMultiplier.toFixed(2)} × ${inputs.adoptionMultiplier.toFixed(2)} × ${inputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(result.trace.output)} → ${formatMoney(result.value)}`;
  
  return { value: result.value, formulaText: newFormula };
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
    upliftPct,
    baselineRevenueAtRisk,
    marginPct,
    revenueRealizationMultiplier,
    dataMaturityMultiplier,
  };
}

function recalculateRevenueBenefit(formula: string): { value: number; formulaText: string } {
  if (isNoValue(formula)) {
    return { value: 0, formulaText: "No direct revenue impact" };
  }
  
  const inputs = parseRevenueFormulaInputs(formula);
  
  if (!inputs) {
    // Cannot parse - log warning and return 0 to avoid incorrect values
    console.warn(`[recalculateRevenueBenefit] Could not parse formula, returning 0: ${formula}`);
    return { value: 0, formulaText: formula + " (could not validate)" };
  }
  
  const result = calculateRevenueBenefit(inputs);
  
  const newFormula = `${(inputs.upliftPct * 100).toFixed(0)}% × ${formatMoney(inputs.baselineRevenueAtRisk)} × ${inputs.revenueRealizationMultiplier.toFixed(2)} × ${inputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(result.trace.output)} → ${formatMoney(result.value)}`;
  
  return { value: result.value, formulaText: newFormula };
}

// Parse cash flow formula inputs
interface CashFlowInputs {
  daysImprovement: number;
  dailyRevenue: number;
  workingCapitalPct: number;
  cashFlowRealizationMultiplier: number;
  dataMaturityMultiplier: number;
}

function parseCashFlowFormulaInputs(formula: string): CashFlowInputs | null {
  const numbers = extractInputNumbers(formula);
  if (numbers.length < 2) return null;
  
  let daysImprovement = 0;
  let dailyRevenue = 0;
  let workingCapitalPct = 1.0;
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
  // Large number is daily revenue or total
  if (largeNumbers.length > 0) dailyRevenue = largeNumbers[0];
  // Decimals are multipliers
  if (decimals.length >= 1) cashFlowRealizationMultiplier = decimals[0];
  if (decimals.length >= 2) dataMaturityMultiplier = decimals[1];
  
  if (daysImprovement === 0 || dailyRevenue === 0) return null;
  
  return {
    daysImprovement,
    dailyRevenue,
    workingCapitalPct,
    cashFlowRealizationMultiplier,
    dataMaturityMultiplier,
  };
}

function recalculateCashFlowBenefit(formula: string): { value: number; formulaText: string } {
  if (isNoValue(formula)) {
    return { value: 0, formulaText: "No direct cash flow impact" };
  }
  
  const inputs = parseCashFlowFormulaInputs(formula);
  
  if (!inputs) {
    // Cannot parse - log warning and return 0 to avoid incorrect values
    console.warn(`[recalculateCashFlowBenefit] Could not parse formula, returning 0: ${formula}`);
    return { value: 0, formulaText: formula + " (could not validate)" };
  }
  
  const result = calculateCashFlowBenefit(inputs);
  
  const newFormula = `${inputs.daysImprovement} days × ${formatMoney(inputs.dailyRevenue)}/day × ${inputs.cashFlowRealizationMultiplier.toFixed(2)} × ${inputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(result.trace.output)} → ${formatMoney(result.value)}`;
  
  return { value: result.value, formulaText: newFormula };
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

function recalculateRiskBenefit(formula: string): { value: number; formulaText: string } {
  if (isNoValue(formula)) {
    return { value: 0, formulaText: "No quantifiable risk reduction" };
  }
  
  const inputs = parseRiskFormulaInputs(formula);
  
  if (!inputs) {
    // Cannot parse - log warning and return 0 to avoid incorrect values
    console.warn(`[recalculateRiskBenefit] Could not parse formula, returning 0: ${formula}`);
    return { value: 0, formulaText: formula + " (could not validate)" };
  }
  
  // Use the deterministic risk benefit calculation
  const result = calculateRiskBenefit({
    probBefore: inputs.probBefore,
    impactBefore: inputs.impactBefore,
    probAfter: inputs.probAfter,
    impactAfter: inputs.impactAfter,
    riskRealizationMultiplier: inputs.riskRealizationMultiplier,
    dataMaturityMultiplier: inputs.dataMaturityMultiplier,
  });
  
  const newFormula = `${(inputs.probBefore * 100).toFixed(0)}% × ${formatMoney(inputs.impactBefore)} × ${inputs.riskRealizationMultiplier.toFixed(2)} × ${inputs.dataMaturityMultiplier.toFixed(2)} = ${formatMoney(result.trace.output)} → ${formatMoney(result.value)}`;
  
  return { value: result.value, formulaText: newFormula };
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
  
  let annualHours: number = 0;
  let loadedHourlyRate: number = DEFAULT_MULTIPLIERS.loadedHourlyRate;
  
  // Try to use explicit inputs if available
  if (existingHours !== undefined) {
    annualHours = typeof existingHours === "number" ? existingHours : parseFloat(String(existingHours).replace(/,/g, "")) || 0;
  }
  if (existingRate !== undefined) {
    loadedHourlyRate = typeof existingRate === "number" ? existingRate : parseFloat(String(existingRate).replace(/[$,]/g, "")) || DEFAULT_MULTIPLIERS.loadedHourlyRate;
  }
  
  // If no explicit inputs, try to parse from the cost text
  if (annualHours === 0) {
    const parsed = parseFrictionCostInputs(costText);
    if (parsed) {
      annualHours = parsed.annualHours;
      loadedHourlyRate = parsed.loadedHourlyRate;
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
  
  // Use the deterministic friction cost formula
  const result = calculateFrictionCost({
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
  
  const result = calculateTokenCost({
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
  
  // Find all steps
  const step3 = steps.find((s: any) => s.step === 3);
  const step5 = steps.find((s: any) => s.step === 5);
  const step6 = steps.find((s: any) => s.step === 6);
  const step7 = steps.find((s: any) => s.step === 7);
  
  // ============================================
  // STEP 3: FRICTION POINT PROCESSING
  // ============================================
  let totalFrictionCost = 0;
  
  if (step3?.data && Array.isArray(step3.data)) {
    console.log("[postProcessAnalysis] Processing", step3.data.length, "friction points with deterministic formulas");
    
    const correctedStep3Data: Step3Record[] = [];
    
    for (const record of step3.data as Step3Record[]) {
      const frictionResult = recalculateFrictionCost(record);
      totalFrictionCost += frictionResult.value;
      
      correctedStep3Data.push({
        ...record,
        "Estimated Annual Cost ($)": formatMoney(frictionResult.value),
        "Cost Formula": frictionResult.formulaText,
        "Annual Hours": Math.round(frictionResult.annualHours),
        "Hourly Rate": frictionResult.loadedHourlyRate,
        Severity: frictionResult.severity,
      });
      
      console.log(`[postProcessAnalysis] Friction: ${record["Friction Point"]?.substring(0, 30)}... = ${formatMoney(frictionResult.value)} (${frictionResult.severity})`);
    }
    
    step3.data = correctedStep3Data;
    console.log(`[postProcessAnalysis] Total Friction Cost: ${formatMoney(totalFrictionCost)}`);
  }
  
  // ============================================
  // STEP 5: BENEFITS QUANTIFICATION PROCESSING
  // ============================================
  if (!step5?.data || !Array.isArray(step5.data)) {
    console.log("[postProcessAnalysis] Step 5 data not found or invalid");
    return analysisResult;
  }
  
  console.log("[postProcessAnalysis] Processing", step5.data.length, "use cases with deterministic formulas");
  
  // Recalculate all Step 5 benefits using deterministic formulas
  const correctedStep5Data: Step5Record[] = [];
  let totalCostBenefit = 0;
  let totalRevenueBenefit = 0;
  let totalCashFlowBenefit = 0;
  let totalRiskBenefit = 0;
  
  for (const record of step5.data as Step5Record[]) {
    const costResult = recalculateCostBenefit(record["Cost Formula"] || "");
    const revenueResult = recalculateRevenueBenefit(record["Revenue Formula"] || "");
    const cashFlowResult = recalculateCashFlowBenefit(record["Cash Flow Formula"] || "");
    const riskResult = recalculateRiskBenefit(record["Risk Formula"] || "");
    
    const totalBenefits = costResult.value + revenueResult.value + cashFlowResult.value + riskResult.value;
    const prob = record["Probability of Success"] || 0.75;
    
    // Use the deterministic total value calculation
    const totalValueResult = calculateTotalAnnualValue({
      costBenefit: costResult.value,
      revenueBenefit: revenueResult.value,
      cashFlowBenefit: cashFlowResult.value,
      riskBenefit: riskResult.value,
      probabilityOfSuccess: prob,
    });
    
    totalCostBenefit += costResult.value;
    totalRevenueBenefit += revenueResult.value;
    totalCashFlowBenefit += cashFlowResult.value;
    totalRiskBenefit += riskResult.value;
    
    correctedStep5Data.push({
      ...record,
      "Cost Benefit ($)": formatMoney(costResult.value),
      "Cost Formula": costResult.formulaText,
      "Revenue Benefit ($)": formatMoney(revenueResult.value),
      "Revenue Formula": revenueResult.formulaText,
      "Cash Flow Benefit ($)": formatMoney(cashFlowResult.value),
      "Cash Flow Formula": cashFlowResult.formulaText,
      "Risk Benefit ($)": formatMoney(riskResult.value),
      "Risk Formula": riskResult.formulaText,
      "Total Annual Value ($)": formatMoney(totalValueResult.value),
    });
    
    console.log(`[postProcessAnalysis] ${record.ID}: Cost=${formatMoney(costResult.value)}, Revenue=${formatMoney(revenueResult.value)}, CashFlow=${formatMoney(cashFlowResult.value)}, Risk=${formatMoney(riskResult.value)}, Total=${formatMoney(totalValueResult.value)}`);
  }
  
  // Update Step 5 data
  step5.data = correctedStep5Data;
  
  // Recalculate Step 6 token costs using deterministic formula
  let totalMonthlyTokens = 0;
  
  if (step6?.data && Array.isArray(step6.data)) {
    const correctedStep6Data: Step6Record[] = [];
    
    for (const record of step6.data as Step6Record[]) {
      const tokenResult = calculateTokenCostFromStep6(record);
      totalMonthlyTokens += tokenResult.monthlyTokens;
      
      correctedStep6Data.push({
        ...record,
        "Monthly Tokens": tokenResult.monthlyTokens,
        "Annual Token Cost ($)": formatMoney(tokenResult.annualCost),
      });
    }
    
    step6.data = correctedStep6Data;
  }
  
  // Recalculate Step 7 priority scores using deterministic formula
  if (step7?.data && Array.isArray(step7.data) && step6?.data) {
    const correctedStep7Data: Step7Record[] = [];
    
    for (const record of step7.data as Step7Record[]) {
      // Find matching Step 5 and Step 6 records
      const step5Record = correctedStep5Data.find(r => r.ID === record.ID);
      const step6Record = (step6.data as Step6Record[]).find(r => r.ID === record.ID);
      
      if (step5Record && step6Record) {
        const totalValue = parseNumber(step5Record["Total Annual Value ($)"]);
        const ttv = step6Record["Time-to-Value (months)"];
        const dataReadiness = step6Record["Data Readiness (1-5)"];
        const integrationComplexity = step6Record["Integration Complexity (1-5)"];
        const changeMgmt = step6Record["Change Mgmt (1-5)"];
        
        // Use the deterministic priority score function
        const priorityResult = calculatePriorityScore({
          totalAnnualValue: totalValue,
          timeToValueMonths: ttv,
          dataReadiness,
          integrationComplexity,
          changeMgmt,
        });
        
        const tier = getPriorityTier(priorityResult.value);
        const phase = getRecommendedPhase(priorityResult.value, ttv);
        
        correctedStep7Data.push({
          ...record,
          "Value Score (0-40)": Math.round(priorityResult.valueScore * 0.4),
          "TTV Score (0-30)": Math.round(priorityResult.ttvScore * 0.3),
          "Effort Score (0-30)": Math.round(priorityResult.effortScore * 0.3),
          "Priority Score (0-100)": priorityResult.value,
          "Priority Tier": tier,
          "Recommended Phase": phase,
        });
      } else {
        correctedStep7Data.push(record);
      }
    }
    
    step7.data = correctedStep7Data;
  }
  
  // Update executive dashboard with deterministic calculations
  const totalAnnualValue = totalCostBenefit + totalRevenueBenefit + totalCashFlowBenefit + totalRiskBenefit;
  
  // Use the deterministic value per million tokens function
  const valuePerMillion = calculateValuePerMillionTokens({
    totalAnnualValue,
    totalMonthlyTokens,
  });
  
  // Get top 5 use cases by priority score
  const sortedUseCases = [...(step7?.data || [])].sort(
    (a: any, b: any) => (b["Priority Score (0-100)"] || 0) - (a["Priority Score (0-100)"] || 0)
  );
  
  const topUseCases = sortedUseCases.slice(0, 5).map((uc: any, index: number) => {
    const step5Record = correctedStep5Data.find(r => r.ID === uc.ID);
    return {
      rank: index + 1,
      useCase: uc["Use Case"],
      priorityScore: uc["Priority Score (0-100)"] || 0,
      monthlyTokens: (step6?.data as Step6Record[])?.find(r => r.ID === uc.ID)?.["Monthly Tokens"] || 0,
      annualValue: parseNumber(step5Record?.["Total Annual Value ($)"]),
    };
  });
  
  const correctedResult = {
    ...analysisResult,
    steps,
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
  };
  
  console.log(`[postProcessAnalysis] Dashboard totals: TotalValue=${formatMoney(totalAnnualValue)}, Cost=${formatMoney(totalCostBenefit)}, Revenue=${formatMoney(totalRevenueBenefit)}, CashFlow=${formatMoney(totalCashFlowBenefit)}, Risk=${formatMoney(totalRiskBenefit)}`);
  
  return correctedResult;
}
