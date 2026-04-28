// tests/hyperformula-engine.test.ts
//
// Tests for the production HyperFormula calculation path
// (src/calc/hyperformulaEngine.ts).
//
// `replit.md` declares HyperFormula as the production engine for every monetary
// number we ship, but the existing test suite only exercises the JS reference
// implementations in src/calc/formulas.ts. This file:
//
//   1. Asserts parity between each `hf*` function and its JS counterpart on
//      the same fixtures used by tests/calc.test.ts (within a tight tolerance).
//   2. Locks in the duplicate-of-spec invariants on the HyperFormula side:
//        - default scenario = 'moderate'
//        - ROUNDING.BENEFIT_PRECISION = 1 (no $100K floor)
//        - friction rounded down to nearest $10K
//        - token cost rounded to 2 decimals
//        - revenue uplift hard-capped at 0.5 (50%) inside the HF formula
import { describe, it, expect } from 'vitest';
import {
  hfCalculateCostBenefit,
  hfCalculateRevenueBenefit,
  hfCalculateCashFlowBenefit,
  hfCalculateRiskBenefit,
  hfCalculateFrictionCost,
  hfCalculateTokenCost,
} from '../src/calc/hyperformulaEngine';
import {
  calculateCostBenefit,
  calculateRevenueBenefit,
  calculateCashFlowBenefit,
  calculateRiskBenefit,
  calculateFrictionCost,
  calculateTokenCost,
  DEFAULT_MULTIPLIERS,
  SCENARIO_MULTIPLIERS,
  ROUNDING,
  INPUT_BOUNDS,
} from '../src/calc/formulas';

// Tolerance for floating-point comparisons between the JS engine (raw
// multiplication) and the HyperFormula engine (FLOOR-based). With
// BENEFIT_PRECISION = 1 the FLOOR step can drop at most $1 of the raw value.
const PARITY_TOLERANCE_DOLLARS = 1;

describe('hfCalculateCostBenefit (parity + invariants)', () => {
  it('matches the JS engine on the canonical Section 3.3 fixture', () => {
    const inputs = {
      hoursSaved: 34000,
      loadedHourlyRate: 150,
      benefitsLoading: 1.35,
      costRealizationMultiplier: 0.90,
      dataMaturityMultiplier: 0.75,
      scenario: 'moderate' as const,
    };

    const hf = hfCalculateCostBenefit(inputs);
    const js = calculateCostBenefit(inputs);

    expect(hf.value).toBeCloseTo(js.value, 0);
    expect(Math.abs(hf.value - js.value)).toBeLessThanOrEqual(PARITY_TOLERANCE_DOLLARS);

    // Sanity-check absolute math: 34000 × 150 × 1.35 × 0.90 × 0.75 × 1.0
    const expected = 34000 * 150 * 1.35 * 0.90 * 0.75 * SCENARIO_MULTIPLIERS.moderate;
    expect(hf.value).toBeCloseTo(expected, 0);
  });

  it('defaults to the moderate scenario when scenario is omitted', () => {
    // INVARIANT: every benefit formula in src/calc/hyperformulaEngine.ts
    // defaults `scenario` to 'moderate' (multiplier 1.0). Conservative (0.60)
    // and aggressive (1.30) are reserved for what-if analysis only.
    const noScenario = hfCalculateCostBenefit({
      hoursSaved: 1000,
      loadedHourlyRate: 100,
    });
    const explicitModerate = hfCalculateCostBenefit({
      hoursSaved: 1000,
      loadedHourlyRate: 100,
      scenario: 'moderate',
    });
    const conservative = hfCalculateCostBenefit({
      hoursSaved: 1000,
      loadedHourlyRate: 100,
      scenario: 'conservative',
    });

    expect(noScenario.value).toBe(explicitModerate.value);
    expect(noScenario.trace.inputs.scenarioMultiplier).toBe(SCENARIO_MULTIPLIERS.moderate);
    expect(conservative.value).toBeLessThan(noScenario.value);
  });

  it('falls back to DEFAULT_MULTIPLIERS for benefits/realization/data-maturity', () => {
    const result = hfCalculateCostBenefit({
      hoursSaved: 1000,
      loadedHourlyRate: 100,
    });

    expect(result.trace.inputs.benefitsLoading).toBe(DEFAULT_MULTIPLIERS.benefitsLoading);
    expect(result.trace.inputs.costRealizationMultiplier).toBe(DEFAULT_MULTIPLIERS.costRealizationMultiplier);
    expect(result.trace.inputs.dataMaturityMultiplier).toBe(DEFAULT_MULTIPLIERS.dataMaturityMultiplier);
  });

  it('does not floor away meaningful dollars (BENEFIT_PRECISION = 1)', () => {
    // INVARIANT: ROUNDING.BENEFIT_PRECISION = 1, so FLOOR(raw, 1) is just
    // floor(raw). With clean integer inputs the value is exact.
    expect(ROUNDING.BENEFIT_PRECISION).toBe(1);

    const result = hfCalculateCostBenefit({
      hoursSaved: 1500,
      loadedHourlyRate: 100,
      benefitsLoading: 1.0,
      costRealizationMultiplier: 1.0,
      dataMaturityMultiplier: 1.0,
      scenario: 'moderate',
    });

    expect(result.value).toBe(150000);
  });
});

