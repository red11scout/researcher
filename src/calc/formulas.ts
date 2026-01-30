// src/calc/formulas.ts
// Deterministic Formula Registry for BlueAlly AI Calculations
// All monetary outputs must store a trace: formula + resolved inputs + intermediate steps
// SPEC COMPLIANT: Follows Section 3.2 and 3.3 of build prompt

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

// Global default multipliers (Section 3.3 Required Assumptions)
export const DEFAULT_MULTIPLIERS = {
  // Section 3.3 - Required global assumptions
  loadedHourlyRate: 150,
  efficiencyMultiplier: 0.85,      // Efficiency factor (0-1)
  adoptionMultiplier: 0.70,         // Expected adoption rate (0-1)
  dataMaturityMultiplier: 0.75,     // Data maturity factor (0-1)
  
  // Realization multipliers (probability-weighted adjustments)
  costRealizationMultiplier: 0.90,
  revenueRealizationMultiplier: 0.95,
  cashFlowRealizationMultiplier: 0.85,
  riskRealizationMultiplier: 0.80,
  
  // Token pricing (Claude 3.5 Sonnet defaults)
  inputTokenPricePerM: 3.00,
  outputTokenPricePerM: 15.00,
  
  // Optional probability of success per use case
  probabilityOfSuccess: 1.0,
};

/**
 * Cost Benefit Calculation (Section 3.2)
 * SPEC FORMULA: CostBenefit = HoursSaved × LoadedRate × Efficiency × Adoption × DataMaturity
 * 
 * @param hoursSaved - Annual hours saved by automation
 * @param loadedHourlyRate - Fully burdened hourly cost (wages + benefits + overhead)
 * @param efficiencyMultiplier - Efficiency gain factor (0-1)
 * @param adoptionMultiplier - Expected user adoption rate (0-1)
 * @param dataMaturityMultiplier - Data readiness factor (0-1)
 */
export function calculateCostBenefit(inputs: {
  hoursSaved: number;
  loadedHourlyRate: number;
  efficiencyMultiplier?: number;
  adoptionMultiplier?: number;
  dataMaturityMultiplier?: number;
}): CalculationResult {
  const {
    hoursSaved,
    loadedHourlyRate,
    efficiencyMultiplier = DEFAULT_MULTIPLIERS.efficiencyMultiplier,
    adoptionMultiplier = DEFAULT_MULTIPLIERS.adoptionMultiplier,
    dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
  } = inputs;

  const rawValue = hoursSaved * loadedHourlyRate * efficiencyMultiplier * adoptionMultiplier * dataMaturityMultiplier;
  const roundedValue = Math.floor(rawValue / 100000) * 100000; // Round DOWN to nearest $100K
  
  return {
    value: roundedValue,
    trace: {
      formula: 'HoursSaved × LoadedRate × Efficiency × Adoption × DataMaturity',
      inputs: { hoursSaved, loadedHourlyRate, efficiencyMultiplier, adoptionMultiplier, dataMaturityMultiplier },
      intermediates: { rawValue },
      output: rawValue,
    },
  };
}

/**
 * Revenue Benefit Calculation (Section 3.2)
 * SPEC FORMULA: RevenueBenefit = UpliftPct × BaselineRevenueAtRisk × MarginPct × Realization × DataMaturity
 * 
 * Examples of BaselineRevenueAtRisk:
 * - Churn-at-risk revenue
 * - Pipeline value
 * - Opportunity cost/day × days reduced
 */
export function calculateRevenueBenefit(inputs: {
  upliftPct: number;
  baselineRevenueAtRisk: number;
  marginPct?: number;
  revenueRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
}): CalculationResult {
  const {
    upliftPct,
    baselineRevenueAtRisk,
    marginPct = 1.0,
    revenueRealizationMultiplier = DEFAULT_MULTIPLIERS.revenueRealizationMultiplier,
    dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
  } = inputs;

  const rawValue = upliftPct * baselineRevenueAtRisk * marginPct * revenueRealizationMultiplier * dataMaturityMultiplier;
  const roundedValue = Math.floor(rawValue / 100000) * 100000;
  
  return {
    value: roundedValue,
    trace: {
      formula: 'UpliftPct × BaselineRevenueAtRisk × MarginPct × Realization × DataMaturity',
      inputs: { upliftPct, baselineRevenueAtRisk, marginPct, revenueRealizationMultiplier, dataMaturityMultiplier },
      intermediates: { rawValue },
      output: rawValue,
    },
  };
}

/**
 * Cash Flow Benefit Calculation (Section 3.2)
 * SPEC FORMULA: CashFlowBenefit = DaysImprovement × DailyRevenue × WorkingCapitalPct × Realization × DataMaturity
 */
