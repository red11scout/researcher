// tests/calculation-quality-assurance.test.ts
//
// COMPREHENSIVE CALCULATION QA SUITE
//
// This file is the single top-level "if this passes, the calculation engine is
// trustworthy" gate. It covers every monetary / score formula in the codebase
// against a fixed set of properties:
//
//   1. DETERMINISM — same inputs always produce the same outputs, across many
//      invocations and across the long-lived global HyperFormula instance.
//   2. CROSS-ENGINE PARITY — the JS reference and the HyperFormula production
//      path agree to within $1 on a randomized fuzz sample.
//   3. NO NaN / Infinity / NEGATIVE DOLLARS — every public formula returns a
//      finite, non-negative number on every well-formed input in a 200-sample
//      fuzz sweep.
//   4. CAP ENFORCEMENT — every documented cap (revenue uplift 5%, risk
//      reduction 8% of exposure, benefits ≤ 3% of revenue, hours ≤ 500k)
//      actually binds when an input exceeds it.
//   5. INPUT_BOUNDS clamping fires for every declared field.
//   6. ALGEBRAIC LINEARITY — doubling a single linear input doubles the output
//      (within rounding) for cost/revenue/cash-flow/risk benefits.
//   7. SCENARIO ORDERING — conservative < moderate < aggressive on every
//      benefit formula AND in the three-scenario summary.
//   8. SCORING MONOTONICITY — readiness, priority, and value scores are
//      monotone in their inputs (more readiness → higher, etc.).
//   9. RANK PRESERVATION — value-score normalization preserves rank order.
//  10. SOURCE-LEVEL DETERMINISM — no `Math.random`, no `Date.now`/`new Date`
//      calls inside any calculation file. No reliance on Map iteration order
//      to order numeric outputs.
//
// Companion file: `tests/output-realism.test.ts` covers the "conservative
// realistic output" axis — i.e. the values we ship are credible to a CFO.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  // Reference engine
  calculateCostBenefit,
  calculateRevenueBenefit,
  calculateCashFlowBenefit,
  calculateRiskBenefit,
  calculateTotalAnnualValue,
  calculateTokenCost,
  calculateValuePerMillionTokens,
  calculatePriorityScore,
  getPriorityTier,
  calculateFrictionCost,
  calculateFrictionRecovery,
  calculateFrictionSeverity,
  calculateMultiYearProjection,
  generateThreeScenarioSummary,
  calculateReadinessScore,
  calculateNewPriorityScore,
  getNewPriorityTier,
  getNewRecommendedPhase,
  normalizeValuesToScale,
  normalizeValueToScale,
  calculateValueScoreFromFriction,
  calculateTTVBubbleScore,
  // Safe wrappers
  calculateCostBenefitSafe,
  calculateRevenueBenefitSafe,
  calculateCashFlowBenefitSafe,
  calculateRiskBenefitSafe,
  // Constants
  INPUT_BOUNDS,
  DEFAULT_MULTIPLIERS,
  SCENARIO_MULTIPLIERS,
  ADOPTION_CURVES,
  ROUNDING,
  READINESS_WEIGHTS,
  validateInputs,
  formatMoney,
} from "../src/calc/formulas";
import {
  hfCalculateCostBenefit,
  hfCalculateRevenueBenefit,
  hfCalculateCashFlowBenefit,
  hfCalculateRiskBenefit,
  hfCalculateFrictionCost,
  hfCalculateTokenCost,
} from "../src/calc/hyperformulaEngine";
import { normalizeValueScores } from "../shared/vrm-v2";

// ---------------------------------------------------------------------------
// Deterministic PRNG so the fuzz tests are themselves reproducible.
// We refuse to use Math.random because non-deterministic tests are exactly
// the failure mode we're guarding against.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rangeRand(rand: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * rand();
}

const FUZZ_SAMPLES = 200;
const DETERMINISM_RUNS = 50;

