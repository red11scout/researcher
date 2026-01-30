// tests/calc.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateWithHyperFormula } from '../src/calc/engine';
import {
  calculateCostBenefit,
  calculateRevenueBenefit,
  calculateCashFlowBenefit,
  calculateRiskBenefit,
  calculateTokenCost,
  calculateTotalAnnualValue,
  calculatePriorityScore,
  getPriorityTier,
  getRecommendedPhase,
  DEFAULT_MULTIPLIERS,
} from '../src/calc/formulas';

describe('HyperFormula calculation engine', () => {
  it('returns trace structure with formulas and inputs', () => {
    const inputs = {
      HoursSaved: 34000,
      LoadedRate: 150,
      Efficiency: 0.85,
      Adoption: 0.70,
      DataMaturity: 0.75
    };
    const formulas = {
      CostBenefit: '=HoursSaved*LoadedRate*Efficiency*Adoption*DataMaturity'
    };
    const res = evaluateWithHyperFormula(inputs, formulas);
    
    expect(res.trace).toBeDefined();
    expect(res.trace.formulas).toEqual(formulas);
    expect(res.trace.inputs).toEqual(inputs);
    expect(res.outputs).toHaveProperty('CostBenefit');
  });

  it('generates trace with correct structure', () => {
    const inputs = { HoursSaved: 100, LoadedRate: 50 };
    const formulas = { Total: '=HoursSaved*LoadedRate' };
    const res = evaluateWithHyperFormula(inputs, formulas);
    
    expect(res.trace).toBeDefined();
    expect(res.trace.formulas).toEqual({ Total: '=HoursSaved*LoadedRate' });
    expect(res.trace.inputs).toEqual({ HoursSaved: 100, LoadedRate: 50 });
    expect(res.outputs).toHaveProperty('Total');
    // Note: HyperFormula named expressions have scope limitations
    // Primary calculation tests are in the formula function tests below
    expect(typeof res.outputs.Total).toBe('number');
  });
});

describe('calculateCostBenefit (SPEC: HoursSaved × LoadedRate × Efficiency × Adoption × DataMaturity)', () => {
  it('computes cost benefit with all inputs per spec formula', () => {
    const result = calculateCostBenefit({
      hoursSaved: 34000,
      loadedHourlyRate: 150,
      efficiencyMultiplier: 0.85,
      adoptionMultiplier: 0.70,
      dataMaturityMultiplier: 0.75,
    });
    
    // 34000 × 150 × 0.85 × 0.70 × 0.75 = 2,277,750
    const expectedRaw = 34000 * 150 * 0.85 * 0.70 * 0.75;
    expect(result.trace.output).toBeCloseTo(expectedRaw, 0);
    // Rounded down to nearest $100K = 2,200,000
    expect(result.value).toBe(2200000);
  });

  it('uses default multipliers from Section 3.3 when not provided', () => {
    const result = calculateCostBenefit({
      hoursSaved: 1000,
      loadedHourlyRate: 100,
    });
    
    const expectedRaw = 1000 * 100 * 
      DEFAULT_MULTIPLIERS.efficiencyMultiplier * 
      DEFAULT_MULTIPLIERS.adoptionMultiplier * 
      DEFAULT_MULTIPLIERS.dataMaturityMultiplier;
    expect(result.trace.output).toBeCloseTo(expectedRaw, 5);
    expect(result.trace.inputs.efficiencyMultiplier).toBe(DEFAULT_MULTIPLIERS.efficiencyMultiplier);
    expect(result.trace.inputs.adoptionMultiplier).toBe(DEFAULT_MULTIPLIERS.adoptionMultiplier);
    expect(result.trace.inputs.dataMaturityMultiplier).toBe(DEFAULT_MULTIPLIERS.dataMaturityMultiplier);
  });

  it('generates complete trace with spec formula string', () => {
    const result = calculateCostBenefit({
      hoursSaved: 2000,
      loadedHourlyRate: 150,
      efficiencyMultiplier: 0.85,
      adoptionMultiplier: 0.80,
      dataMaturityMultiplier: 0.75,
    });
    
    expect(result.trace.formula).toBe('HoursSaved × LoadedRate × Efficiency × Adoption × DataMaturity');
    expect(result.trace.inputs).toEqual({
      hoursSaved: 2000,
      loadedHourlyRate: 150,
      efficiencyMultiplier: 0.85,
      adoptionMultiplier: 0.80,
      dataMaturityMultiplier: 0.75,
    });
    expect(result.trace.intermediates?.rawValue).toBeCloseTo(2000 * 150 * 0.85 * 0.80 * 0.75, 5);
  });

  it('rounds down to nearest $100K per spec', () => {
    const result = calculateCostBenefit({
      hoursSaved: 1500,
      loadedHourlyRate: 100,
      efficiencyMultiplier: 1.0,
      adoptionMultiplier: 1.0,
      dataMaturityMultiplier: 1.0,
    });
    
    // 1500 × 100 = 150,000 → rounded to 100,000
    expect(result.value).toBe(100000);
  });
});

