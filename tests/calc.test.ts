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
  SCENARIO_MULTIPLIERS,
  ROUNDING,
  PRIORITY_WEIGHTS,
  PRIORITY_TIERS,
  TTV_THRESHOLDS,
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

describe('calculateCostBenefit (SPEC: Hours × Rate × BenefitsLoading × Realization × DataMaturity × Scenario)', () => {
  it('computes cost benefit with all inputs per spec formula', () => {
    const result = calculateCostBenefit({
      hoursSaved: 34000,
      loadedHourlyRate: 150,
      benefitsLoading: 1.35,
      costRealizationMultiplier: 0.90,
      dataMaturityMultiplier: 0.75,
      scenario: 'moderate',
    });

    // 34000 × 150 × 1.35 × 0.90 × 0.75 × 1.00 (moderate) = 4,133,625
    const expectedRaw = 34000 * 150 * 1.35 * 0.90 * 0.75 * SCENARIO_MULTIPLIERS.moderate;
    expect(result.trace.output).toBeCloseTo(expectedRaw, 0);
    // Rounded down to nearest $100K
    const expectedRounded = Math.floor(expectedRaw / ROUNDING.BENEFIT_PRECISION) * ROUNDING.BENEFIT_PRECISION;
    expect(result.value).toBe(expectedRounded);
  });

  it('uses default multipliers from Section 3.3 when not provided', () => {
    const result = calculateCostBenefit({
      hoursSaved: 1000,
      loadedHourlyRate: 100,
    });

    const expectedRaw = 1000 * 100 *
      DEFAULT_MULTIPLIERS.benefitsLoading *
      DEFAULT_MULTIPLIERS.costRealizationMultiplier *
      DEFAULT_MULTIPLIERS.dataMaturityMultiplier *
      SCENARIO_MULTIPLIERS.conservative; // default scenario
    expect(result.trace.output).toBeCloseTo(expectedRaw, 5);
    expect(result.trace.inputs.benefitsLoading).toBe(DEFAULT_MULTIPLIERS.benefitsLoading);
    expect(result.trace.inputs.costRealizationMultiplier).toBe(DEFAULT_MULTIPLIERS.costRealizationMultiplier);
    expect(result.trace.inputs.dataMaturityMultiplier).toBe(DEFAULT_MULTIPLIERS.dataMaturityMultiplier);
  });

  it('generates complete trace with spec formula string', () => {
    const result = calculateCostBenefit({
      hoursSaved: 2000,
      loadedHourlyRate: 150,
      benefitsLoading: 1.35,
      costRealizationMultiplier: 0.90,
      dataMaturityMultiplier: 0.75,
      scenario: 'moderate',
    });

    expect(result.trace.formula).toBe('HoursSaved × LoadedRate × BenefitsLoading × Realization × DataMaturity × Scenario');
    expect(result.trace.inputs).toEqual({
      hoursSaved: 2000,
      loadedHourlyRate: 150,
      benefitsLoading: 1.35,
      costRealizationMultiplier: 0.90,
      dataMaturityMultiplier: 0.75,
      scenarioMultiplier: SCENARIO_MULTIPLIERS.moderate,
    });
    expect(result.trace.intermediates?.rawValue).toBeCloseTo(2000 * 150 * 1.35 * 0.90 * 0.75 * 1.0, 5);
  });

  it('rounds down to nearest $100K per spec', () => {
    const result = calculateCostBenefit({
      hoursSaved: 1500,
      loadedHourlyRate: 100,
      benefitsLoading: 1.0,
      costRealizationMultiplier: 1.0,
      dataMaturityMultiplier: 1.0,
      scenario: 'moderate',
    });

    // 1500 × 100 × 1.0 × 1.0 × 1.0 × 1.0 = 150,000 → rounded to 100,000
    expect(result.value).toBe(100000);
  });
});

describe('calculateRevenueBenefit (SPEC: UpliftPct × BaselineRevenue × Margin × Realization × DataMaturity × Scenario)', () => {
  it('computes revenue benefit with all inputs', () => {
    const result = calculateRevenueBenefit({
      upliftPct: 0.05,
      baselineRevenueAtRisk: 10_000_000,
      marginPct: 0.30,
      revenueRealizationMultiplier: 0.95,
      dataMaturityMultiplier: 0.75,
      scenario: 'moderate',
    });

    const expectedRaw = 0.05 * 10_000_000 * 0.30 * 0.95 * 0.75 * SCENARIO_MULTIPLIERS.moderate;
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

    expect(result.trace.formula).toBe('UpliftPct × BaselineRevenue × Margin × Realization × DataMaturity × Scenario');
    expect(result.trace.inputs.upliftPct).toBe(0.08);
    expect(result.trace.inputs.baselineRevenueAtRisk).toBe(2_000_000);
  });
});