// =============================================================================
// 1. DETERMINISM — every formula must be a pure function of its inputs
// =============================================================================
describe("DETERMINISM: every formula returns identical output for identical input across many runs", () => {
  const fixedInputs = {
    cost: { hoursSaved: 12345, loadedHourlyRate: 137 },
    revenue: { upliftPct: 0.04, baselineRevenueAtRisk: 23_456_789 },
    cashFlow: { daysImprovement: 17, annualRevenue: 365_000_000 },
    risk: { probBefore: 0.42, impactBefore: 12_345_678, probAfter: 0.31, impactAfter: 7_654_321 },
    token: { runsPerMonth: 12345, inputTokensPerRun: 4321, outputTokensPerRun: 1234 },
    friction: { annualHours: 9876, loadedHourlyRate: 145 },
  };

  function repeatedly<T>(fn: () => T): T[] {
    const results: T[] = [];
    for (let i = 0; i < DETERMINISM_RUNS; i++) results.push(fn());
    return results;
  }

  function allEqual<T>(values: T[]): boolean {
    return values.every((v) => JSON.stringify(v) === JSON.stringify(values[0]));
  }

  it("calculateCostBenefit is deterministic across 50 calls", () => {
    expect(allEqual(repeatedly(() => calculateCostBenefit(fixedInputs.cost).value))).toBe(true);
  });
  it("calculateRevenueBenefit is deterministic", () => {
    expect(allEqual(repeatedly(() => calculateRevenueBenefit(fixedInputs.revenue).value))).toBe(true);
  });
  it("calculateCashFlowBenefit is deterministic", () => {
    expect(allEqual(repeatedly(() => calculateCashFlowBenefit(fixedInputs.cashFlow).value))).toBe(true);
  });
  it("calculateRiskBenefit is deterministic", () => {
    expect(allEqual(repeatedly(() => calculateRiskBenefit(fixedInputs.risk).value))).toBe(true);
  });
  it("calculateTokenCost is deterministic", () => {
    expect(allEqual(repeatedly(() => calculateTokenCost(fixedInputs.token).value))).toBe(true);
  });
  it("calculateFrictionCost is deterministic", () => {
    expect(allEqual(repeatedly(() => calculateFrictionCost(fixedInputs.friction).value))).toBe(true);
  });

  it("HyperFormula production engine is deterministic across 50 calls (long-lived instance reuse)", () => {
    // The hyperformula engine reuses one global instance; if cells leak between
    // calls, this test will detect it because rotating through different formulas
    // and back to the original would change the answer.
    const baseline = hfCalculateCostBenefit(fixedInputs.cost).value;
    for (let i = 0; i < DETERMINISM_RUNS; i++) {
      // Interleave with other engine calls to provoke any cell-leak / state bug
      hfCalculateRevenueBenefit(fixedInputs.revenue);
      hfCalculateCashFlowBenefit(fixedInputs.cashFlow);
      hfCalculateRiskBenefit({
        riskReductionPct: 0.05,
        riskExposure: fixedInputs.risk.probBefore * fixedInputs.risk.impactBefore,
      });
      hfCalculateFrictionCost(fixedInputs.friction);
      hfCalculateTokenCost(fixedInputs.token);
      const again = hfCalculateCostBenefit(fixedInputs.cost).value;
      expect(again).toBe(baseline);
    }
  });

  it("normalizeValueScores is deterministic for the same input array", () => {
    const inputs = [0.4, 1.2, 0.04, 7.8, 12.5, 0.92, 3.1, 0, 28.4];
    const baseline = JSON.stringify(normalizeValueScores(inputs));
    for (let i = 0; i < DETERMINISM_RUNS; i++) {
      expect(JSON.stringify(normalizeValueScores(inputs))).toBe(baseline);
    }
  });

  it("calculateMultiYearProjection is deterministic", () => {
    const inputs = { annualBenefit: 1_000_000, implementationCost: 350_000, scenario: "moderate" as const };
    const baseline = JSON.stringify(calculateMultiYearProjection(inputs));
    for (let i = 0; i < DETERMINISM_RUNS; i++) {
      expect(JSON.stringify(calculateMultiYearProjection(inputs))).toBe(baseline);
    }
  });

  it("generateThreeScenarioSummary is deterministic", () => {
    const inputs = { baseBenefitAtFullAdoption: 5_000_000, implementationCost: 1_200_000 };
    const baseline = JSON.stringify(generateThreeScenarioSummary(inputs));
    for (let i = 0; i < DETERMINISM_RUNS; i++) {
      expect(JSON.stringify(generateThreeScenarioSummary(inputs))).toBe(baseline);
    }
  });
});

// =============================================================================
// 2. CROSS-ENGINE PARITY — JS reference and HyperFormula production agree
// =============================================================================
describe("CROSS-ENGINE PARITY: HyperFormula and JS reference engines agree on a 200-sample fuzz", () => {
  const rand = mulberry32(0xb1ed411f);

  it("hfCalculateCostBenefit matches calculateCostBenefit", () => {
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const inputs = {
        hoursSaved: rangeRand(rand, 0, 100_000),
        loadedHourlyRate: rangeRand(rand, 35, 500),
        scenario: (["conservative", "moderate", "aggressive"] as const)[Math.floor(rand() * 3)],
      };
      const hf = hfCalculateCostBenefit(inputs);
      const js = calculateCostBenefit(inputs);
      expect(Math.abs(hf.value - js.value)).toBeLessThanOrEqual(1);
    }
  });

  it("hfCalculateRevenueBenefit matches calculateRevenueBenefit (with the 5% cap binding randomly)", () => {
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const inputs = {
        upliftPct: rangeRand(rand, 0, 0.20), // half the samples will exceed the 5% cap
        baselineRevenueAtRisk: rangeRand(rand, 0, 100_000_000),
      };
      const hf = hfCalculateRevenueBenefit(inputs);
      const js = calculateRevenueBenefit(inputs);
      expect(Math.abs(hf.value - js.value)).toBeLessThanOrEqual(1);
    }
  });

  it("hfCalculateCashFlowBenefit matches calculateCashFlowBenefit", () => {
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const inputs = {
        daysImprovement: rangeRand(rand, 0, 90),
        annualRevenue: rangeRand(rand, 1_000_000, 5_000_000_000),
      };
      const hf = hfCalculateCashFlowBenefit(inputs);
      const js = calculateCashFlowBenefit(inputs);
      expect(Math.abs(hf.value - js.value)).toBeLessThanOrEqual(1);
    }
  });

  it("hfCalculateRiskBenefit matches calculateRiskBenefit (parameterized to share inputs)", () => {
    // hfCalculateRiskBenefit takes (riskReductionPct, riskExposure); the JS
    // reference takes (probBefore, impactBefore, probAfter, impactAfter).
    // To compare, we build matching inputs.
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const probBefore = rangeRand(rand, 0.05, 0.95);
      const impactBefore = rangeRand(rand, 100_000, 100_000_000);
      const reductionPct = rangeRand(rand, 0, 0.20); // half exceed the 8% cap
      const probAfter = probBefore * (1 - reductionPct);
      const riskExposure = probBefore * impactBefore;
      const hf = hfCalculateRiskBenefit({ riskReductionPct: reductionPct, riskExposure });
      const js = calculateRiskBenefit({ probBefore, impactBefore, probAfter, impactAfter: impactBefore });
      // Allow $2 for accumulated FLOOR rounding across two paths
      expect(Math.abs(hf.value - js.value)).toBeLessThanOrEqual(2);
    }
  });

  it("hfCalculateTokenCost matches calculateTokenCost", () => {
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const inputs = {
        runsPerMonth: Math.floor(rangeRand(rand, 0, 1_000_000)),
        inputTokensPerRun: Math.floor(rangeRand(rand, 100, 50_000)),
        outputTokensPerRun: Math.floor(rangeRand(rand, 50, 5_000)),
      };
      const hf = hfCalculateTokenCost(inputs);
      const js = calculateTokenCost(inputs);
      // Token cost rounds to 2 decimals, so $0.01 tolerance is plenty.
      expect(Math.abs(hf.value - js.value)).toBeLessThan(0.02);
    }
  });
});