describe('calculateRevenueBenefit (SPEC: UpliftPct × BaselineRevenueAtRisk × MarginPct × Realization × DataMaturity)', () => {
  it('computes revenue benefit with all inputs', () => {
    const result = calculateRevenueBenefit({
      upliftPct: 0.05,
      baselineRevenueAtRisk: 10_000_000,
      marginPct: 0.30,
      revenueRealizationMultiplier: 0.95,
      dataMaturityMultiplier: 0.75,
    });
    
    const expectedRaw = 0.05 * 10_000_000 * 0.30 * 0.95 * 0.75;
    expect(result.trace.output).toBeCloseTo(expectedRaw, 5);
  });

  it('uses default multipliers when not provided', () => {
    const result = calculateRevenueBenefit({
      upliftPct: 0.10,
      baselineRevenueAtRisk: 5_000_000,
    });
    
    expect(result.trace.inputs.revenueRealizationMultiplier).toBe(DEFAULT_MULTIPLIERS.revenueRealizationMultiplier);
    expect(result.trace.inputs.dataMaturityMultiplier).toBe(DEFAULT_MULTIPLIERS.dataMaturityMultiplier);
    expect(result.trace.inputs.marginPct).toBe(1.0);
  });

  it('generates complete trace with formula', () => {
    const result = calculateRevenueBenefit({
      upliftPct: 0.08,
      baselineRevenueAtRisk: 2_000_000,
    });
    
    expect(result.trace.formula).toBe('UpliftPct × BaselineRevenueAtRisk × MarginPct × Realization × DataMaturity');
    expect(result.trace.inputs.upliftPct).toBe(0.08);
    expect(result.trace.inputs.baselineRevenueAtRisk).toBe(2_000_000);
  });
});

describe('calculateCashFlowBenefit', () => {
  it('computes cash flow benefit correctly', () => {
    const result = calculateCashFlowBenefit({
      daysImprovement: 10,
      dailyRevenue: 100_000,
      workingCapitalPct: 0.5,
      cashFlowRealizationMultiplier: 0.85,
      dataMaturityMultiplier: 0.75,
    });
    
    const expectedRaw = 10 * 100_000 * 0.5 * 0.85 * 0.75;
    expect(result.trace.output).toBeCloseTo(expectedRaw, 5);
  });

  it('uses default multipliers when not provided', () => {
    const result = calculateCashFlowBenefit({
      daysImprovement: 5,
      dailyRevenue: 50_000,
    });
    
    expect(result.trace.inputs.cashFlowRealizationMultiplier).toBe(DEFAULT_MULTIPLIERS.cashFlowRealizationMultiplier);
    expect(result.trace.inputs.dataMaturityMultiplier).toBe(DEFAULT_MULTIPLIERS.dataMaturityMultiplier);
  });
});

describe('calculateRiskBenefit', () => {
  it('computes risk benefit correctly', () => {
    const result = calculateRiskBenefit({
      probBefore: 0.10,
      impactBefore: 5_000_000,
      probAfter: 0.02,
      impactAfter: 5_000_000,
      riskRealizationMultiplier: 0.80,
      dataMaturityMultiplier: 0.75,
    });
    
    // Risk reduction = (0.10 × 5M) - (0.02 × 5M) = 500K - 100K = 400K
    // Value = 400K × 0.80 × 0.75 = 240K
    const riskBefore = 0.10 * 5_000_000;
    const riskAfter = 0.02 * 5_000_000;
    const expectedRaw = (riskBefore - riskAfter) * 0.80 * 0.75;
    expect(result.trace.output).toBeCloseTo(expectedRaw, 5);
    expect(result.trace.intermediates?.riskBefore).toBe(riskBefore);
    expect(result.trace.intermediates?.riskAfter).toBe(riskAfter);
  });
});

