// src/calc/formulas.ts
// Deterministic Formula Registry for BlueAlly AI Calculations
// All monetary outputs must store a trace: formula + resolved inputs + intermediate steps

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

// Global default multipliers
export const DEFAULT_MULTIPLIERS = {
  costRealization: 0.90,
  revenueRealization: 0.95,
  cashFlowRealization: 0.85,
  riskRealization: 0.80,
  dataMaturity: 0.75,
  probabilityOfSuccess: 0.85,
  loadedHourlyRate: 150,
  inputTokenPricePerM: 3.00,
  outputTokenPricePerM: 15.00,
};

/**
 * Cost Benefit Calculation
 * Formula: CostBenefit = HoursSaved × LoadedRate × CostRealization × DataMaturity
 */
export function calculateCostBenefit(inputs: {
  hoursSaved: number;
  loadedHourlyRate: number;
  costRealization?: number;
  dataMaturity?: number;
}): CalculationResult {
  const {
    hoursSaved,
    loadedHourlyRate,
    costRealization = DEFAULT_MULTIPLIERS.costRealization,
    dataMaturity = DEFAULT_MULTIPLIERS.dataMaturity,
  } = inputs;

  const value = hoursSaved * loadedHourlyRate * costRealization * dataMaturity;
  
  return {
    value: Math.floor(value / 100000) * 100000, // Round DOWN to nearest $100K
    trace: {
      formula: 'HoursSaved × LoadedHourlyRate × CostRealization × DataMaturity',
      inputs: { hoursSaved, loadedHourlyRate, costRealization, dataMaturity },
      output: value,
    },
  };
}

/**
 * Revenue Benefit Calculation
 * Formula: RevenueBenefit = UpliftPct × BaselineRevenue × MarginPct × RevenueRealization × DataMaturity
 */
export function calculateRevenueBenefit(inputs: {
  upliftPct: number;
  baselineRevenue: number;
  marginPct?: number;
  revenueRealization?: number;
  dataMaturity?: number;
}): CalculationResult {
  const {
    upliftPct,
    baselineRevenue,
    marginPct = 1.0,
    revenueRealization = DEFAULT_MULTIPLIERS.revenueRealization,
    dataMaturity = DEFAULT_MULTIPLIERS.dataMaturity,
  } = inputs;

  const value = upliftPct * baselineRevenue * marginPct * revenueRealization * dataMaturity;
  
  return {
    value: Math.floor(value / 100000) * 100000,
    trace: {
      formula: 'UpliftPct × BaselineRevenue × MarginPct × RevenueRealization × DataMaturity',
      inputs: { upliftPct, baselineRevenue, marginPct, revenueRealization, dataMaturity },
      output: value,
    },
  };
}

/**
 * Cash Flow Benefit Calculation
 * Formula: CashFlowBenefit = DaysImprovement × DailyRevenue × WorkingCapitalPct × CashFlowRealization × DataMaturity
 */
export function calculateCashFlowBenefit(inputs: {
  daysImprovement: number;
  dailyRevenue: number;
  workingCapitalPct?: number;
  cashFlowRealization?: number;
  dataMaturity?: number;
}): CalculationResult {
  const {
    daysImprovement,
    dailyRevenue,
    workingCapitalPct = 1.0,
    cashFlowRealization = DEFAULT_MULTIPLIERS.cashFlowRealization,
    dataMaturity = DEFAULT_MULTIPLIERS.dataMaturity,
  } = inputs;

  const value = daysImprovement * dailyRevenue * workingCapitalPct * cashFlowRealization * dataMaturity;
  
  return {
    value: Math.floor(value / 100000) * 100000,
    trace: {
      formula: 'DaysImprovement × DailyRevenue × WorkingCapitalPct × CashFlowRealization × DataMaturity',
      inputs: { daysImprovement, dailyRevenue, workingCapitalPct, cashFlowRealization, dataMaturity },
      output: value,
    },
  };
}

/**
 * Risk Benefit Calculation
 * Formula: RiskBenefit = (ProbBefore × ImpactBefore - ProbAfter × ImpactAfter) × RiskRealization × DataMaturity
 */