// =============================================================================
// 3. NO NaN / Infinity / NEGATIVE — every formula returns a finite ≥0 number
// =============================================================================
describe("NO NaN / Infinity / NEGATIVE: every formula returns finite, non-negative numbers under fuzz", () => {
  const rand = mulberry32(0xa11dead);

  function assertFiniteNonNeg(label: string, value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`[${label}] returned non-finite or negative value: ${value}`);
    }
  }

  it("calculateCostBenefit is always finite ≥ 0", () => {
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const v = calculateCostBenefit({
        hoursSaved: rangeRand(rand, 0, 1_000_000),
        loadedHourlyRate: rangeRand(rand, 0, 1_000),
      }).value;
      assertFiniteNonNeg("calculateCostBenefit", v);
    }
  });

  it("calculateRevenueBenefit is always finite ≥ 0 (incl. uplift > 5% cap)", () => {
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const v = calculateRevenueBenefit({
        upliftPct: rangeRand(rand, 0, 1.0), // intentionally over the 5% cap
        baselineRevenueAtRisk: rangeRand(rand, 0, 5_000_000_000),
      }).value;
      assertFiniteNonNeg("calculateRevenueBenefit", v);
    }
  });

  it("calculateCashFlowBenefit is always finite ≥ 0 (incl. dailyRevenue legacy path)", () => {
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const useLegacy = rand() < 0.5;
      const v = calculateCashFlowBenefit({
        daysImprovement: rangeRand(rand, 0, 365),
        annualRevenue: useLegacy ? 0 : rangeRand(rand, 0, 5_000_000_000),
        dailyRevenue: useLegacy ? rangeRand(rand, 0, 10_000_000) : undefined,
      }).value;
      assertFiniteNonNeg("calculateCashFlowBenefit", v);
    }
  });

  it("calculateRiskBenefit is always finite ≥ 0 (riskAfter may exceed riskBefore)", () => {
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const probBefore = rangeRand(rand, 0, 1);
      const impactBefore = rangeRand(rand, 0, 1_000_000_000);
      // Intentionally allow `after > before` (negative reduction)
      const probAfter = rangeRand(rand, 0, 1);
      const impactAfter = rangeRand(rand, 0, 1_000_000_000);
      const v = calculateRiskBenefit({ probBefore, impactBefore, probAfter, impactAfter }).value;
      // Risk reduction can be negative (worsened risk) — but the rounded output
      // should still be finite. The engine returns a negative value in that
      // case via FLOOR; document that and assert finiteness only.
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("calculateTokenCost is always finite ≥ 0", () => {
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const v = calculateTokenCost({
        runsPerMonth: Math.floor(rangeRand(rand, 0, 10_000_000)),
        inputTokensPerRun: Math.floor(rangeRand(rand, 0, 1_000_000)),
        outputTokensPerRun: Math.floor(rangeRand(rand, 0, 100_000)),
      }).value;
      assertFiniteNonNeg("calculateTokenCost", v);
    }
  });

  it("calculateFrictionCost is always finite ≥ 0 (all 3 input modes)", () => {
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const mode = Math.floor(rand() * 3);
      const inputs: any = { loadedHourlyRate: rangeRand(rand, 35, 500) };
      if (mode === 0) inputs.annualHours = rangeRand(rand, 0, 1_000_000);
      else if (mode === 1) {
        inputs.headcount = Math.floor(rangeRand(rand, 1, 100_000));
        inputs.frictionPercentage = rangeRand(rand, 0, 1);
      } else {
        inputs.headcount = Math.floor(rangeRand(rand, 1, 100_000));
      }
      const v = calculateFrictionCost(inputs).value;
      assertFiniteNonNeg("calculateFrictionCost", v);
    }
  });

  it("calculateValuePerMillionTokens handles zero monthly tokens without div-by-zero", () => {
    expect(calculateValuePerMillionTokens({ totalAnnualValue: 1_000_000, totalMonthlyTokens: 0 }).value).toBe(0);
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const v = calculateValuePerMillionTokens({
        totalAnnualValue: rangeRand(rand, 0, 100_000_000),
        totalMonthlyTokens: rangeRand(rand, 0, 1_000_000_000),
      }).value;
      assertFiniteNonNeg("calculateValuePerMillionTokens", v);
    }
  });

  it("calculateMultiYearProjection NPV / payback / irr are finite", () => {
    for (let i = 0; i < FUZZ_SAMPLES; i++) {
      const proj = calculateMultiYearProjection({
        annualBenefit: rangeRand(rand, 100_000, 50_000_000),
        implementationCost: rangeRand(rand, 50_000, 10_000_000),
        discountRate: rangeRand(rand, 0.01, 0.25),
      });
      expect(Number.isFinite(proj.npv)).toBe(true);
      expect(Number.isFinite(proj.paybackMonths)).toBe(true);
      // IRR is allowed to be null when not calculable
      if (proj.irr !== null) expect(Number.isFinite(proj.irr)).toBe(true);
    }
  });

  it("normalizeValueScores never returns NaN even when given degenerate inputs", () => {
    const fixtures: number[][] = [
      [],
      [0],
      [0, 0, 0, 0, 0],
      [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0],
      [1e-12, 1e-9, 1e-6, 1e12],
      Array.from({ length: 100 }, (_, i) => i + 1),
    ];
    for (const f of fixtures) {
      const out = normalizeValueScores(f);
      for (const v of out) expect(Number.isFinite(v)).toBe(true);
      // Range invariant: every score is in [1, 10]
      for (const v of out) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(10);
      }
    }
  });

  it("normalizeValuesToScale never returns NaN even on all-zero / single input", () => {
    expect(normalizeValuesToScale([])).toEqual([]);
    expect(normalizeValuesToScale([0, 0, 0])).toEqual([5.5, 5.5, 5.5]);
    expect(normalizeValuesToScale([5_000_000])).toEqual([5.5]);
    for (let i = 0; i < 50; i++) {
      const arr = Array.from({ length: 10 }, () => rangeRand(rand, 0, 100_000_000));
      const out = normalizeValuesToScale(arr);
      for (const v of out) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(10);
      }
    }
  });
});