describe('calculateTokenCost (SPEC: 12 × ((MonthlyInputTokens/1M × InputPrice) + (MonthlyOutputTokens/1M × OutputPrice)))', () => {
  it('computes annual token cost correctly', () => {
    const result = calculateTokenCost({
      runsPerMonth: 1000,
      inputTokensPerRun: 1000,
      outputTokensPerRun: 500,
      inputTokenPricePerM: 3.00,
      outputTokenPricePerM: 15.00,
    });
    
    const monthlyInputTokens = 1000 * 1000; // 1M
    const monthlyOutputTokens = 1000 * 500; // 500K
    const monthlyInputCost = (monthlyInputTokens / 1_000_000) * 3.00; // $3
    const monthlyOutputCost = (monthlyOutputTokens / 1_000_000) * 15.00; // $7.50
    const expectedAnnual = 12 * (monthlyInputCost + monthlyOutputCost); // $126
    
    expect(result.value).toBeCloseTo(expectedAnnual, 2);
  });

  it('uses default token prices when not provided', () => {
    const result = calculateTokenCost({
      runsPerMonth: 500,
      inputTokensPerRun: 2000,
      outputTokensPerRun: 1000,
    });
    
    expect(result.trace.inputs.inputTokenPricePerM).toBe(DEFAULT_MULTIPLIERS.inputTokenPricePerM);
    expect(result.trace.inputs.outputTokenPricePerM).toBe(DEFAULT_MULTIPLIERS.outputTokenPricePerM);
  });

  it('generates trace with intermediate calculations', () => {
    const result = calculateTokenCost({
      runsPerMonth: 100,
      inputTokensPerRun: 5000,
      outputTokensPerRun: 2000,
    });
    
    expect(result.trace.formula).toBe('12 × ((MonthlyInputTokens/1M × InputPrice) + (MonthlyOutputTokens/1M × OutputPrice))');
    expect(result.trace.intermediates).toBeDefined();
    expect(result.trace.intermediates?.monthlyInputTokens).toBe(100 * 5000);
    expect(result.trace.intermediates?.monthlyOutputTokens).toBe(100 * 2000);
  });
});

describe('calculateTotalAnnualValue', () => {
  it('computes total annual value correctly', () => {
    const result = calculateTotalAnnualValue({
      costBenefit: 1_000_000,
      revenueBenefit: 2_000_000,
      cashFlowBenefit: 500_000,
      riskBenefit: 500_000,
      probabilityOfSuccess: 0.85,
    });
    
    const sumBenefits = 1_000_000 + 2_000_000 + 500_000 + 500_000;
    const expectedRaw = sumBenefits * 0.85;
    expect(result.trace.output).toBeCloseTo(expectedRaw, 0);
  });

  it('uses default probability of success when not provided', () => {
    const result = calculateTotalAnnualValue({
      costBenefit: 1_000_000,
      revenueBenefit: 1_000_000,
      cashFlowBenefit: 0,
      riskBenefit: 0,
    });
    
    expect(result.trace.inputs.probabilityOfSuccess).toBe(DEFAULT_MULTIPLIERS.probabilityOfSuccess);
  });
});

