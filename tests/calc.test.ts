// tests/calc.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateWithHyperFormula } from '../src/calc/engine';
import {
  calculateCostBenefit,
  calculateRevenueBenefit,
  calculateTokenCost,
  calculatePriorityScore,
  DEFAULT_MULTIPLIERS,
} from '../src/calc/formulas';

describe('calculation engine', () => {
  it('returns trace structure with formulas and inputs', () => {
    const inputs = {
      HoursSaved: 34000,
      LoadedHourlyRate: 150,
      CostRealization: 0.90,
      DataMaturity: 0.75
    };
    const formulas = {
      CostBenefit: '=HoursSaved*LoadedHourlyRate*CostRealization*DataMaturity'
    };
    const res = evaluateWithHyperFormula(inputs, formulas);
    
    expect(res.trace).toBeDefined();
    expect(res.trace.formulas).toEqual(formulas);
    expect(res.trace.inputs).toEqual(inputs);
    expect(res.outputs).toHaveProperty('CostBenefit');
  });

  it('generates trace with correct structure', () => {
    const inputs = { A: 10, B: 5 };
    const formulas = { Sum: '=A+B' };
    const res = evaluateWithHyperFormula(inputs, formulas);
    
    expect(res.trace).toBeDefined();
    expect(res.trace.formulas).toEqual({ Sum: '=A+B' });
    expect(res.trace.inputs).toEqual({ A: 10, B: 5 });
    expect(res.outputs).toHaveProperty('Sum');
  });
});

describe('calculateCostBenefit', () => {
  it('computes cost benefit with all inputs', () => {
    const result = calculateCostBenefit({
      hoursSaved: 34000,
      loadedHourlyRate: 150,
      costRealization: 0.90,
      dataMaturity: 0.75,
    });
    
    expect(result.value).toBe(3400000);
    expect(result.trace.output).toBeCloseTo(3442500, 5);
  });

  it('uses default multipliers when not provided', () => {
    const result = calculateCostBenefit({
      hoursSaved: 1000,
      loadedHourlyRate: 100,
    });
    
    const expectedRaw = 1000 * 100 * DEFAULT_MULTIPLIERS.costRealization * DEFAULT_MULTIPLIERS.dataMaturity;
    expect(result.trace.output).toBeCloseTo(expectedRaw, 5);
    expect(result.trace.inputs.costRealization).toBe(DEFAULT_MULTIPLIERS.costRealization);
    expect(result.trace.inputs.dataMaturity).toBe(DEFAULT_MULTIPLIERS.dataMaturity);
  });

  it('generates complete trace', () => {
    const result = calculateCostBenefit({
      hoursSaved: 2000,
      loadedHourlyRate: 150,
      costRealization: 0.85,
      dataMaturity: 0.80,
    });
    
    expect(result.trace.formula).toBe('HoursSaved × LoadedHourlyRate × CostRealization × DataMaturity');
    expect(result.trace.inputs).toEqual({
      hoursSaved: 2000,
      loadedHourlyRate: 150,
      costRealization: 0.85,
      dataMaturity: 0.80,
    });
    expect(result.trace.output).toBeCloseTo(2000 * 150 * 0.85 * 0.80, 5);
  });

  it('rounds down to nearest $100K', () => {
    const result = calculateCostBenefit({
      hoursSaved: 1500,
      loadedHourlyRate: 100,
      costRealization: 1.0,
      dataMaturity: 1.0,
    });
    
    expect(result.value).toBe(100000);
  });
});