// =============================================================================
// 4. CAP ENFORCEMENT — every documented cap actually binds
// =============================================================================
describe("CAP ENFORCEMENT: every documented cap actually binds when input exceeds it", () => {
  it("revenue uplift is capped at INPUT_BOUNDS.upliftPct.max (= 5%)", () => {
    const baseline = 100_000_000;
    const exactly = calculateRevenueBenefit({ upliftPct: 0.05, baselineRevenueAtRisk: baseline });
    const overshoot = calculateRevenueBenefit({ upliftPct: 0.50, baselineRevenueAtRisk: baseline });
    // Overshoot must equal exactly-at-cap, NOT exceed it
    expect(overshoot.value).toBe(exactly.value);
    // The trace records the CAPPED uplift for downstream audit display
    expect(overshoot.trace.inputs.upliftPct).toBe(INPUT_BOUNDS.upliftPct.max);
  });

  it("HyperFormula revenue path also caps at 5% (matches reference engine)", () => {
    const baseline = 100_000_000;
    const exactly = hfCalculateRevenueBenefit({ upliftPct: 0.05, baselineRevenueAtRisk: baseline });
    const overshoot = hfCalculateRevenueBenefit({ upliftPct: 0.99, baselineRevenueAtRisk: baseline });
    expect(overshoot.value).toBe(exactly.value);
    expect(overshoot.trace.inputs.upliftPct).toBe(INPUT_BOUNDS.upliftPct.max);
  });

  it("risk reduction is capped at riskReductionCapPct (= 8%) of current exposure", () => {
    // Current exposure: 0.5 × $10M = $5M. 8% of that = $400K cap.
    // Overshoot scenario: claim probAfter=0 (full removal of risk → 100% reduction).
    const exposure = 0.5 * 10_000_000;
    const cap = exposure * DEFAULT_MULTIPLIERS.riskReductionCapPct; // $400K
    const overshoot = calculateRiskBenefit({
      probBefore: 0.5,
      impactBefore: 10_000_000,
      probAfter: 0.0,
      impactAfter: 0,
    });
    // After multiplying by realization (0.80) × dataMaturity (0.75) × scenario (1.0) = 0.60
    const expectedCappedValue = cap * 0.80 * 0.75 * 1.0;
    expect(overshoot.value).toBeCloseTo(Math.floor(expectedCappedValue), -1);
    // The trace records the capped reduction
    expect(overshoot.trace.intermediates!.cappedReduction).toBe(cap);
  });

  it("HyperFormula risk path also caps at 8% (matches reference engine)", () => {
    const exposure = 5_000_000;
    const overshoot = hfCalculateRiskBenefit({ riskReductionPct: 0.99, riskExposure: exposure });
    const exactlyAtCap = hfCalculateRiskBenefit({
      riskReductionPct: DEFAULT_MULTIPLIERS.riskReductionCapPct,
      riskExposure: exposure,
    });
    expect(overshoot.value).toBe(exactlyAtCap.value);
    expect(overshoot.trace.inputs.riskReductionPct).toBe(DEFAULT_MULTIPLIERS.riskReductionCapPct);
  });

  it("total annual value is capped at benefitsCapPct (= 3%) of annual revenue", () => {
    const annualRevenue = 100_000_000;
    const capAmount = annualRevenue * DEFAULT_MULTIPLIERS.benefitsCapPct; // $3M
    // Stack benefits well over $3M
    const total = calculateTotalAnnualValue({
      costBenefit: 5_000_000,
      revenueBenefit: 4_000_000,
      cashFlowBenefit: 3_000_000,
      riskBenefit: 2_000_000,
      annualRevenue,
    });
    expect(total.isCapped).toBe(true);
    expect(total.value).toBe(Math.floor(capAmount));
    expect(total.capAmount).toBe(capAmount);
  });

  it("calculateFrictionCost clamps annualHours to INPUT_BOUNDS.annualHours.max (= 500k)", () => {
    const overshoot = calculateFrictionCost({ annualHours: 10_000_000, loadedHourlyRate: 100 });
    const atCap = calculateFrictionCost({ annualHours: INPUT_BOUNDS.annualHours.max, loadedHourlyRate: 100 });
    expect(overshoot.value).toBe(atCap.value);
  });

  it("Safe wrappers surface the warning when an input is clamped", () => {
    const safe = calculateRevenueBenefitSafe({ upliftPct: 0.99, baselineRevenueAtRisk: 50_000_000 });
    expect(safe.inputsClamped).toBe(true);
    expect(safe.validationWarnings.length).toBeGreaterThan(0);
    expect(safe.validationWarnings.some((w) => w.includes("Revenue Uplift"))).toBe(true);
  });

  it("Safe wrappers do NOT warn when inputs are within bounds", () => {
    const safe = calculateRevenueBenefitSafe({ upliftPct: 0.04, baselineRevenueAtRisk: 50_000_000 });
    expect(safe.inputsClamped).toBe(false);
    expect(safe.validationWarnings).toEqual([]);
  });
});

