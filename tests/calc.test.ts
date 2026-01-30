// tests/calc.test.ts
import { describe, it, expect } from 'vitest';
import { calculateUseCaseBenefits, type CalculationInputs } from '../server/assumptions';

describe('calculation engine', () => {
  it('computes cost benefit deterministically', () => {
    const inputs: CalculationInputs = {
      global: {
        loadedHourlyRate: 150,
        costRealization: 0.90,
        revenueRealization: 0.95,
        cashFlowRealization: 0.85,
        riskRealization: 0.80,
        dataMaturity: 0.75,
        inputTokenPricePerM: 3,
        outputTokenPricePerM: 15,
      },
      useCase: {
        hoursSaved: 34000,
        revenueUpliftPct: 0.06,
        baselineRevenueAtRisk: 89000000,
        marginPct: 1.0,
        daysImprovement: 15,
        dailyRevenue: 200000,
        workingCapitalPct: 1.0,
        riskProbBefore: 0,
        riskImpactBefore: 0,
        riskProbAfter: 0,
        riskImpactAfter: 0,
        probabilityOfSuccess: 0.85,
        runsPerMonth: 14000,
        inputTokensPerRun: 12000,
        outputTokensPerRun: 3000,
      },
    };

    const result = calculateUseCaseBenefits(inputs);
    
    // Cost benefit: 34000 * 150 * 0.90 * 0.75 = 3,442,500
    expect(result.costBenefit).toBeCloseTo(3442500, 0);
    
    // Revenue benefit: 0.06 * 89000000 * 1.0 * 0.95 * 0.75 = 3,804,750
    expect(result.revenueBenefit).toBeCloseTo(3804750, 0);
    
    // Cash flow benefit: 15 * 200000 * 1.0 * 0.85 * 0.75 = 1,912,500
    expect(result.cashFlowBenefit).toBeCloseTo(1912500, 0);
    
    // Total with probability: (3442500 + 3804750 + 1912500 + 0) * 0.85 = 7,785,787.5
    expect(result.totalAnnualValue).toBeCloseTo(7785787.5, 0);
    
    // Verify traces exist
    expect(result.traces.costBenefit).toBeDefined();
    expect(result.traces.costBenefit.formula).toContain('HoursSaved');
  });

  it('computes token costs correctly', () => {
    const inputs: CalculationInputs = {
      global: {
        loadedHourlyRate: 150,
        costRealization: 0.90,
        revenueRealization: 0.95,
        cashFlowRealization: 0.85,
        riskRealization: 0.80,
        dataMaturity: 0.75,
        inputTokenPricePerM: 3,
        outputTokenPricePerM: 15,
      },
      useCase: {
        hoursSaved: 0,
        revenueUpliftPct: 0,
        baselineRevenueAtRisk: 0,
        marginPct: 1.0,
        daysImprovement: 0,
        dailyRevenue: 0,
        workingCapitalPct: 1.0,
        riskProbBefore: 0,
        riskImpactBefore: 0,
        riskProbAfter: 0,
        riskImpactAfter: 0,
        probabilityOfSuccess: 1.0,
        runsPerMonth: 14000,
        inputTokensPerRun: 12000,
        outputTokensPerRun: 3000,
      },
    };

    const result = calculateUseCaseBenefits(inputs);
    
    // Monthly input tokens: 14000 * 12000 = 168,000,000
    expect(result.monthlyInputTokens).toBe(168000000);
    
    // Monthly output tokens: 14000 * 3000 = 42,000,000
    expect(result.monthlyOutputTokens).toBe(42000000);
    
    // Annual token cost: 12 * ((168M/1M)*3 + (42M/1M)*15) = 12 * (504 + 630) = 13,608
    expect(result.annualTokenCost).toBeCloseTo(13608, 0);
  });
});