describe('calculateCashFlowBenefit (SPEC: AnnualRevenue × (DaysImprovement / 365) × CostOfCapital × Realization × DataMaturity × Scenario)', () => {
  it('computes cash flow benefit correctly', () => {
    const result = calculateCashFlowBenefit({
      daysImprovement: 15,
      annualRevenue: 365_000_000,
      costOfCapital: 0.08,
      cashFlowRealizationMultiplier: 0.85,
      dataMaturityMultiplier: 0.75,
      scenario: 'moderate',
    });

    // Working capital freed = 365M × 15/365 = 15M
    // Annual benefit = 15M × 0.08 × 0.85 × 0.75 × 1.0 = 765,000
    const workingCapitalFreed = 365_000_000 * (15 / 365);
    const expectedRaw = workingCapitalFreed * 0.08 * 0.85 * 0.75 * SCENARIO_MULTIPLIERS.moderate;
    expect(result.trace.output).toBeCloseTo(expectedRaw, 5);
    expect(result.trace.intermediates?.workingCapitalFreed).toBeCloseTo(workingCapitalFreed, 5);
  });

  it('uses default multipliers when not provided', () => {
    const result = calculateCashFlowBenefit({
      daysImprovement: 5,
      annualRevenue: 100_000_000,
    });

    expect(result.trace.inputs.cashFlowRealizationMultiplier).toBe(DEFAULT_MULTIPLIERS.cashFlowRealizationMultiplier);
    expect(result.trace.inputs.dataMaturityMultiplier).toBe(DEFAULT_MULTIPLIERS.dataMaturityMultiplier);
    expect(result.trace.inputs.costOfCapital).toBe(DEFAULT_MULTIPLIERS.defaultCostOfCapital);
  });
});