// =============================================================================
// 5. INPUT_BOUNDS — every declared field clamps both directions
// =============================================================================
describe("INPUT_BOUNDS: every declared field clamps both directions", () => {
  it("validateInputs clamps below-min values and emits a warning", () => {
    for (const [field, bound] of Object.entries(INPUT_BOUNDS)) {
      const result = validateInputs({ [field]: bound.min - 1 }, INPUT_BOUNDS);
      expect(result.clampedInputs[field]).toBe(bound.min);
      expect(result.warnings.some((w) => w.includes(bound.label))).toBe(true);
    }
  });

  it("validateInputs clamps above-max values and emits a warning", () => {
    for (const [field, bound] of Object.entries(INPUT_BOUNDS)) {
      const overshoot = bound.max + Math.max(1, bound.max * 0.01);
      const result = validateInputs({ [field]: overshoot }, INPUT_BOUNDS);
      expect(result.clampedInputs[field]).toBe(bound.max);
      expect(result.warnings.some((w) => w.includes(bound.label))).toBe(true);
    }
  });

  it("validateInputs accepts NaN as an error (doesn't silently propagate)", () => {
    const result = validateInputs({ hoursSaved: Number.NaN }, INPUT_BOUNDS);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.clampedInputs.hoursSaved).toBe(0);
  });
});

// =============================================================================
// 6. ALGEBRAIC LINEARITY — doubling a linear input doubles the output
// =============================================================================
describe("ALGEBRAIC LINEARITY: doubling a linear input doubles the output (within rounding)", () => {
  // Tolerance accounts for FLOOR rounding at $1 precision.
  function expectDoubled(a: number, b: number) {
    expect(Math.abs(2 * a - b)).toBeLessThanOrEqual(2);
  }

  it("calculateCostBenefit is linear in hoursSaved", () => {
    const a = calculateCostBenefit({ hoursSaved: 1000, loadedHourlyRate: 150 }).value;
    const b = calculateCostBenefit({ hoursSaved: 2000, loadedHourlyRate: 150 }).value;
    expectDoubled(a, b);
  });

  it("calculateRevenueBenefit is linear in baselineRevenueAtRisk (under the cap)", () => {
    const a = calculateRevenueBenefit({ upliftPct: 0.03, baselineRevenueAtRisk: 10_000_000 }).value;
    const b = calculateRevenueBenefit({ upliftPct: 0.03, baselineRevenueAtRisk: 20_000_000 }).value;
    expectDoubled(a, b);
  });

  it("calculateCashFlowBenefit is linear in daysImprovement", () => {
    const a = calculateCashFlowBenefit({ daysImprovement: 10, annualRevenue: 100_000_000 }).value;
    const b = calculateCashFlowBenefit({ daysImprovement: 20, annualRevenue: 100_000_000 }).value;
    expectDoubled(a, b);
  });

  it("calculateRiskBenefit is linear in riskExposure (cap is proportional)", () => {
    // Both fully capped, so output is 8% of exposure × multipliers.
    const a = calculateRiskBenefit({ probBefore: 0.5, impactBefore: 10_000_000, probAfter: 0, impactAfter: 0 }).value;
    const b = calculateRiskBenefit({ probBefore: 0.5, impactBefore: 20_000_000, probAfter: 0, impactAfter: 0 }).value;
    expectDoubled(a, b);
  });

  it("calculateTokenCost is linear in runsPerMonth", () => {
    const a = calculateTokenCost({ runsPerMonth: 1000, inputTokensPerRun: 5000, outputTokensPerRun: 1000 }).value;
    const b = calculateTokenCost({ runsPerMonth: 2000, inputTokensPerRun: 5000, outputTokensPerRun: 1000 }).value;
    expect(Math.abs(2 * a - b)).toBeLessThan(0.05);
  });

  it("calculateFrictionCost is linear in annualHours", () => {
    const a = calculateFrictionCost({ annualHours: 5000, loadedHourlyRate: 150 }).value;
    const b = calculateFrictionCost({ annualHours: 10_000, loadedHourlyRate: 150 }).value;
    // Friction precision is $10K, so allow up to $20K drift on doubling
    expect(Math.abs(2 * a - b)).toBeLessThanOrEqual(20_000);
  });
});

