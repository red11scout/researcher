// shared/assumptions.ts
// Assumption types and defaults for deterministic calculations

export interface Assumption {
  id: string;
  reportId: string;
  scope: 'global' | 'kpi' | 'friction' | 'usecase';
  key: string;
  label: string;
  description?: string;
  unit?: string;
  category?: string;
  valueNumber?: number;
  valueText?: string;
  defaultValueNumber?: number;
  defaultValueText?: string;
  min?: number;
  max?: number;
  source: 'default' | 'user' | 'benchmark' | 'llm-proposed';
}

export interface UseCaseAssumptions {
  hoursSaved: number;
  revenueUpliftPct: number;
  baselineRevenueAtRisk: number;
  marginPct: number;
  daysImprovement: number;
  dailyRevenue: number;
  workingCapitalPct: number;
  riskProbBefore: number;
  riskImpactBefore: number;
  riskProbAfter: number;
  riskImpactAfter: number;
  probabilityOfSuccess: number;
}

export interface GlobalAssumptions {
  loadedHourlyRate: number;
  costRealization: number;
  revenueRealization: number;
  cashFlowRealization: number;
  riskRealization: number;
  dataMaturity: number;
  inputTokenPricePerM: number;
  outputTokenPricePerM: number;
}

export const defaultGlobalAssumptions: GlobalAssumptions = {
  loadedHourlyRate: 150,
  costRealization: 0.90,
  revenueRealization: 0.95,
  cashFlowRealization: 0.85,
  riskRealization: 0.80,
  dataMaturity: 0.75,
  inputTokenPricePerM: 3,
  outputTokenPricePerM: 15,
};

export interface CalculationTrace {
  formula: string;
  inputs: Record<string, number>;
  intermediates?: Record<string, number>;
  output: number;
}

export interface UseCaseCalculationResult {
  useCaseId: string;
  useCaseName: string;
  costBenefit: number;
  revenueBenefit: number;
  cashFlowBenefit: number;
  riskBenefit: number;
  totalAnnualValue: number;
  monthlyTokens: number;
  annualTokenCost: number;
  valuePerMillionTokens: number;
  priorityScore: number;
  traces: Record<string, CalculationTrace>;
}
