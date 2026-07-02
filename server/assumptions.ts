// server/assumptions.ts
// Server-side calculation engine using the formula registry

import { defaultGlobalAssumptions } from '../shared/assumptions';

export interface CalculationInputs {
  global: {
    loadedHourlyRate: number;
    costRealization: number;
    revenueRealization: number;
    cashFlowRealization: number;
    riskRealization: number;
    dataMaturity: number;
  };
  useCase: {
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
  };
}

export interface CalculationTrace {
  formula: string;
  inputs: Record<string, number>;
  output: number;
}

export interface UseCaseResult {
  costBenefit: number;
  revenueBenefit: number;
  cashFlowBenefit: number;
  riskBenefit: number;
  totalAnnualValue: number;
  traces: Record<string, CalculationTrace>;
}

export function calculateUseCaseBenefits(inputs: CalculationInputs): UseCaseResult {
  const { global: g, useCase: uc } = inputs;

  const costBenefit = uc.hoursSaved * g.loadedHourlyRate * g.costRealization * g.dataMaturity;

  const revenueBenefit = uc.revenueUpliftPct * uc.baselineRevenueAtRisk * uc.marginPct * g.revenueRealization * g.dataMaturity;

  const cashFlowBenefit = uc.daysImprovement * uc.dailyRevenue * uc.workingCapitalPct * g.cashFlowRealization * g.dataMaturity;

  const riskBefore = uc.riskProbBefore * uc.riskImpactBefore;
  const riskAfter = uc.riskProbAfter * uc.riskImpactAfter;
  const riskBenefit = (riskBefore - riskAfter) * g.riskRealization * g.dataMaturity;

  const totalBeforeProbability = costBenefit + revenueBenefit + cashFlowBenefit + riskBenefit;
  const totalAnnualValue = totalBeforeProbability * uc.probabilityOfSuccess;

  return {
    costBenefit,
    revenueBenefit,
    cashFlowBenefit,
    riskBenefit,
    totalAnnualValue,
    traces: {
      costBenefit: {
        formula: 'HoursSaved × LoadedHourlyRate × CostRealization × DataMaturity',
        inputs: {
          HoursSaved: uc.hoursSaved,
          LoadedHourlyRate: g.loadedHourlyRate,
          CostRealization: g.costRealization,
          DataMaturity: g.dataMaturity,
        },
        output: costBenefit,
      },
      revenueBenefit: {
        formula: 'UpliftPct × BaselineRevenueAtRisk × MarginPct × RevenueRealization × DataMaturity',
        inputs: {
          UpliftPct: uc.revenueUpliftPct,
          BaselineRevenueAtRisk: uc.baselineRevenueAtRisk,
          MarginPct: uc.marginPct,
          RevenueRealization: g.revenueRealization,
          DataMaturity: g.dataMaturity,
        },
        output: revenueBenefit,
      },
      cashFlowBenefit: {
        formula: 'DaysImprovement × DailyRevenue × WorkingCapitalPct × CashFlowRealization × DataMaturity',
        inputs: {
          DaysImprovement: uc.daysImprovement,
          DailyRevenue: uc.dailyRevenue,
          WorkingCapitalPct: uc.workingCapitalPct,
          CashFlowRealization: g.cashFlowRealization,
          DataMaturity: g.dataMaturity,
        },
        output: cashFlowBenefit,
      },
      riskBenefit: {
        formula: '(ProbBefore × ImpactBefore - ProbAfter × ImpactAfter) × RiskRealization × DataMaturity',
        inputs: {
          ProbBefore: uc.riskProbBefore,
          ImpactBefore: uc.riskImpactBefore,
          ProbAfter: uc.riskProbAfter,
          ImpactAfter: uc.riskImpactAfter,
          RiskRealization: g.riskRealization,
          DataMaturity: g.dataMaturity,
        },
        output: riskBenefit,
      },
      totalAnnualValue: {
        formula: '(CostBenefit + RevenueBenefit + CashFlowBenefit + RiskBenefit) × ProbabilityOfSuccess',
        inputs: {
          CostBenefit: costBenefit,
          RevenueBenefit: revenueBenefit,
          CashFlowBenefit: cashFlowBenefit,
          RiskBenefit: riskBenefit,
          ProbabilityOfSuccess: uc.probabilityOfSuccess,
        },
        output: totalAnnualValue,
      },
    },
  };
}

export function renderPlaceholders(
  template: string,
  values: Record<string, string | number>
): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    const placeholder = new RegExp(`\\{${key}\\}`, 'g');
    const formattedValue = typeof value === 'number' 
      ? formatMoney(value)
      : value;
    result = result.replace(placeholder, formattedValue);
  }
  return result;
}

function formatMoney(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export { defaultGlobalAssumptions };