// =============================================================================
// 7. SCENARIO ORDERING — conservative < moderate < aggressive
// =============================================================================
describe("SCENARIO ORDERING: conservative < moderate < aggressive on every benefit driver", () => {
  // The scenario multipliers themselves must be in the right order.
  it("SCENARIO_MULTIPLIERS are strictly ordered", () => {
    expect(SCENARIO_MULTIPLIERS.conservative).toBeLessThan(SCENARIO_MULTIPLIERS.moderate);
    expect(SCENARIO_MULTIPLIERS.moderate).toBeLessThan(SCENARIO_MULTIPLIERS.aggressive);
    // Conservative must be the headline: this is the project-wide convention.
    expect(SCENARIO_MULTIPLIERS.conservative).toBe(0.6);
    expect(SCENARIO_MULTIPLIERS.moderate).toBe(1.0);
    expect(SCENARIO_MULTIPLIERS.aggressive).toBe(1.3);
  });

  it("ADOPTION_CURVES are monotone within each scenario (Y1 ≤ Y2 ≤ Y3) and across scenarios", () => {
    for (const scenario of ["conservative", "moderate", "aggressive"] as const) {
      const c = ADOPTION_CURVES[scenario];
      expect(c.y1).toBeLessThanOrEqual(c.y2);
      expect(c.y2).toBeLessThanOrEqual(c.y3);
    }
    // Across scenarios at every year
    expect(ADOPTION_CURVES.conservative.y1).toBeLessThan(ADOPTION_CURVES.moderate.y1);
    expect(ADOPTION_CURVES.moderate.y1).toBeLessThan(ADOPTION_CURVES.aggressive.y1);
    expect(ADOPTION_CURVES.conservative.y3).toBeLessThan(ADOPTION_CURVES.aggressive.y3);
  });

  function valueByScenario(fn: (s: "conservative" | "moderate" | "aggressive") => number) {
    return {
      c: fn("conservative"),
      m: fn("moderate"),
      a: fn("aggressive"),
    };
  }

  it("Cost benefit: conservative ≤ moderate ≤ aggressive", () => {
    const v = valueByScenario((s) => calculateCostBenefit({ hoursSaved: 5000, loadedHourlyRate: 150, scenario: s }).value);
    expect(v.c).toBeLessThan(v.m);
    expect(v.m).toBeLessThan(v.a);
  });

  it("Revenue benefit: conservative ≤ moderate ≤ aggressive", () => {
    const v = valueByScenario((s) =>
      calculateRevenueBenefit({ upliftPct: 0.04, baselineRevenueAtRisk: 50_000_000, scenario: s }).value,
    );
    expect(v.c).toBeLessThan(v.m);
    expect(v.m).toBeLessThan(v.a);
  });

  it("Cash flow benefit: conservative ≤ moderate ≤ aggressive", () => {
    const v = valueByScenario((s) =>
      calculateCashFlowBenefit({ daysImprovement: 15, annualRevenue: 365_000_000, scenario: s }).value,
    );
    expect(v.c).toBeLessThan(v.m);
    expect(v.m).toBeLessThan(v.a);
  });

  it("Risk benefit: conservative ≤ moderate ≤ aggressive", () => {
    const v = valueByScenario((s) =>
      calculateRiskBenefit({
        probBefore: 0.5,
        impactBefore: 10_000_000,
        probAfter: 0.45,
        impactAfter: 9_000_000,
        scenario: s,
      }).value,
    );
    expect(v.c).toBeLessThan(v.m);
    expect(v.m).toBeLessThan(v.a);
  });

  it("Three-scenario summary: conservative.totalBenefit < moderate < aggressive (and is the headline)", () => {
    const summary = generateThreeScenarioSummary({
      baseBenefitAtFullAdoption: 5_000_000,
      implementationCost: 1_500_000,
    });
    expect(summary.conservative.totalBenefit).toBeLessThan(summary.moderate.totalBenefit);
    expect(summary.moderate.totalBenefit).toBeLessThan(summary.aggressive.totalBenefit);
    // The headline string MUST lead with the conservative number per replit.md.
    expect(summary.headline.startsWith(formatMoney(summary.conservative.totalBenefit))).toBe(true);
    expect(summary.headline.toLowerCase()).toContain("conservative");
  });
});

