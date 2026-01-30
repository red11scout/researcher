// src/calc/formulas.ts
// Formula registry for deterministic calculations

export interface FormulaDefinition {
  name: string;
  description: string;
  formula: string;
  inputs: string[];
  category: 'cost' | 'revenue' | 'cashFlow' | 'risk' | 'tokens' | 'scoring';
}

export const formulaRegistry: Record<string, FormulaDefinition> = {
  costBenefit: {
    name: 'Cost Benefit',
    description: 'Annual cost savings from hours saved',
    formula: '=HoursSaved*LoadedHourlyRate*CostRealization*DataMaturity',
    inputs: ['HoursSaved', 'LoadedHourlyRate', 'CostRealization', 'DataMaturity'],
    category: 'cost',
  },
  revenueBenefit: {
    name: 'Revenue Benefit',
    description: 'Annual revenue uplift from AI implementation',
    formula: '=UpliftPct*BaselineRevenueAtRisk*MarginPct*RevenueRealization*DataMaturity',
    inputs: ['UpliftPct', 'BaselineRevenueAtRisk', 'MarginPct', 'RevenueRealization', 'DataMaturity'],
    category: 'revenue',
  },
  cashFlowBenefit: {
    name: 'Cash Flow Benefit',
    description: 'Annual cash flow improvement',
    formula: '=DaysImprovement*DailyRevenue*WorkingCapitalPct*CashFlowRealization*DataMaturity',
    inputs: ['DaysImprovement', 'DailyRevenue', 'WorkingCapitalPct', 'CashFlowRealization', 'DataMaturity'],
    category: 'cashFlow',
  },
  riskBenefit: {
    name: 'Risk Benefit',
    description: 'Annual risk reduction value',
    formula: '=(ProbBefore*ImpactBefore-ProbAfter*ImpactAfter)*RiskRealization*DataMaturity',
    inputs: ['ProbBefore', 'ImpactBefore', 'ProbAfter', 'ImpactAfter', 'RiskRealization', 'DataMaturity'],
    category: 'risk',
  },
  monthlyInputTokens: {
    name: 'Monthly Input Tokens',
    description: 'Total input tokens per month',
    formula: '=RunsPerMonth*InputTokensPerRun',
    inputs: ['RunsPerMonth', 'InputTokensPerRun'],
    category: 'tokens',
  },
  monthlyOutputTokens: {
    name: 'Monthly Output Tokens',
    description: 'Total output tokens per month',
    formula: '=RunsPerMonth*OutputTokensPerRun',
    inputs: ['RunsPerMonth', 'OutputTokensPerRun'],
    category: 'tokens',
  },
  annualTokenCost: {
    name: 'Annual Token Cost',
    description: 'Total annual cost of AI tokens',
    formula: '=12*((MonthlyInputTokens/1000000)*InputTokenPricePerM+(MonthlyOutputTokens/1000000)*OutputTokenPricePerM)',
    inputs: ['MonthlyInputTokens', 'MonthlyOutputTokens', 'InputTokenPricePerM', 'OutputTokenPricePerM'],
    category: 'tokens',
  },
  totalAnnualValue: {
    name: 'Total Annual Value',
    description: 'Sum of all benefit categories with probability adjustment',
    formula: '=(CostBenefit+RevenueBenefit+CashFlowBenefit+RiskBenefit)*ProbabilityOfSuccess',
    inputs: ['CostBenefit', 'RevenueBenefit', 'CashFlowBenefit', 'RiskBenefit', 'ProbabilityOfSuccess'],
    category: 'scoring',
  },
  valuePerMillionTokens: {
    name: 'Value per Million Tokens',
    description: 'Annual value generated per million tokens consumed',
    formula: '=TotalAnnualValue/(TotalMonthlyTokens/1000000)',
    inputs: ['TotalAnnualValue', 'TotalMonthlyTokens'],
    category: 'scoring',
  },
};

export const defaultGlobalAssumptions = {
  loadedHourlyRate: { value: 150, unit: 'USD/hour', category: 'Cost' },
  costRealization: { value: 0.90, unit: 'multiplier', category: 'Cost' },
  revenueRealization: { value: 0.95, unit: 'multiplier', category: 'Revenue' },
  cashFlowRealization: { value: 0.85, unit: 'multiplier', category: 'Cash Flow' },
  riskRealization: { value: 0.80, unit: 'multiplier', category: 'Risk' },
  dataMaturity: { value: 0.75, unit: 'multiplier', category: 'Global' },
  inputTokenPricePerM: { value: 3, unit: 'USD per 1M', category: 'Tokens' },
  outputTokenPricePerM: { value: 15, unit: 'USD per 1M', category: 'Tokens' },
};

export function formatMoney(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}