describe('calculateRevenueBenefit', () => {
  it('computes revenue benefit with all inputs', () => {
    const result = calculateRevenueBenefit({
      upliftPct: 0.05,
      baselineRevenue: 10_000_000,
      marginPct: 0.30,
      revenueRealization: 0.95,
      dataMaturity: 0.75,
    });
    
    const expectedRaw = 0.05 * 10_000_000 * 0.30 * 0.95 * 0.75;
    expect(result.trace.output).toBeCloseTo(expectedRaw, 5);
  });

  it('uses default multipliers when not provided', () => {
    const result = calculateRevenueBenefit({
      upliftPct: 0.10,
      baselineRevenue: 5_000_000,
    });
    
    expect(result.trace.inputs.revenueRealization).toBe(DEFAULT_MULTIPLIERS.revenueRealization);
    expect(result.trace.inputs.dataMaturity).toBe(DEFAULT_MULTIPLIERS.dataMaturity);
    expect(result.trace.inputs.marginPct).toBe(1.0);
  });

  it('generates complete trace with formula', () => {
    const result = calculateRevenueBenefit({
      upliftPct: 0.08,
      baselineRevenue: 2_000_000,
    });
    
    expect(result.trace.formula).toBe('UpliftPct × BaselineRevenue × MarginPct × RevenueRealization × DataMaturity');
    expect(result.trace.inputs.upliftPct).toBe(0.08);
    expect(result.trace.inputs.baselineRevenue).toBe(2_000_000);
  });
});

describe('calculateTokenCost', () => {
  it('computes annual token cost correctly', () => {
    const result = calculateTokenCost({
      runsPerMonth: 1000,
      inputTokensPerRun: 1000,
      outputTokensPerRun: 500,
      inputTokenPricePerM: 3.00,
      outputTokenPricePerM: 15.00,
    });
    
    const monthlyInputTokens = 1000 * 1000;
    const monthlyOutputTokens = 1000 * 500;
    const monthlyInputCost = (monthlyInputTokens / 1_000_000) * 3.00;
    const monthlyOutputCost = (monthlyOutputTokens / 1_000_000) * 15.00;
    const expectedAnnual = 12 * (monthlyInputCost + monthlyOutputCost);
    
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

describe('calculatePriorityScore', () => {
  it('computes priority score with high value, low TTV', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 9_000_000,
      timeToValueMonths: 3,
      dataReadiness: 1,
      integrationComplexity: 1,
      changeMgmt: 1,
    });
    
    expect(result.valueScore).toBe(40);
    expect(result.ttvScore).toBe(30);
    expect(result.effortScore).toBe(30);
    // Priority = 0.4 × 40 + 0.3 × 30 + 0.3 × 30 = 16 + 9 + 9 = 34
    expect(result.value).toBe(34);
  });

  it('computes priority score with medium value', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 4_500_000,
      timeToValueMonths: 6,
      dataReadiness: 3,
      integrationComplexity: 3,
      changeMgmt: 3,
    });
    
    expect(result.valueScore).toBe(20);
    expect(result.ttvScore).toBe(22);
    expect(result.effortScore).toBe(18);
  });

  it('generates complete trace with formula and intermediates', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 3_000_000,
      timeToValueMonths: 9,
      dataReadiness: 2,
      integrationComplexity: 4,
      changeMgmt: 3,
    });
    
    expect(result.trace.formula).toBe('0.4 × ValueScore + 0.3 × TTVScore + 0.3 × EffortScore');
    expect(result.trace.intermediates).toBeDefined();
    expect(result.trace.intermediates?.valueScore).toBe(result.valueScore);
    expect(result.trace.intermediates?.ttvScore).toBe(result.ttvScore);
    expect(result.trace.intermediates?.effortScore).toBe(result.effortScore);
  });

  it('caps value score at 40 for values above $9M', () => {
    const result = calculatePriorityScore({
      totalAnnualValue: 20_000_000,
      timeToValueMonths: 3,
      dataReadiness: 1,
      integrationComplexity: 1,
      changeMgmt: 1,
    });
    
    expect(result.valueScore).toBe(40);
  });

  it('handles TTV at boundary values', () => {
    const result12Months = calculatePriorityScore({
      totalAnnualValue: 1_000_000,
      timeToValueMonths: 12,
      dataReadiness: 3,
      integrationComplexity: 3,
      changeMgmt: 3,
    });
    
    expect(result12Months.ttvScore).toBe(5);
    
    const result3Months = calculatePriorityScore({
      totalAnnualValue: 1_000_000,
      timeToValueMonths: 3,
      dataReadiness: 3,
      integrationComplexity: 3,
      changeMgmt: 3,
    });
    
    expect(result3Months.ttvScore).toBe(30);
  });
});