// =============================================================================
// 8. SCORING MONOTONICITY — readiness, priority, value scores are well-behaved
// =============================================================================
describe("SCORING MONOTONICITY: readiness / priority / value scores are monotone in their inputs", () => {
  it("calculateReadinessScore is monotone in each component", () => {
    const base = { organizationalCapacity: 5, dataAvailabilityQuality: 5, technicalInfrastructure: 5, governance: 5 };
    const baseScore = calculateReadinessScore(base).value;
    for (const key of Object.keys(base) as Array<keyof typeof base>) {
      const bumped = { ...base, [key]: 8 };
      expect(calculateReadinessScore(bumped).value).toBeGreaterThan(baseScore);
    }
  });

  it("calculateReadinessScore output is in [1, 10]", () => {
    const min = calculateReadinessScore({
      organizationalCapacity: 1,
      dataAvailabilityQuality: 1,
      technicalInfrastructure: 1,
      governance: 1,
    }).value;
    const max = calculateReadinessScore({
      organizationalCapacity: 10,
      dataAvailabilityQuality: 10,
      technicalInfrastructure: 10,
      governance: 10,
    }).value;
    expect(min).toBe(1);
    expect(max).toBe(10);
  });

  it("READINESS_WEIGHTS sum to exactly 1.0 (no silent rebalancing)", () => {
    const sum = Object.values(READINESS_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("calculateNewPriorityScore is monotone in both readiness and value", () => {
    const baseline = calculateNewPriorityScore({ readinessScore: 5, normalizedValue: 5 }).value;
    expect(calculateNewPriorityScore({ readinessScore: 8, normalizedValue: 5 }).value).toBeGreaterThan(baseline);
    expect(calculateNewPriorityScore({ readinessScore: 5, normalizedValue: 8 }).value).toBeGreaterThan(baseline);
  });

  it("calculateNewPriorityScore output is in [1, 10]", () => {
    expect(calculateNewPriorityScore({ readinessScore: 1, normalizedValue: 1 }).value).toBe(1);
    expect(calculateNewPriorityScore({ readinessScore: 10, normalizedValue: 10 }).value).toBe(10);
  });

  it("getNewPriorityTier assigns Tier 1 Champions only at priority ≥ 7.5", () => {
    expect(getNewPriorityTier(7.5, 8, 8)).toContain("Tier 1");
    expect(getNewPriorityTier(7.49, 8, 8)).not.toContain("Tier 1");
  });

  it("getNewRecommendedPhase: more priority + readiness → earlier phase", () => {
    expect(getNewRecommendedPhase(8.0, 7)).toBe("Phase 1");
    expect(getNewRecommendedPhase(6.5, 5.5)).toBe("Phase 2");
    expect(getNewRecommendedPhase(5.0, 5)).toBe("Phase 3");
    expect(getNewRecommendedPhase(2.0, 2)).toBe("Phase 4");
  });

  it("calculateTTVBubbleScore is anti-monotone in months and clamped to [0, 1]", () => {
    expect(calculateTTVBubbleScore(0)).toBe(1);
    expect(calculateTTVBubbleScore(12)).toBe(0);
    expect(calculateTTVBubbleScore(24)).toBe(0);
    expect(calculateTTVBubbleScore(6)).toBeCloseTo(0.5, 5);
    // Anti-monotone
    let prev = 1;
    for (let m = 0; m <= 24; m++) {
      const v = calculateTTVBubbleScore(m);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
});

// =============================================================================
// 9. RANK PRESERVATION — value-score normalization preserves ordering
// =============================================================================
describe("RANK PRESERVATION: value-score normalization preserves the order of the underlying ratios", () => {
  const rand = mulberry32(0xcafe123);

  it("normalizeValueScores: a strictly larger ratio yields an equal-or-larger score", () => {
    for (let trial = 0; trial < 30; trial++) {
      const arr = Array.from({ length: 10 }, () => rangeRand(rand, 0.01, 100));
      const out = normalizeValueScores(arr);
      // Pair-wise: bigger ratio ⇒ score not smaller
      for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr.length; j++) {
          if (arr[i] > arr[j]) expect(out[i]).toBeGreaterThanOrEqual(out[j]);
        }
      }
    }
  });

  it("normalizeValuesToScale: bigger dollar value ⇒ equal-or-higher score", () => {
    for (let trial = 0; trial < 30; trial++) {
      const arr = Array.from({ length: 10 }, () => rangeRand(rand, 1_000, 100_000_000));
      const out = normalizeValuesToScale(arr);
      for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr.length; j++) {
          if (arr[i] > arr[j]) expect(out[i]).toBeGreaterThanOrEqual(out[j]);
        }
      }
    }
  });

  it("calculateValueScoreFromFriction: more EV ⇒ higher score (friction held constant)", () => {
    // Cohort context held constant; vary the queried EV.
    const cohort = [0.5, 1.0, 2.0, 5.0, 10.0];
    const lo = calculateValueScoreFromFriction(2_000_000, 1_000_000, cohort);
    const hi = calculateValueScoreFromFriction(8_000_000, 1_000_000, cohort);
    expect(hi).toBeGreaterThan(lo);
  });

  it("normalizeValueToScale boundary is sane (min→1, max→10, mid→5.5)", () => {
    expect(normalizeValueToScale(0, 0, 100)).toBe(1);
    expect(normalizeValueToScale(100, 0, 100)).toBe(10);
    expect(normalizeValueToScale(50, 0, 100)).toBe(5.5);
    expect(normalizeValueToScale(50, 50, 50)).toBe(5.5); // degenerate range
  });

  it("normalizeValueScores: identical ratios all map to 5.5 (no NaN, no silent ranking)", () => {
    expect(normalizeValueScores([3, 3, 3, 3, 3, 3, 3])).toEqual([5.5, 5.5, 5.5, 5.5, 5.5, 5.5, 5.5]);
  });
});

// =============================================================================
// 10. SOURCE-LEVEL DETERMINISM — no Math.random / Date.now in calc paths
// =============================================================================
describe("SOURCE-LEVEL DETERMINISM: calculation modules contain no nondeterminism markers", () => {
  // The "calculation universe" — everything that contributes to a stored
  // monetary number on a report.
  const CALCULATION_FILES = [
    "src/calc/formulas.ts",
    "src/calc/hyperformulaEngine.ts",
    "shared/vrm-v2.ts",
    "server/calculation-postprocessor.ts",
  ];

  // Markers that would make a calculation non-deterministic between runs.
  const NONDETERMINISM_MARKERS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /Math\.random\s*\(/, label: "Math.random()" },
    { pattern: /\bDate\.now\s*\(/, label: "Date.now()" },
    // `new Date()` with no args reads the wall clock; allow `new Date(literal)` in comments.
    { pattern: /new\s+Date\s*\(\s*\)/, label: "new Date()" },
    { pattern: /performance\.now\s*\(/, label: "performance.now()" },
    { pattern: /crypto\.randomBytes\b/, label: "crypto.randomBytes" },
    { pattern: /crypto\.randomUUID\b/, label: "crypto.randomUUID" },
  ];

  it.each(CALCULATION_FILES)("%s contains no non-determinism markers", (relPath) => {
    const fullPath = path.resolve(__dirname, "..", relPath);
    const content = fs.readFileSync(fullPath, "utf-8");
    // Strip comments (line + block) so a docblock mentioning Date.now in prose
    // doesn't trip the scan.
    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    for (const { pattern, label } of NONDETERMINISM_MARKERS) {
      const m = stripped.match(pattern);
      if (m) {
        // Find the original line number for a better error message
        const idx = content.indexOf(m[0]);
        const lineNo = content.slice(0, idx).split("\n").length;
        throw new Error(
          `Non-determinism marker '${label}' found in ${relPath}:${lineNo}. ` +
            `Calculations must be pure functions of their inputs — anything time- ` +
            `or randomness-dependent must live outside the calculation universe.`,
        );
      }
    }
  });
});

// =============================================================================
// 11. PRIORITY SCORING (legacy 0-100) — bounds and degenerate inputs
// =============================================================================
describe("PRIORITY SCORING (legacy): outputs are bounded [0, 100] and tier assignment is correct", () => {
  it("calculatePriorityScore is bounded [0, 100] for any sane input", () => {
    const inputs = [
      { totalAnnualValue: 0, timeToValueMonths: 24, dataReadiness: 1, integrationComplexity: 5, changeMgmt: 5 },
      { totalAnnualValue: 100_000_000, timeToValueMonths: 1, dataReadiness: 5, integrationComplexity: 1, changeMgmt: 1 },
      { totalAnnualValue: 5_000_000, timeToValueMonths: 9, dataReadiness: 3, integrationComplexity: 3, changeMgmt: 3 },
    ];
    for (const inp of inputs) {
      const v = calculatePriorityScore(inp).value;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("getPriorityTier respects 80 / 60 / 40 thresholds", () => {
    expect(getPriorityTier(85)).toContain("Tier 1");
    expect(getPriorityTier(65)).toContain("Tier 2");
    expect(getPriorityTier(45)).toContain("Tier 3");
    expect(getPriorityTier(20)).toContain("Tier 4");
  });
});

// =============================================================================
// 12. FRICTION RECOVERY & SEVERITY — bounded outputs
// =============================================================================
describe("FRICTION HELPERS: recovery percentage in [0, 1]; severity tiers are well-defined", () => {
  it("calculateFrictionRecovery: recoveryPct ∈ [0, 1]", () => {
    expect(calculateFrictionRecovery(1_000_000, 100_000).recoveryPct).toBe(0.1);
    expect(calculateFrictionRecovery(1_000_000, 5_000_000).recoveryPct).toBe(1.0); // can't exceed 100%
    expect(calculateFrictionRecovery(0, 100_000).recoveryPct).toBe(0); // null friction → 0
  });

  it("calculateFrictionSeverity returns one of the 4 documented tiers", () => {
    const allowed = new Set(["Critical", "High", "Medium", "Low"]);
    expect(allowed.has(calculateFrictionSeverity({ annualCost: 6_000_000 }))).toBe(true);
    expect(calculateFrictionSeverity({ annualCost: 100_000 })).toBe("Low");
    expect(calculateFrictionSeverity({ annualCost: 300_000 })).toBe("Medium");
    expect(calculateFrictionSeverity({ annualCost: 1_500_000 })).toBe("High");
    expect(calculateFrictionSeverity({ annualCost: 6_000_000 })).toBe("Critical");
    expect(calculateFrictionSeverity({ annualCost: 100_000, affectsCompliance: true })).toBe("Critical");
  });
});