describe('hfCalculateRevenueBenefit (parity + cap + invariants)', () => {
  it('matches the JS engine on the canonical fixture (uplift below the cap)', () => {
    const inputs = {
      upliftPct: 0.05,
      baselineRevenueAtRisk: 10_000_000,
      marginPct: 0.30,
      revenueRealizationMultiplier: 0.95,
      dataMaturityMultiplier: 0.75,
      scenario: 'moderate' as const,
    };

    const hf = hfCalculateRevenueBenefit(inputs);
    const js = calculateRevenueBenefit(inputs);

    expect(Math.abs(hf.value - js.value)).toBeLessThanOrEqual(PARITY_TOLERANCE_DOLLARS);

    const expected = 0.05 * 10_000_000 * 0.30 * 0.95 * 0.75 * SCENARIO_MULTIPLIERS.moderate;
    expect(hf.value).toBeCloseTo(expected, 0);
  });

  it('caps upliftPct at 0.5 (50%) inside the HyperFormula formula', () => {
    // INVARIANT: hfCalculateRevenueBenefit hard-caps uplift via MIN(A1, 0.5)
    // in the FLOOR(MIN(A1,0.5)*B1*C1*D1*E1*F1, 1) formula. Inputs above 0.5
    // produce the same result as 0.5.
    const baseline = 1_000_000;
    const margin = 1.0;

    const above = hfCalculateRevenueBenefit({
      upliftPct: 0.7,
      baselineRevenueAtRisk: baseline,
      marginPct: margin,
      revenueRealizationMultiplier: 1.0,
      dataMaturityMultiplier: 1.0,
      scenario: 'moderate',
    });

    const atCap = hfCalculateRevenueBenefit({
      upliftPct: 0.5,
      baselineRevenueAtRisk: baseline,
      marginPct: margin,
      revenueRealizationMultiplier: 1.0,
      dataMaturityMultiplier: 1.0,
      scenario: 'moderate',
    });

    expect(above.value).toBe(atCap.value);
    expect(above.value).toBe(500_000); // 0.5 × 1_000_000 × 1 × 1 × 1 × 1
  });

  it('defaults to moderate scenario, marginPct=1.0, and DEFAULT_MULTIPLIERS', () => {
    const result = hfCalculateRevenueBenefit({
      upliftPct: 0.04,
      baselineRevenueAtRisk: 5_000_000,
    });

    expect(result.trace.inputs.scenarioMultiplier).toBe(SCENARIO_MULTIPLIERS.moderate);
    expect(result.trace.inputs.marginPct).toBe(1.0);
    expect(result.trace.inputs.revenueRealizationMultiplier).toBe(DEFAULT_MULTIPLIERS.revenueRealizationMultiplier);
    expect(result.trace.inputs.dataMaturityMultiplier).toBe(DEFAULT_MULTIPLIERS.dataMaturityMultiplier);
  });

  it('exposes INPUT_BOUNDS.upliftPct.max as a callout (sanity for the cap delta with JS)', () => {
    // Sanity reference: the JS engine separately clamps inputs at
    // INPUT_BOUNDS.upliftPct.max (= 0.05). The HF formula uses a 0.5 hard cap.
    // This invariant test pins the JS-side bound so future edits surface the
    // intentional cap mismatch instead of silently drifting.
    expect(INPUT_BOUNDS.upliftPct.max).toBe(0.05);
  });
});