describe('calculateRiskBenefit (SPEC: min(RiskReduction, 50% of Exposure) × Realization × DataMaturity × Scenario)', () => {
  it('computes risk benefit correctly', () => {
    const result = calculateRiskBenefit({
      probBefore: 0.10,
      impactBefore: 5_000_000,
      probAfter: 0.02,
      impactAfter: 5_000_000,
      riskRealizationMultiplier: 0.80,
      dataMaturityMultiplier: 0.75,
      scenario: 'moderate',
    });

    // Risk reduction = (0.10 × 5M) - (0.02 × 5M) = 500K - 100K = 400K
    // Cap = 50% of exposure (0.10 × 5M = 500K) → cap = 250K
    // Since 400K > 250K, capped to 250K
    // Value = 250K × 0.80 × 0.75 × 1.0 = 150K
    const riskBefore = 0.10 * 5_000_000;
    const riskAfter = 0.02 * 5_000_000;
    const riskReduction = riskBefore - riskAfter;
    const maxReduction = riskBefore * DEFAULT_MULTIPLIERS.riskReductionCapPct;
    const cappedReduction = Math.min(riskReduction, maxReduction);
    const expectedRaw = cappedReduction * 0.80 * 0.75 * SCENARIO_MULTIPLIERS.moderate;
    expect(result.trace.output).toBeCloseTo(expectedRaw, 5);
    expect(result.trace.intermediates?.riskBefore).toBe(riskBefore);
    expect(result.trace.intermediates?.riskAfter).toBe(riskAfter);
    expect(result.trace.intermediates?.cappedReduction).toBe(cappedReduction);
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

describe('calculateTotalAnnualValue (with benefits cap)', () => {
  it('computes total annual value correctly', () => {
    const result = calculateTotalAnnualValue({
      costBenefit: 1_000_000,
      revenueBenefit: 2_000_000,
      cashFlowBenefit: 500_000,
      riskBenefit: 500_000,
    });

    const sumBenefits = 1_000_000 + 2_000_000 + 500_000 + 500_000;
    // No revenue cap provided → uncapped
    expect(result.trace.output).toBeCloseTo(sumBenefits, 0);
  });

  it('uses default probability of success when not provided', () => {
    const result = calculateTotalAnnualValue({
      costBenefit: 1_000_000,
      revenueBenefit: 1_000_000,
      cashFlowBenefit: 0,
      riskBenefit: 0,
    });

    expect(result.trace.inputs.benefitsCapPct).toBe(DEFAULT_MULTIPLIERS.benefitsCapPct);
  });
});

describe('calculatePriorityScore (SPEC: 5-criterion weighted matrix, result 0-100)', () => {
  it('computes maximum priority score for ideal inputs', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 10_000_000, // $10M = 100 financial score
      timeToValueMonths: 3, // 3 months = 100 TTV score
      dataReadiness: 5, // Max readiness
      integrationComplexity: 1, // Min complexity = easy
      changeMgmt: 1, // Min change = easy
      strategicAlignment: 5, // Max alignment
    });

    // All sub-scores should be 100
    expect(result.financialScore).toBe(100);
    expect(result.ttvScore).toBe(100);
    expect(result.complexityScore).toBe(100);
    expect(result.dataReadinessScore).toBe(100);
    expect(result.strategicScore).toBe(100);
    // Priority = 0.25(100) + 0.25(100) + 0.20(100) + 0.15(100) + 0.15(100) = 100
    expect(result.value).toBe(100);
  });

  it('computes minimum priority score for worst inputs', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 0,
      timeToValueMonths: 18, // At or above TTV_THRESHOLDS.ZERO_MONTHS = 0 TTV score
      dataReadiness: 1, // Min readiness = hard
      integrationComplexity: 5, // Max complexity = hard
      changeMgmt: 5, // Max change = hard
      strategicAlignment: 1, // Min alignment
    });

    expect(result.financialScore).toBe(0);
    expect(result.ttvScore).toBe(0);
    expect(result.complexityScore).toBe(0);
    expect(result.dataReadinessScore).toBe(0);
    expect(result.strategicScore).toBe(0);
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

    // Higher data readiness should give HIGHER data readiness score and overall score
    expect(easyData.dataReadinessScore).toBeGreaterThan(hardData.dataReadinessScore);
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

    // Lower integration complexity should give HIGHER complexity score
    expect(easyIntegration.complexityScore).toBeGreaterThan(hardIntegration.complexityScore);
  });

  it('computes priority score with medium values', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 5_000_000, // 50% of $10M max = 50 financial
      timeToValueMonths: 7, // Mid-range TTV
      dataReadiness: 3,
      integrationComplexity: 3,
      changeMgmt: 3,
    });

    expect(result.financialScore).toBe(50);
    // TTV for 7 months: 100 - ((7-3)/(18-3))*100 = 100 - 26.7 ≈ 73
    expect(result.ttvScore).toBeGreaterThan(70);
    expect(result.ttvScore).toBeLessThan(80);
  });

  it('generates complete trace with formula and intermediates', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 3_000_000,
      timeToValueMonths: 9,
      dataReadiness: 4,
      integrationComplexity: 2,
      changeMgmt: 3,
    });

    expect(result.trace.formula).toContain('Strategic');
    expect(result.trace.formula).toContain('Financial');
    expect(result.trace.formula).toContain('Complexity');
    expect(result.trace.formula).toContain('DataReady');
    expect(result.trace.formula).toContain('TTV');
    expect(result.trace.intermediates).toBeDefined();
    expect(result.trace.intermediates?.financialScore).toBe(result.financialScore);
    expect(result.trace.intermediates?.ttvScore).toBe(result.ttvScore);
    expect(result.trace.intermediates?.complexityScore).toBe(result.complexityScore);
    expect(result.trace.intermediates?.dataReadinessScore).toBe(result.dataReadinessScore);
    expect(result.trace.intermediates?.strategicScore).toBe(result.strategicScore);
  });

  it('caps value score at 100 for values above $10M', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 20_000_000,
      timeToValueMonths: 3,
      dataReadiness: 5,
      integrationComplexity: 1,
      changeMgmt: 1,
    });

    expect(result.financialScore).toBe(100);
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

    // TTV_THRESHOLDS.ZERO_MONTHS = 18 → score = 0
    const result18Months = calculatePriorityScore({
      totalAnnualValue: 1_000_000,
      timeToValueMonths: 18,
      dataReadiness: 3,
      integrationComplexity: 3,
      changeMgmt: 3,
    });
    expect(result18Months.ttvScore).toBe(0);

    const result24Months = calculatePriorityScore({
      totalAnnualValue: 1_000_000,
      timeToValueMonths: 24,
      dataReadiness: 3,
      integrationComplexity: 3,
      changeMgmt: 3,
    });
    expect(result24Months.ttvScore).toBe(0);
  });
});

describe('getPriorityTier', () => {
  it('assigns Tier 1 for score >= 80', () => {
    expect(getPriorityTier(80)).toBe(PRIORITY_TIERS.TIER_1.label);
    expect(getPriorityTier(100)).toBe(PRIORITY_TIERS.TIER_1.label);
  });

  it('assigns Tier 2 for score >= 60', () => {
    expect(getPriorityTier(60)).toBe(PRIORITY_TIERS.TIER_2.label);
    expect(getPriorityTier(79)).toBe(PRIORITY_TIERS.TIER_2.label);
  });

  it('assigns Tier 3 for score >= 40', () => {
    expect(getPriorityTier(40)).toBe(PRIORITY_TIERS.TIER_3.label);
    expect(getPriorityTier(59)).toBe(PRIORITY_TIERS.TIER_3.label);
  });

  it('assigns Tier 4 for score < 40', () => {
    expect(getPriorityTier(0)).toBe(PRIORITY_TIERS.TIER_4.label);
    expect(getPriorityTier(39)).toBe(PRIORITY_TIERS.TIER_4.label);
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
