import { describe, it, expect } from "vitest";
import { runCfoRealityCheck, CFO_REALITY_THRESHOLDS } from "../src/calc/cfoRealityCheck";

const baseInput = {
  totalAnnualValue: 0,
  totalCostBenefit: 0,
  totalRevenueBenefit: 0,
  totalCashFlowBenefit: 0,
  totalRiskBenefit: 0,
  companyAnnualRevenue: 0,
  scenarios: { conservative: 0, moderate: 0, aggressive: 0 },
  perUseCase: [] as Array<{ id: string; totalAnnualValue: number }>,
};

describe("CFO Reality Check (independent verification)", () => {
  it("BELIEVABLE when every scenario sits inside its threshold", () => {
    const rev = 10_000_000_000; // $10B
    const result = runCfoRealityCheck({
      ...baseInput,
      totalAnnualValue: rev * 0.005,
      totalCostBenefit: rev * 0.0025,
      totalRevenueBenefit: rev * 0.0015,
      totalCashFlowBenefit: rev * 0.0005,
      totalRiskBenefit: rev * 0.0005,
      companyAnnualRevenue: rev,
      scenarios: {
        conservative: rev * 0.002,
        moderate: rev * 0.005,
        aggressive: rev * 0.010,
      },
      perUseCase: [{ id: "UC-1", totalAnnualValue: rev * 0.002 }],
    });
    expect(result.overall).toBe("BELIEVABLE");
    expect(result.recommendedScale).toBe(1);
    expect(result.findings).toEqual([]);
  });

  it("flags Constellation-shaped portfolio as IMPLAUSIBLE and recommends a downscale", () => {
    const rev = 21_400_000_000; // Constellation Energy revenue
    // Approximate the post-cap totals from the attached report.
    // Push moderate clearly past the IMPLAUSIBLE threshold (>1.5×0.75% =
    // >1.125% of revenue) — the real Constellation report sat around
    // 1.10% which classifies as STRETCH; this test uses 1.40% to lock in
    // the IMPLAUSIBLE branch + downscale recommendation. Cash flow is
    // still 35% of total so the pillar gate also fires.
    const moderateDollars = Math.round(rev * 0.014);
    const result = runCfoRealityCheck({
      ...baseInput,
      totalAnnualValue: moderateDollars,
      totalCostBenefit: Math.round(moderateDollars * 0.23),
      totalRevenueBenefit: Math.round(moderateDollars * 0.39),
      totalCashFlowBenefit: Math.round(moderateDollars * 0.35),
      totalRiskBenefit: Math.round(moderateDollars * 0.03),
      companyAnnualRevenue: rev,
      scenarios: {
        conservative: Math.round(moderateDollars * 0.6),
        moderate: moderateDollars,
        aggressive: Math.round(moderateDollars * 2.0),
      },
      perUseCase: [
        { id: "UC-08", totalAnnualValue: 40_700_000 },
        { id: "UC-04", totalAnnualValue: 36_400_000 },
      ],
    });
    expect(result.overall).toBe("IMPLAUSIBLE");
    expect(result.recommendedScale).toBeGreaterThan(0);
    expect(result.recommendedScale).toBeLessThan(1);
    const target = rev * CFO_REALITY_THRESHOLDS.scenarioShareOfRevenue.moderate;
    const expectedScale = target / moderateDollars;
    expect(result.recommendedScale).toBeCloseTo(expectedScale, 3);
    // Cash-flow pillar is over its 25% ceiling.
    expect(result.findings.find((f) => f.code === "CFO_REALITY_PILLAR_CASHFLOW")).toBeTruthy();
    expect(result.scenarioVerdicts.moderate).toBe("IMPLAUSIBLE");
    expect(result.scenarioVerdicts.aggressive).toBe("IMPLAUSIBLE");
  });

  it("flags single-UC dominance when one use case > 0.4% of revenue", () => {
    const rev = 1_000_000_000;
    const result = runCfoRealityCheck({
      ...baseInput,
      totalAnnualValue: rev * 0.005,
      totalCostBenefit: rev * 0.005,
      companyAnnualRevenue: rev,
      scenarios: { conservative: rev * 0.002, moderate: rev * 0.005, aggressive: rev * 0.010 },
      perUseCase: [
        { id: "UC-MEGA", totalAnnualValue: rev * 0.0045 }, // 0.45% > 0.4% threshold
        { id: "UC-SMALL", totalAnnualValue: rev * 0.0005 },
      ],
    });
    const hit = result.findings.find((f) => f.code === "CFO_REALITY_PER_UC" && f.useCaseId === "UC-MEGA");
    expect(hit).toBeTruthy();
    expect(hit?.verdict === "STRETCH" || hit?.verdict === "IMPLAUSIBLE").toBe(true);
  });

  it("no findings when company revenue is unknown (graceful degradation)", () => {
    const result = runCfoRealityCheck({
      ...baseInput,
      totalAnnualValue: 50_000_000,
      totalCostBenefit: 50_000_000,
      companyAnnualRevenue: 0,
      perUseCase: [{ id: "UC-1", totalAnnualValue: 50_000_000 }],
    });
    // Pillar checks still run (cost is 100% of total → fires).
    const pillarHits = result.findings.filter((f) => f.scope === "pillar");
    expect(pillarHits.length).toBeGreaterThan(0);
    // No scenario or per-UC findings without a revenue base.
    expect(result.findings.find((f) => f.scope === "scenario")).toBeUndefined();
    expect(result.findings.find((f) => f.scope === "useCase")).toBeUndefined();
  });

  it("recommendedScale stays at 1.0 when only conservative is borderline", () => {
    const rev = 10_000_000_000;
    const result = runCfoRealityCheck({
      ...baseInput,
      totalAnnualValue: rev * 0.005,
      totalCostBenefit: rev * 0.005,
      companyAnnualRevenue: rev,
      scenarios: {
        conservative: rev * 0.005, // STRETCH (above 0.25% but under 0.375%)
        moderate: rev * 0.005,     // BELIEVABLE (under 0.75%)
        aggressive: rev * 0.010,   // BELIEVABLE (under 1.5%)
      },
      perUseCase: [{ id: "UC-1", totalAnnualValue: rev * 0.003 }],
    });
    expect(result.recommendedScale).toBe(1);
  });
});