describe('hfCalculateCashFlowBenefit (parity + invariants)', () => {
  it('matches the JS engine on the canonical 15-day DSO fixture', () => {
    const sharedInputs = {
      annualRevenue: 365_000_000,
      daysImprovement: 15,
      costOfCapital: 0.08,
      cashFlowRealizationMultiplier: 0.85,
      dataMaturityMultiplier: 0.75,
      scenario: 'moderate' as const,
    };

    const hf = hfCalculateCashFlowBenefit(sharedInputs);
    const js = calculateCashFlowBenefit(sharedInputs);

    expect(Math.abs(hf.value - js.value)).toBeLessThanOrEqual(PARITY_TOLERANCE_DOLLARS);

    // Working capital freed = 365M × 15/365 = $15M
    // Annual benefit = $15M × 8% × 0.85 × 0.75 × 1.0
    const expected = 15_000_000 * 0.08 * 0.85 * 0.75 * SCENARIO_MULTIPLIERS.moderate;
    expect(hf.value).toBeCloseTo(expected, 0);
  });

  it('defaults to moderate scenario and DEFAULT_MULTIPLIERS', () => {
    const result = hfCalculateCashFlowBenefit({
      annualRevenue: 100_000_000,
      daysImprovement: 5,
    });

    expect(result.trace.inputs.scenarioMultiplier).toBe(SCENARIO_MULTIPLIERS.moderate);
    expect(result.trace.inputs.costOfCapital).toBe(DEFAULT_MULTIPLIERS.defaultCostOfCapital);
    expect(result.trace.inputs.cashFlowRealizationMultiplier).toBe(DEFAULT_MULTIPLIERS.cashFlowRealizationMultiplier);
    expect(result.trace.inputs.dataMaturityMultiplier).toBe(DEFAULT_MULTIPLIERS.dataMaturityMultiplier);
  });

  it('returns 0 (or near 0) when daysImprovement is 0', () => {
    const result = hfCalculateCashFlowBenefit({
      annualRevenue: 100_000_000,
      daysImprovement: 0,
    });
    expect(result.value).toBe(0);
  });
});

describe('hfCalculateRiskBenefit (parity + invariants)', () => {
  it('matches the JS engine when given the JS engine\'s capped reduction', () => {
    // The JS engine takes (probBefore, impactBefore, probAfter, impactAfter)
    // and applies its own 8% cap on the reduction. The HF engine takes the
    // already-resolved (riskReductionPct, riskExposure) pair directly.
    //
    // To prove parity we compute the JS result, then derive the equivalent
    // (riskReductionPct, riskExposure) the HF engine would need to reproduce
    // it, and assert the HF result matches.
    const jsInputs = {
      probBefore: 0.10,
      impactBefore: 5_000_000,
      probAfter: 0.02,
      impactAfter: 5_000_000,
      riskRealizationMultiplier: 0.80,
      dataMaturityMultiplier: 0.75,
      scenario: 'moderate' as const,
    };
    const js = calculateRiskBenefit(jsInputs);

    const riskExposure = jsInputs.probBefore * jsInputs.impactBefore;
    const rawReduction = riskExposure - jsInputs.probAfter * jsInputs.impactAfter;
    const cappedReduction = Math.min(rawReduction, riskExposure * DEFAULT_MULTIPLIERS.riskReductionCapPct);
    const equivalentReductionPct = cappedReduction / riskExposure;

    const hf = hfCalculateRiskBenefit({
      riskReductionPct: equivalentReductionPct,
      riskExposure,
      riskRealizationMultiplier: jsInputs.riskRealizationMultiplier,
      dataMaturityMultiplier: jsInputs.dataMaturityMultiplier,
      scenario: jsInputs.scenario,
    });

    expect(Math.abs(hf.value - js.value)).toBeLessThanOrEqual(PARITY_TOLERANCE_DOLLARS);
  });

  it('computes value = ReductionPct × Exposure × Realization × DataMaturity × Scenario', () => {
    const result = hfCalculateRiskBenefit({
      riskReductionPct: 0.20,
      riskExposure: 1_000_000,
      riskRealizationMultiplier: 0.80,
      dataMaturityMultiplier: 0.75,
      scenario: 'moderate',
    });

    // 0.20 × 1_000_000 × 0.80 × 0.75 × 1.0 = 120,000
    expect(result.value).toBe(120_000);
  });

  it('defaults to moderate scenario and DEFAULT_MULTIPLIERS', () => {
    const result = hfCalculateRiskBenefit({
      riskReductionPct: 0.10,
      riskExposure: 1_000_000,
    });

    expect(result.trace.inputs.scenarioMultiplier).toBe(SCENARIO_MULTIPLIERS.moderate);
    expect(result.trace.inputs.riskRealizationMultiplier).toBe(DEFAULT_MULTIPLIERS.riskRealizationMultiplier);
    expect(result.trace.inputs.dataMaturityMultiplier).toBe(DEFAULT_MULTIPLIERS.dataMaturityMultiplier);
  });
});