export function calculateRiskBenefit(inputs: {
  probBefore: number;
  impactBefore: number;
  probAfter: number;
  impactAfter: number;
  riskRealization?: number;
  dataMaturity?: number;
}): CalculationResult {
  const {
    probBefore,
    impactBefore,
    probAfter,
    impactAfter,
    riskRealization = DEFAULT_MULTIPLIERS.riskRealization,
    dataMaturity = DEFAULT_MULTIPLIERS.dataMaturity,
  } = inputs;

  const riskBefore = probBefore * impactBefore;
  const riskAfter = probAfter * impactAfter;
  const riskReduction = riskBefore - riskAfter;
  const value = riskReduction * riskRealization * dataMaturity;
  
  return {
    value: Math.floor(value / 100000) * 100000,
    trace: {
      formula: '(ProbBefore × ImpactBefore - ProbAfter × ImpactAfter) × RiskRealization × DataMaturity',
      inputs: { probBefore, impactBefore, probAfter, impactAfter, riskRealization, dataMaturity },
      intermediates: { riskBefore, riskAfter, riskReduction },
      output: value,
    },
  };
}

/**
 * Token Cost Calculation
 * Formula: AnnualTokenCost = 12 × ((MonthlyInputTokens/1e6 × InputPrice) + (MonthlyOutputTokens/1e6 × OutputPrice))
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
 * Total Annual Value Calculation
 * Formula: TotalAnnualValue = (CostBenefit + RevenueBenefit + CashFlowBenefit + RiskBenefit) × ProbabilityOfSuccess
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
  const value = sumBenefits * probabilityOfSuccess;
  
  return {
    value: Math.floor(value / 100000) * 100000,
    trace: {
      formula: '(CostBenefit + RevenueBenefit + CashFlowBenefit + RiskBenefit) × ProbabilityOfSuccess',
      inputs: { costBenefit, revenueBenefit, cashFlowBenefit, riskBenefit, probabilityOfSuccess },
      intermediates: { sumBenefits },
      output: value,
    },
  };
}

/**
 * Value per Million Tokens
 * Formula: ValuePerMillionTokens = TotalAnnualValue / (TotalMonthlyTokens / 1M)
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
 * Priority Score Calculation
 * ValueScore (0-40): Linear scale where >= $9M = 40
 * TTVScore (0-30): 3 months = 30, 12 months = 5 (piecewise)
 * EffortScore (0-30): Inverse of complexity
 * PriorityScore = 0.4 × ValueScore + 0.3 × TTVScore + 0.3 × EffortScore
 */
export function calculatePriorityScore(inputs: {
  totalAnnualValue: number;
  timeToValueMonths: number;
  dataReadiness: number; // 1-5
  integrationComplexity: number; // 1-5
  changeMgmt: number; // 1-5
}): CalculationResult & { 
  valueScore: number; 
  ttvScore: number; 
  effortScore: number;
} {
  const { totalAnnualValue, timeToValueMonths, dataReadiness, integrationComplexity, changeMgmt } = inputs;

  // Value Score (0-40): $9M+ = 40, linear scale below
  const valueScore = Math.min(40, Math.round((totalAnnualValue / 9_000_000) * 40));
  
  // TTV Score (0-30): 3 months = 30, 12 months = 5, linear interpolation
  let ttvScore: number;
  if (timeToValueMonths <= 3) {
    ttvScore = 30;
  } else if (timeToValueMonths >= 12) {
    ttvScore = 5;
  } else {
    ttvScore = Math.round(30 - ((timeToValueMonths - 3) / 9) * 25);
  }
  
  // Effort Score (0-30): Average of (6 - complexity) factors, scaled to 30
  const avgComplexity = (dataReadiness + integrationComplexity + changeMgmt) / 3;
  const effortScore = Math.round(((6 - avgComplexity) / 5) * 30);
  
  // Priority Score
  const priorityScore = Math.round(0.4 * valueScore + 0.3 * ttvScore + 0.3 * effortScore);
  
  return {
    value: priorityScore,
    valueScore,
    ttvScore,
    effortScore,
    trace: {
      formula: '0.4 × ValueScore + 0.3 × TTVScore + 0.3 × EffortScore',
      inputs: { totalAnnualValue, timeToValueMonths, dataReadiness, integrationComplexity, changeMgmt },
      intermediates: { valueScore, ttvScore, effortScore, avgComplexity },
      output: priorityScore,
    },
  };
}

/**
 * Priority Tier Assignment
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