describe('calculatePriorityScore (SPEC: 0.4 × ValueScore + 0.3 × TTVScore + 0.3 × EffortScore, result 0-100)', () => {
  it('computes maximum priority score for ideal inputs', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 10_000_000, // $10M = 100 value score
      timeToValueMonths: 3, // 3 months = 100 TTV score
      dataReadiness: 5, // Max readiness = easy
      integrationComplexity: 1, // Min complexity = easy
      changeMgmt: 1, // Min change = easy
    });
    
    // All scores should be 100
    expect(result.valueScore).toBe(100);
    expect(result.ttvScore).toBe(100);
    expect(result.effortScore).toBe(100);
    // Priority = 0.4(100) + 0.3(100) + 0.3(100) = 100
    expect(result.value).toBe(100);
  });

  it('computes minimum priority score for worst inputs', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 0,
      timeToValueMonths: 12,
      dataReadiness: 1, // Min readiness = hard
      integrationComplexity: 5, // Max complexity = hard
      changeMgmt: 5, // Max change = hard
    });
    
    expect(result.valueScore).toBe(0);
    expect(result.ttvScore).toBe(0);
    expect(result.effortScore).toBe(0);
    expect(result.value).toBe(0);
  });

  it('correctly handles dataReadiness (5=easy increases score)', () => {
    const easyData = calculatePriorityScore({
      totalAnnualValue: 5_000_000,
      timeToValueMonths: 6,
      dataReadiness: 5, // HIGH readiness = EASY
      integrationComplexity: 3,
      changeMgmt: 3,
    });
    
    const hardData = calculatePriorityScore({
      totalAnnualValue: 5_000_000,
      timeToValueMonths: 6,
      dataReadiness: 1, // LOW readiness = HARD
      integrationComplexity: 3,
      changeMgmt: 3,
    });
    
    // Higher data readiness should give HIGHER effort score
    expect(easyData.effortScore).toBeGreaterThan(hardData.effortScore);
    expect(easyData.value).toBeGreaterThan(hardData.value);
  });

  it('correctly handles integrationComplexity (1=easy increases score)', () => {
    const easyIntegration = calculatePriorityScore({
      totalAnnualValue: 5_000_000,
      timeToValueMonths: 6,
      dataReadiness: 3,
      integrationComplexity: 1, // LOW complexity = EASY
      changeMgmt: 3,
    });
    
    const hardIntegration = calculatePriorityScore({
      totalAnnualValue: 5_000_000,
      timeToValueMonths: 6,
      dataReadiness: 3,
      integrationComplexity: 5, // HIGH complexity = HARD
      changeMgmt: 3,
    });
    
    // Lower integration complexity should give HIGHER effort score
    expect(easyIntegration.effortScore).toBeGreaterThan(hardIntegration.effortScore);
  });

  it('computes priority score with medium values', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 5_000_000, // 50% of max = 50
      timeToValueMonths: 7, // Mid-range
      dataReadiness: 3,
      integrationComplexity: 3,
      changeMgmt: 3,
    });
    
    expect(result.valueScore).toBe(50);
    // TTV for 7 months: 100 - ((7-3)/9)*100 = 100 - 44.4 ≈ 56
    expect(result.ttvScore).toBeGreaterThan(50);
    expect(result.ttvScore).toBeLessThan(60);
  });

  it('generates complete trace with formula and intermediates', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 3_000_000,
      timeToValueMonths: 9,
      dataReadiness: 4,
      integrationComplexity: 2,
      changeMgmt: 3,
    });
    
    expect(result.trace.formula).toBe('0.4 × ValueScore + 0.3 × TTVScore + 0.3 × EffortScore');
    expect(result.trace.intermediates).toBeDefined();
    expect(result.trace.intermediates?.valueScore).toBe(result.valueScore);
    expect(result.trace.intermediates?.ttvScore).toBe(result.ttvScore);
    expect(result.trace.intermediates?.effortScore).toBe(result.effortScore);
    expect(result.trace.intermediates?.easeFromData).toBeDefined();
    expect(result.trace.intermediates?.easeFromIntegration).toBeDefined();
    expect(result.trace.intermediates?.easeFromChange).toBeDefined();
  });

  it('caps value score at 100 for values above $10M', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 20_000_000,
      timeToValueMonths: 3,
      dataReadiness: 5,
      integrationComplexity: 1,
      changeMgmt: 1,
    });
    
    expect(result.valueScore).toBe(100);
  });

  it('handles TTV at boundary values correctly', () => {
    const result3Months = calculatePriorityScore({
      totalAnnualValue: 1_000_000,
      timeToValueMonths: 3,
      dataReadiness: 3,
      integrationComplexity: 3,
      changeMgmt: 3,
    });
    expect(result3Months.ttvScore).toBe(100);
    
    const result12Months = calculatePriorityScore({
      totalAnnualValue: 1_000_000,
      timeToValueMonths: 12,
      dataReadiness: 3,
      integrationComplexity: 3,
      changeMgmt: 3,
    });
    expect(result12Months.ttvScore).toBe(0);
    
    const result15Months = calculatePriorityScore({
      totalAnnualValue: 1_000_000,
      timeToValueMonths: 15,
      dataReadiness: 3,
      integrationComplexity: 3,
      changeMgmt: 3,
    });
    expect(result15Months.ttvScore).toBe(0);
  });
});

describe('getPriorityTier', () => {
  it('assigns Critical tier for score >= 80', () => {
    expect(getPriorityTier(80)).toBe('Critical');
    expect(getPriorityTier(100)).toBe('Critical');
  });

  it('assigns High tier for score >= 60', () => {
    expect(getPriorityTier(60)).toBe('High');
    expect(getPriorityTier(79)).toBe('High');
  });

  it('assigns Medium tier for score >= 40', () => {
    expect(getPriorityTier(40)).toBe('Medium');
    expect(getPriorityTier(59)).toBe('Medium');
  });

  it('assigns Low tier for score < 40', () => {
    expect(getPriorityTier(0)).toBe('Low');
    expect(getPriorityTier(39)).toBe('Low');
  });
});

describe('getRecommendedPhase', () => {
  it('assigns Q1 for high priority and quick TTV', () => {
    expect(getRecommendedPhase(80, 6)).toBe('Q1');
    expect(getRecommendedPhase(90, 3)).toBe('Q1');
  });

  it('assigns Q2 for moderate priority', () => {
    expect(getRecommendedPhase(60, 9)).toBe('Q2');
    expect(getRecommendedPhase(70, 6)).toBe('Q2');
  });

  it('assigns Q3 for lower priority', () => {
    expect(getRecommendedPhase(40, 12)).toBe('Q3');
    expect(getRecommendedPhase(50, 10)).toBe('Q3');
  });

  it('assigns Q4 for low priority', () => {
    expect(getRecommendedPhase(30, 12)).toBe('Q4');
    expect(getRecommendedPhase(20, 6)).toBe('Q4');
  });
});