describe('hfCalculateFrictionCost (parity + $10K rounding invariant)', () => {
  it('matches the JS engine on a clean fixture', () => {
    const hf = hfCalculateFrictionCost({ annualHours: 5000, loadedHourlyRate: 150 });
    const js = calculateFrictionCost({ annualHours: 5000, loadedHourlyRate: 150 });

    // 5000 × 150 = 750,000 → already a clean $10K multiple, both engines agree
    expect(hf.value).toBe(js.value);
    expect(hf.value).toBe(750_000);
  });

  it('rounds DOWN to the nearest $10K (FRICTION_PRECISION = 10_000)', () => {
    // INVARIANT: ROUNDING.FRICTION_PRECISION = 10_000.
    // 12_345 hours × $100/hr = $1,234,500 → must floor to $1,230,000.
    expect(ROUNDING.FRICTION_PRECISION).toBe(10_000);

    const result = hfCalculateFrictionCost({ annualHours: 12_345, loadedHourlyRate: 100 });
    expect(result.value).toBe(1_230_000);

    // And it must match the JS friction calc on the same fixture.
    const js = calculateFrictionCost({ annualHours: 12_345, loadedHourlyRate: 100 });
    expect(result.value).toBe(js.value);
  });

  it('returns 0 when annualHours is 0', () => {
    const result = hfCalculateFrictionCost({ annualHours: 0, loadedHourlyRate: 150 });
    expect(result.value).toBe(0);
  });
});

describe('hfCalculateTokenCost (parity + 2-decimal rounding invariant)', () => {
  it('matches the JS engine on the canonical 1K-runs fixture', () => {
    const inputs = {
      runsPerMonth: 1000,
      inputTokensPerRun: 1000,
      outputTokensPerRun: 500,
      inputTokenPricePerM: 3.00,
      outputTokenPricePerM: 15.00,
    };

    const hf = hfCalculateTokenCost(inputs);
    const js = calculateTokenCost(inputs);

    expect(hf.value).toBeCloseTo(js.value, 2);
    expect(hf.value).toBe(126); // 12 × ($3 + $7.50)
  });

  it('defaults to Claude 3.5 Sonnet token prices when omitted', () => {
    const result = hfCalculateTokenCost({
      runsPerMonth: 500,
      inputTokensPerRun: 2000,
      outputTokensPerRun: 1000,
    });

    expect(result.trace.inputs.inputTokenPricePerM).toBe(DEFAULT_MULTIPLIERS.inputTokenPricePerM);
    expect(result.trace.inputs.outputTokenPricePerM).toBe(DEFAULT_MULTIPLIERS.outputTokenPricePerM);
  });

  it('rounds annual cost to exactly 2 decimal places (TOKEN_DECIMALS = 2)', () => {
    // INVARIANT: ROUNDING.TOKEN_DECIMALS = 2 — token cost is rounded to 2dp.
    // Pick a fixture whose unrounded cost has more than 2 decimals so the
    // rounding behavior is observable.
    expect(ROUNDING.TOKEN_DECIMALS).toBe(2);

    const result = hfCalculateTokenCost({
      runsPerMonth: 1,
      inputTokensPerRun: 1234,
      outputTokensPerRun: 567,
      inputTokenPricePerM: 3.00,
      outputTokenPricePerM: 15.00,
    });

    // Exact unrounded annual cost:
    //   monthly input  = 1234 / 1_000_000 × 3   = 0.003702
    //   monthly output = 567  / 1_000_000 × 15  = 0.008505
    //   monthly total  = 0.012207
    //   annual         = 12 × 0.012207           = 0.146484
    //   rounded to 2dp = 0.15
    expect(result.value).toBe(0.15);

    // Verify the value really has at most 2 decimal places.
    expect(result.value).toBe(Math.round(result.value * 100) / 100);
  });

  it('matches the JS engine on a fixture that exercises the rounding boundary', () => {
    const inputs = {
      runsPerMonth: 1,
      inputTokensPerRun: 1234,
      outputTokensPerRun: 567,
    };

    const hf = hfCalculateTokenCost(inputs);
    const js = calculateTokenCost(inputs);

    // Both engines round to 2 decimals so the match is exact.
    expect(hf.value).toBe(js.value);
  });
});