export function calculateCashFlowBenefit(inputs: {
  daysImprovement: number;
  dailyRevenue: number;
  workingCapitalPct?: number;
  cashFlowRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
}): CalculationResult {
  const {
    daysImprovement,
    dailyRevenue,
    workingCapitalPct = 1.0,
    cashFlowRealizationMultiplier = DEFAULT_MULTIPLIERS.cashFlowRealizationMultiplier,
    dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
  } = inputs;

  const rawValue = daysImprovement * dailyRevenue * workingCapitalPct * cashFlowRealizationMultiplier * dataMaturityMultiplier;
  const roundedValue = Math.floor(rawValue / 100000) * 100000;
  
  return {
    value: roundedValue,
    trace: {
      formula: 'DaysImprovement × DailyRevenue × WorkingCapitalPct × Realization × DataMaturity',
      inputs: { daysImprovement, dailyRevenue, workingCapitalPct, cashFlowRealizationMultiplier, dataMaturityMultiplier },
      intermediates: { rawValue },
      output: rawValue,
    },
  };
}

/**
 * Risk Benefit Calculation (Section 3.2)
 * SPEC FORMULA: RiskBenefit = (ProbBefore × ImpactBefore - ProbAfter × ImpactAfter) × Realization × DataMaturity
 */
export function calculateRiskBenefit(inputs: {
  probBefore: number;
  impactBefore: number;
  probAfter: number;
  impactAfter: number;
  riskRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
}): CalculationResult {
  const {
    probBefore,
    impactBefore,
    probAfter,
    impactAfter,
    riskRealizationMultiplier = DEFAULT_MULTIPLIERS.riskRealizationMultiplier,
    dataMaturityMultiplier = DEFAULT_MULTIPLIERS.dataMaturityMultiplier,
  } = inputs;

  const riskBefore = probBefore * impactBefore;
  const riskAfter = probAfter * impactAfter;
  const riskReduction = riskBefore - riskAfter;
  const rawValue = riskReduction * riskRealizationMultiplier * dataMaturityMultiplier;
  const roundedValue = Math.floor(rawValue / 100000) * 100000;
  
  return {
    value: roundedValue,
    trace: {
      formula: '(ProbBefore × ImpactBefore - ProbAfter × ImpactAfter) × Realization × DataMaturity',
      inputs: { probBefore, impactBefore, probAfter, impactAfter, riskRealizationMultiplier, dataMaturityMultiplier },
      intermediates: { riskBefore, riskAfter, riskReduction, rawValue },
      output: rawValue,
    },
  };
}

/**
 * Token Cost Calculation (Section 3.2)
 * SPEC FORMULA: AnnualTokenCost = 12 × ((MonthlyInputTokens/1e6 × InputPrice) + (MonthlyOutputTokens/1e6 × OutputPrice))
 */
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

/**
 * Total Annual Value Calculation (Section 3.2)
 * SPEC FORMULA: TotalAnnualValue = (CostBenefit + RevenueBenefit + CashFlowBenefit + RiskBenefit) × ProbabilityOfSuccess
 */
export function calculateTotalAnnualValue(inputs: {
  costBenefit: number;
  revenueBenefit: number;
  cashFlowBenefit: number;
  riskBenefit: number;
  probabilityOfSuccess?: number;
}): CalculationResult {
  const {
    costBenefit,
    revenueBenefit,
    cashFlowBenefit,
    riskBenefit,
    probabilityOfSuccess = DEFAULT_MULTIPLIERS.probabilityOfSuccess,
  } = inputs;

  const sumBenefits = costBenefit + revenueBenefit + cashFlowBenefit + riskBenefit;
  const rawValue = sumBenefits * probabilityOfSuccess;
  const roundedValue = Math.floor(rawValue / 100000) * 100000;
  
  return {
    value: roundedValue,
    trace: {
      formula: '(CostBenefit + RevenueBenefit + CashFlowBenefit + RiskBenefit) × ProbabilityOfSuccess',
      inputs: { costBenefit, revenueBenefit, cashFlowBenefit, riskBenefit, probabilityOfSuccess },
      intermediates: { sumBenefits, rawValue },
      output: rawValue,
    },
  };
}

/**
 * Value per Million Tokens
 * SPEC FORMULA: ValuePerMillionTokens = TotalAnnualValue / (TotalMonthlyTokens / 1M)
 */
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

/**
 * Priority Score Calculation (Section 3.2)
 * 
 * SCORING COMPONENTS (all normalized to 0-100):
 * - ValueScore: Linear scale where $10M+ = 100
 * - TTVScore: 3 months = 100, 12+ months = 0 (linear interpolation)
 * - EffortScore: Based on data readiness (higher = easier), integration complexity (lower = easier), change mgmt (lower = easier)
 * 
 * FINAL FORMULA: PriorityScore = 0.4 × ValueScore + 0.3 × TTVScore + 0.3 × EffortScore
 * Result range: 0-100
 * 
 * TIER THRESHOLDS:
 * - Critical: >= 80
 * - High: >= 60
 * - Medium: >= 40
 * - Low: < 40
 * 
 * INPUT DIRECTIONS:
 * - dataReadiness: 1-5 where 5 = HIGH readiness = EASY (better)
 * - integrationComplexity: 1-5 where 5 = HIGH complexity = HARD (worse)
 * - changeMgmt: 1-5 where 5 = HIGH change management = HARD (worse)
 */
export function calculatePriorityScore(inputs: {
  totalAnnualValue: number;
  timeToValueMonths: number;
  dataReadiness: number; // 1-5, where 5 = easy/ready
  integrationComplexity: number; // 1-5, where 5 = hard
  changeMgmt: number; // 1-5, where 5 = hard
}): CalculationResult & { 
  valueScore: number; 
  ttvScore: number; 
  effortScore: number;
} {
  const { totalAnnualValue, timeToValueMonths, dataReadiness, integrationComplexity, changeMgmt } = inputs;

  // Value Score (0-100): $10M+ = 100, linear scale below
  const valueScore = Math.min(100, Math.round((totalAnnualValue / 10_000_000) * 100));
  
  // TTV Score (0-100): 3 months = 100, 12+ months = 0, linear interpolation
  let ttvScore: number;
  if (timeToValueMonths <= 3) {
    ttvScore = 100;
  } else if (timeToValueMonths >= 12) {
    ttvScore = 0;
  } else {
    // Linear interpolation: score decreases by 100/9 per month from month 3 to 12
    ttvScore = Math.round(100 - ((timeToValueMonths - 3) / 9) * 100);
  }
  
  // Effort Score (0-100): Lower effort = higher score
  // Convert factors to "ease" scores (0-100 each):
  // - dataReadiness: 5 = easy, so easeFromData = (dataReadiness - 1) / 4 * 100
  // - integrationComplexity: 1 = easy (low complexity), so easeFromIntegration = (5 - integrationComplexity) / 4 * 100
  // - changeMgmt: 1 = easy (low change), so easeFromChange = (5 - changeMgmt) / 4 * 100
  const easeFromData = ((dataReadiness - 1) / 4) * 100;
  const easeFromIntegration = ((5 - integrationComplexity) / 4) * 100;
  const easeFromChange = ((5 - changeMgmt) / 4) * 100;
  const effortScore = Math.round((easeFromData + easeFromIntegration + easeFromChange) / 3);
  
  // Priority Score: weighted average, result is 0-100
  const priorityScore = Math.round(0.4 * valueScore + 0.3 * ttvScore + 0.3 * effortScore);
  
  return {
    value: priorityScore,
    valueScore,
    ttvScore,
    effortScore,
    trace: {
      formula: '0.4 × ValueScore + 0.3 × TTVScore + 0.3 × EffortScore',
      inputs: { totalAnnualValue, timeToValueMonths, dataReadiness, integrationComplexity, changeMgmt },
      intermediates: { 
        valueScore, 
        ttvScore, 
        effortScore, 
        easeFromData, 
        easeFromIntegration, 
        easeFromChange 
      },
      output: priorityScore,
    },
  };
}

/**
 * Priority Tier Assignment (matches 0-100 scale)
 */
export function getPriorityTier(priorityScore: number): 'Critical' | 'High' | 'Medium' | 'Low' {
  if (priorityScore >= 80) return 'Critical';
  if (priorityScore >= 60) return 'High';
  if (priorityScore >= 40) return 'Medium';
  return 'Low';
}

/**
 * Recommended Phase Assignment
 */
export function getRecommendedPhase(priorityScore: number, timeToValueMonths: number): string {
  if (priorityScore >= 80 && timeToValueMonths <= 6) return 'Q1';
  if (priorityScore >= 60 && timeToValueMonths <= 9) return 'Q2';
  if (priorityScore >= 40) return 'Q3';
  return 'Q4';
}

// Money formatter utility
export function formatMoney(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

// Percentage formatter utility
export function formatPercentage(value: number, decimals: number = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// Round timeline UP to nearest month
export function roundTimelineUp(months: number): number {
  return Math.ceil(months);
}

// Round benefits DOWN to nearest $100K
export function roundBenefitDown(value: number): number {
  return Math.floor(value / 100000) * 100000;
}
