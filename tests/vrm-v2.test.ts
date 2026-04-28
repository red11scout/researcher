// tests/vrm-v2.test.ts
// Regression tests for the v2.1 quadrant assignment logic in shared/vrm-v2.ts.
// Covers the pure functions that drive the corrective release:
//   - normalizeValueScores (log10 min-max normalization)
//   - evaluateFloors      (hard knock-outs vs soft blockers)
//   - assignQuadrantV21 / assignPortfolioQuadrantsV21
//                          (Layer 1 / 2 / 3 routing, conditional-champion
//                           promotion, Wave 1 / Wave 2 tagging)
//   - proposeSprintWeeks  (dynamic sprint sizing for conditional champions)
//   - computePortfolioDiagnostic
//                          (median scores + structured warnings)
//
// The final `describe` block runs the 6 acceptance criteria for the v2.1
// corrective release as part of the regular test suite. (This replaces the
// retired manual harness that previously lived at scripts/diagnostic-vrm-v21.ts.)

import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENGAGEMENT_CONFIG,
  assignPortfolioQuadrantsV21,
  assignQuadrantV21,
  computePortfolioDiagnostic,
  evaluateFloors,
  normalizeValueScores,
  proposeSprintWeeks,
  resolveEngagementConfig,
  type EngagementConfig,
  type UseCaseScoringV21,
} from "../shared/vrm-v2";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeUseCase(overrides: Partial<UseCaseScoringV21> = {}): UseCaseScoringV21 {
  // Preserve explicit `null` overrides — `??` would otherwise convert null → default.
  const defaults: UseCaseScoringV21 = {
    id: "TC-X",
    valueScore: 6.0,
    readinessScore: 6.0,
    componentScores: {
      orgCapacity: 6.0,
      dataReadiness: 6.0,
      governance: 6.0,
      techInfrastructure: 6.0,
    },
    hasNamedSponsor: true,
    dataAvailableForEngagement: true,
    timeToPilotWeeks: 10,
    absoluteAnnualValue: 2_000_000,
  };
  return { ...defaults, ...overrides };
}

// ---------------------------------------------------------------------------
// CHANGE 1 — normalizeValueScores (log10 min-max normalization)
// ---------------------------------------------------------------------------
describe("normalizeValueScores (log10 min-max)", () => {
  it("returns empty array for empty input", () => {
    expect(normalizeValueScores([])).toEqual([]);
  });

  it("returns neutral 5.5 for a single use case", () => {
    expect(normalizeValueScores([42])).toEqual([5.5]);
  });

  it("returns 5.5 for every entry when all ratios are identical", () => {
    expect(normalizeValueScores([3, 3, 3, 3])).toEqual([5.5, 5.5, 5.5, 5.5]);
  });

  it("anchors min to 1 and max to 10 across a heavy-tailed range", () => {
    const out = normalizeValueScores([1, 10, 100, 1000, 10000]);
    expect(out[0]).toBe(1);
    expect(out[out.length - 1]).toBe(10);
    // Strictly monotonic on a log scale.
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThan(out[i - 1]);
    }
  });

  it("compresses extreme outliers thanks to log10 transform", () => {
    const linearGap = 1_000_000 - 100;
    const out = normalizeValueScores([1, 10, 100, 1_000_000]);
    // Even though the absolute gap is enormous, the log-normalized output
    // never exceeds the [1, 10] band and the spread is bounded.
    expect(Math.max(...out) - Math.min(...out)).toBe(9);
    expect(linearGap).toBeGreaterThan(900_000); // sanity check the fixture
  });

  it("floors ratios < 1 and non-finite values at log10(1) = 0", () => {
    const out = normalizeValueScores([0.001, 0, -5, Number.NaN, Number.POSITIVE_INFINITY, 100]);
    // Only the last entry has a positive log; all others should map to the floor.
    const floor = out[0];
    expect(out.slice(0, 5).every((v) => v === floor)).toBe(true);
    expect(out[5]).toBeGreaterThan(floor);
  });

  it("clamps every output to the [1, 10] band", () => {
    const out = normalizeValueScores([1, 2, 5, 9, 17, 200, 5000]);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});

// ---------------------------------------------------------------------------
// CHANGE 2 + 3 — evaluateFloors (hard knock-outs vs soft blockers)
// ---------------------------------------------------------------------------
describe("evaluateFloors (hard vs soft floor evaluation)", () => {
  it("flags legallyProhibited as a hard failure", () => {
    const res = evaluateFloors(makeUseCase({ legallyProhibited: true }));
    expect(res.hardFailures.some((m) => m.toLowerCase().includes("legally prohibited"))).toBe(true);
    expect(res.softBlockers).toEqual([]);
  });

  it("flags technicallyInfeasible as a hard failure", () => {
    const res = evaluateFloors(makeUseCase({ technicallyInfeasible: true }));
    expect(res.hardFailures.some((m) => m.toLowerCase().includes("technical capability"))).toBe(true);
  });

  it("requires BOTH normalized AND absolute value below threshold for the value floor to hard-fail", () => {
    // Below normalized but absolute value is well above the $500K floor → no hard fail.
    const onlyNormLow = evaluateFloors(makeUseCase({ valueScore: 2.0, absoluteAnnualValue: 5_000_000 }));
    expect(onlyNormLow.hardFailures.some((m) => m.toLowerCase().includes("value below floor"))).toBe(false);

    // Below absolute but normalized score is well above 4.0 → no hard fail.
    const onlyAbsLow = evaluateFloors(makeUseCase({ valueScore: 8.5, absoluteAnnualValue: 100_000 }));
    expect(onlyAbsLow.hardFailures.some((m) => m.toLowerCase().includes("value below floor"))).toBe(false);

    // Both below → hard fail.
    const bothLow = evaluateFloors(makeUseCase({ valueScore: 2.5, absoluteAnnualValue: 100_000 }));
    expect(bothLow.hardFailures.some((m) => m.toLowerCase().includes("value below floor"))).toBe(true);
  });

  it("treats sponsor=false as a soft blocker, not a hard failure", () => {
    const res = evaluateFloors(makeUseCase({ hasNamedSponsor: false }));
    expect(res.hardFailures).toEqual([]);
    expect(res.softBlockers.some((m) => m.toLowerCase().includes("sponsor"))).toBe(true);
  });

  it("treats sponsor=null as an intake-incomplete soft blocker", () => {
    const res = evaluateFloors(makeUseCase({ hasNamedSponsor: null }));
    expect(res.hardFailures).toEqual([]);
    expect(res.softBlockers.some((m) => m.toLowerCase().includes("intake incomplete"))).toBe(true);
  });

  it("treats data unavailable as a soft 'data access sprint' blocker", () => {
    const res = evaluateFloors(makeUseCase({ dataAvailableForEngagement: false }));
    expect(res.hardFailures).toEqual([]);
    expect(res.softBlockers.some((m) => m.toLowerCase().includes("data access sprint"))).toBe(true);
  });

  it("treats data=null as an intake-incomplete soft blocker", () => {
    const res = evaluateFloors(makeUseCase({ dataAvailableForEngagement: null }));
    expect(res.hardFailures).toEqual([]);
    expect(res.softBlockers.some((m) => m.toLowerCase().includes("intake incomplete"))).toBe(true);
  });

  it("flags time-to-pilot above target as a soft sequencing blocker", () => {
    const res = evaluateFloors(makeUseCase({ timeToPilotWeeks: 24 }));
    expect(res.hardFailures).toEqual([]);
    expect(res.softBlockers.some((m) => m.toLowerCase().includes("time-to-pilot"))).toBe(true);
  });

  it("returns no failures or blockers for a clean intake", () => {
    expect(evaluateFloors(makeUseCase())).toEqual({ hardFailures: [], softBlockers: [] });
  });
});

// ---------------------------------------------------------------------------
// CHANGE 4 — assignQuadrantV21 routing through Layer 1 / 2 / 3
// ---------------------------------------------------------------------------
describe("assignQuadrantV21 (Layer 1 / 2 / 3 routing)", () => {
  it("Layer 1: hard-failed use cases land in Foundation with hardFailures populated", () => {
    const uc = makeUseCase({ id: "HARD", technicallyInfeasible: true, valueScore: 9, readinessScore: 9 });
    const a = assignQuadrantV21(uc, [uc]);
    expect(a.quadrant).toBe("foundation");
    expect(a.layer).toBe(1);
    expect(a.hardFailures && a.hardFailures.length).toBeGreaterThan(0);
    // Backward-compatible field is mirrored for v2.0 consumers.
    expect(a.floorFailureReasons).toEqual(a.hardFailures);
  });

  it("Layer 2: high V + high R = Champion", () => {
    const uc = makeUseCase({ id: "C", valueScore: 8.0, readinessScore: 8.0 });
    expect(assignQuadrantV21(uc, [uc]).quadrant).toBe("champion");
  });

  it("Layer 2: high V + mid R = Strategic", () => {
    const uc = makeUseCase({ id: "S", valueScore: 8.0, readinessScore: 6.5 });
    const a = assignQuadrantV21(uc, [uc]);
    expect(a.quadrant).toBe("strategic");
    expect(a.layer).toBe(2);
  });

  it("Layer 2: mid V + high R = Quick Win", () => {
    const uc = makeUseCase({ id: "Q", valueScore: 6.5, readinessScore: 8.0 });
    const a = assignQuadrantV21(uc, [uc]);
    expect(a.quadrant).toBe("quick_win");
    expect(a.layer).toBe(2);
  });

  it("Layer 2: above-floor but below all thresholds → Foundation (Layer 2, no hardFailures)", () => {
    // Create a portfolio that already has a Champion so Layer 3 cannot fire.
    const champion = makeUseCase({ id: "C", valueScore: 8.0, readinessScore: 8.0 });
    const sub = makeUseCase({ id: "F", valueScore: 5.5, readinessScore: 5.5 });
    const a = assignQuadrantV21(sub, [champion, sub]);
    expect(a.quadrant).toBe("foundation");
    expect(a.layer).toBe(2);
    expect(a.hardFailures ?? []).toEqual([]);
  });

  it("Layer 3 does NOT fire when the portfolio already has a Strategic above-floor candidate", () => {
    const strategic = makeUseCase({ id: "S", valueScore: 8.0, readinessScore: 6.5 });
    const sub = makeUseCase({ id: "MID", valueScore: 5.5, readinessScore: 5.5 });
    const a = assignQuadrantV21(sub, [strategic, sub]);
    expect(a.quadrant).toBe("foundation");
    expect(a.layer).toBe(2);
  });

  it("Layer 3 fires when no above-floor quadrant is populated, promoting top 2 by composite", () => {
    // Three above-floor use cases, none reaching Champion / Strategic / Quick Win.
    const a = makeUseCase({ id: "A", valueScore: 5.8, readinessScore: 5.8 }); // composite 5.8
    const b = makeUseCase({ id: "B", valueScore: 5.6, readinessScore: 5.6 }); // composite 5.6
    const c = makeUseCase({ id: "C", valueScore: 5.0, readinessScore: 5.0 }); // composite 5.0
    const portfolio = [a, b, c];
    const map = assignPortfolioQuadrantsV21(portfolio);
    expect(map.get("A")!.quadrant).toBe("conditional_champion");
    expect(map.get("A")!.layer).toBe(3);
    expect(map.get("B")!.quadrant).toBe("conditional_champion");
    expect(map.get("C")!.quadrant).toBe("foundation");
  });

  it("Conditional-champion meta names readiness gaps and proposes a sprint length", () => {
    const a = makeUseCase({
      id: "A",
      valueScore: 5.8,
      readinessScore: 5.8,
      componentScores: { orgCapacity: 5, dataReadiness: 4, governance: 6, techInfrastructure: 5 },
    });
    const b = makeUseCase({ id: "B", valueScore: 5.0, readinessScore: 5.0 });
    const map = assignPortfolioQuadrantsV21([a, b]);
    const meta = map.get("A")!.conditionalChampionMeta!;
    expect(meta).toBeDefined();
    expect(meta.gaps.length).toBeGreaterThan(0);
    expect(meta.proposedSprintWeeks).toBeGreaterThanOrEqual(4);
    expect(meta.proposedSprintWeeks).toBeLessThanOrEqual(12);
    expect(meta.reclassificationCriteria).toMatch(/Promote to unconditional Champion/);
  });

  it("assignPortfolioQuadrantsV21 tags Champions with Wave 1 / Wave 2", () => {
    const champs = [
      makeUseCase({ id: "C1", valueScore: 9.5, readinessScore: 9.5 }),
      makeUseCase({ id: "C2", valueScore: 8.5, readinessScore: 8.5 }),
      makeUseCase({ id: "C3", valueScore: 8.0, readinessScore: 8.0 }),
      makeUseCase({ id: "C4", valueScore: 7.6, readinessScore: 7.6 }),
    ];
    const map = assignPortfolioQuadrantsV21(champs);
    // Top 30% (= 2 with ceil) become Wave 1.
    expect(map.get("C1")!.wave).toBe("Wave 1");
    expect(map.get("C2")!.wave).toBe("Wave 1");
    expect(map.get("C3")!.wave).toBe("Wave 2");
    expect(map.get("C4")!.wave).toBe("Wave 2");
  });
});

// ---------------------------------------------------------------------------
// CHANGE 5 — proposeSprintWeeks (dynamic sprint sizing)
// ---------------------------------------------------------------------------
describe("proposeSprintWeeks (dynamic sprint sizing)", () => {
  it("returns the 4-week base when no gaps or blockers", () => {
    expect(proposeSprintWeeks({ scoreGaps: [], softBlockers: [] })).toBe(4);
  });

  it("adds 4 weeks for a >=2 point dataReadiness gap", () => {
    const weeks = proposeSprintWeeks({
      scoreGaps: [{ component: "dataReadiness", current: 4, required: 7 }],
      softBlockers: [],
    });
    expect(weeks).toBe(8);
  });

  it("adds 4 weeks when a data-access soft blocker is present", () => {
    const weeks = proposeSprintWeeks({
      scoreGaps: [],
      softBlockers: ["Data access sprint required (6 weeks default)"],
    });
    expect(weeks).toBe(8);
  });

  it("adds 1 week for a sponsor soft blocker", () => {
    const weeks = proposeSprintWeeks({
      scoreGaps: [],
      softBlockers: ["No named business sponsor — confirm at intake"],
    });
    expect(weeks).toBe(5);
  });

  it("adds 2 weeks for a >=2 point orgCapacity gap", () => {
    const weeks = proposeSprintWeeks({
      scoreGaps: [{ component: "orgCapacity", current: 4, required: 7 }],
      softBlockers: [],
    });
    expect(weeks).toBe(6);
  });

  it("never proposes more than the 12-week ceiling", () => {
    const weeks = proposeSprintWeeks({
      scoreGaps: [
        { component: "dataReadiness", current: 1, required: 7 },
        { component: "orgCapacity", current: 1, required: 7 },
      ],
      softBlockers: [
        "Data access sprint required (6 weeks default)",
        "No named business sponsor — confirm at intake",
      ],
    });
    expect(weeks).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// CHANGE 6 — computePortfolioDiagnostic warnings
// ---------------------------------------------------------------------------
describe("computePortfolioDiagnostic (warnings & medians)", () => {
  it("raises EMPTY_MATRIX when no prototyping candidates exist", () => {
    const uc = makeUseCase({ id: "X", technicallyInfeasible: true });
    const map = assignPortfolioQuadrantsV21([uc]);
    const diag = computePortfolioDiagnostic([uc], map);
    expect(diag.prototypingCandidatesCount).toBe(0);
    expect(diag.warnings.find((w) => w.code === "EMPTY_MATRIX")?.severity).toBe("critical");
  });

  it("raises VALUE_DISTRIBUTION_SKEWED when median normalized value < floor", () => {
    const portfolio = [
      makeUseCase({ id: "A", valueScore: 2.0, readinessScore: 6.0 }),
      makeUseCase({ id: "B", valueScore: 2.5, readinessScore: 6.0 }),
      makeUseCase({ id: "C", valueScore: 3.0, readinessScore: 6.0 }),
    ];
    const map = assignPortfolioQuadrantsV21(portfolio);
    const diag = computePortfolioDiagnostic(portfolio, map);
    expect(diag.warnings.some((w) => w.code === "VALUE_DISTRIBUTION_SKEWED")).toBe(true);
  });

  it("raises INTAKE_INCOMPLETE when >30% of intakes have nulls", () => {
    const portfolio = [
      makeUseCase({ id: "A", hasNamedSponsor: null }),
      makeUseCase({ id: "B", dataAvailableForEngagement: null }),
      makeUseCase({ id: "C" }),
      makeUseCase({ id: "D" }),
    ];
    const map = assignPortfolioQuadrantsV21(portfolio);
    const diag = computePortfolioDiagnostic(portfolio, map);
    expect(diag.warnings.some((w) => w.code === "INTAKE_INCOMPLETE")).toBe(true);
  });

  it("raises HARD_FLOOR_DOMINANT when more than half of use cases hard-fail", () => {
    const portfolio = [
      makeUseCase({ id: "A", technicallyInfeasible: true }),
      makeUseCase({ id: "B", legallyProhibited: true }),
      makeUseCase({ id: "C", technicallyInfeasible: true }),
      makeUseCase({ id: "D", valueScore: 8, readinessScore: 8 }),
    ];
    const map = assignPortfolioQuadrantsV21(portfolio);
    const diag = computePortfolioDiagnostic(portfolio, map);
    expect(diag.warnings.some((w) => w.code === "HARD_FLOOR_DOMINANT")).toBe(true);
  });

  it("raises STRONG_PORTFOLIO when Champions exceed 5", () => {
    const portfolio = Array.from({ length: 6 }).map((_, i) =>
      makeUseCase({ id: `C${i}`, valueScore: 8.0 + i * 0.1, readinessScore: 8.0 + i * 0.1 }),
    );
    const map = assignPortfolioQuadrantsV21(portfolio);
    const diag = computePortfolioDiagnostic(portfolio, map);
    expect(diag.byQuadrant.champion).toBeGreaterThan(5);
    expect(diag.warnings.some((w) => w.code === "STRONG_PORTFOLIO")).toBe(true);
  });

  it("computes medians correctly for even and odd portfolio sizes", () => {
    const odd = [
      makeUseCase({ id: "A", valueScore: 4.0, readinessScore: 5.0 }),
      makeUseCase({ id: "B", valueScore: 6.0, readinessScore: 5.0 }),
      makeUseCase({ id: "C", valueScore: 8.0, readinessScore: 5.0 }),
    ];
    const oddDiag = computePortfolioDiagnostic(odd, assignPortfolioQuadrantsV21(odd));
    expect(oddDiag.medianValueScore).toBe(6);

    const even = [
      makeUseCase({ id: "A", valueScore: 4.0, readinessScore: 5.0 }),
      makeUseCase({ id: "B", valueScore: 6.0, readinessScore: 5.0 }),
      makeUseCase({ id: "C", valueScore: 8.0, readinessScore: 5.0 }),
      makeUseCase({ id: "D", valueScore: 10.0, readinessScore: 5.0 }),
    ];
    const evenDiag = computePortfolioDiagnostic(even, assignPortfolioQuadrantsV21(even));
    expect(evenDiag.medianValueScore).toBe(7);
  });

  it("respects engagement config overrides via resolveEngagementConfig", () => {
    const cfg: EngagementConfig = resolveEngagementConfig({
      valueFloor: { minNormalizedScore: 5.0, minAbsoluteAnnualValue: 250_000 },
      championMin: 8.5,
    });
    expect(cfg.valueFloor.minNormalizedScore).toBe(5.0);
    expect(cfg.valueFloor.minAbsoluteAnnualValue).toBe(250_000);
    expect(cfg.championMin).toBe(8.5);
    // Defaults are preserved for unset overrides.
    expect(cfg.quickStrategicMin).toBe(DEFAULT_ENGAGEMENT_CONFIG.quickStrategicMin);
    expect(cfg.maxTimeToPilotWeeks).toBe(DEFAULT_ENGAGEMENT_CONFIG.maxTimeToPilotWeeks);
  });
});

// ---------------------------------------------------------------------------
// SPEC ACCEPTANCE SUITE — the six v2.1 corrective-release acceptance criteria,
// run automatically (replaces the retired scripts/diagnostic-vrm-v21.ts).
// To run this suite in isolation:
//     npx vitest run tests/vrm-v2.test.ts -t "VRM v2.1 spec acceptance"
// ---------------------------------------------------------------------------
describe("VRM v2.1 spec acceptance (10-use-case diagnostic fixture)", () => {
  type FixtureRow = {
    id: string;
    evRaw: number;
    frictionAnnual: number;
    absoluteAnnualValue: number;
    readinessScore: number;
    hasNamedSponsor: boolean | null;
    dataAvailable: boolean | null;
    timeToPilotWeeks: number;
    legallyProhibited: boolean;
    technicallyInfeasible: boolean;
  };

  const FIXTURES: FixtureRow[] = [
    { id: "TC-01", evRaw: 2_500_000, frictionAnnual: 320_000, absoluteAnnualValue: 4_200_000, readinessScore: 7.6, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 10, legallyProhibited: false, technicallyInfeasible: false },
    { id: "TC-02", evRaw: 1_800_000, frictionAnnual: 260_000, absoluteAnnualValue: 3_100_000, readinessScore: 4.5, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 12, legallyProhibited: false, technicallyInfeasible: false },
    { id: "TC-03", evRaw: 1_400_000, frictionAnnual: 220_000, absoluteAnnualValue: 2_400_000, readinessScore: 7.7, hasNamedSponsor: true,  dataAvailable: false, timeToPilotWeeks:  8, legallyProhibited: false, technicallyInfeasible: false },
    { id: "TC-04", evRaw:   950_000, frictionAnnual: 200_000, absoluteAnnualValue: 1_900_000, readinessScore: 4.6, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 14, legallyProhibited: false, technicallyInfeasible: false },
    { id: "TC-05", evRaw:   700_000, frictionAnnual: 180_000, absoluteAnnualValue: 1_500_000, readinessScore: 4.4, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 12, legallyProhibited: false, technicallyInfeasible: false },
    { id: "TC-06", evRaw:   600_000, frictionAnnual: 170_000, absoluteAnnualValue: 1_350_000, readinessScore: 4.3, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 13, legallyProhibited: false, technicallyInfeasible: false },
    { id: "TC-07", evRaw:   550_000, frictionAnnual: 160_000, absoluteAnnualValue: 1_200_000, readinessScore: 4.5, hasNamedSponsor: null,  dataAvailable: true,  timeToPilotWeeks: 11, legallyProhibited: false, technicallyInfeasible: false },
    { id: "TC-08", evRaw:   400_000, frictionAnnual: 140_000, absoluteAnnualValue:   950_000, readinessScore: 4.2, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 22, legallyProhibited: false, technicallyInfeasible: false },
    { id: "TC-09", evRaw:   220_000, frictionAnnual: 110_000, absoluteAnnualValue:   720_000, readinessScore: 4.3, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks:  9, legallyProhibited: false, technicallyInfeasible: false },
    { id: "TC-10", evRaw:   180_000, frictionAnnual:  90_000, absoluteAnnualValue:   350_000, readinessScore: 4.0, hasNamedSponsor: false, dataAvailable: false, timeToPilotWeeks: 26, legallyProhibited: false, technicallyInfeasible: true  },
  ];

  const cfg = resolveEngagementConfig();
  const rawRatios = FIXTURES.map((f) => f.evRaw / Math.max(f.frictionAnnual, 1));
  const normalizedValues = normalizeValueScores(rawRatios);
  const portfolio: UseCaseScoringV21[] = FIXTURES.map((f, i) => ({
    id: f.id,
    valueScore: normalizedValues[i],
    valueScoreRaw: rawRatios[i],
    absoluteAnnualValue: f.absoluteAnnualValue,
    readinessScore: f.readinessScore,
    componentScores: {
      orgCapacity: f.readinessScore,
      dataReadiness: f.readinessScore,
      governance: f.readinessScore,
      techInfrastructure: f.readinessScore,
    },
    timeToPilotWeeks: f.timeToPilotWeeks,
    hasNamedSponsor: f.hasNamedSponsor,
    dataAvailableForEngagement: f.dataAvailable,
    legallyProhibited: f.legallyProhibited,
    technicallyInfeasible: f.technicallyInfeasible,
  }));
  const quadrantMap = assignPortfolioQuadrantsV21(portfolio, cfg);
  const diag = computePortfolioDiagnostic(portfolio, quadrantMap, cfg);

  it("acceptance #1: median normalized Value Score lies in 4.5–6.5", () => {
    expect(diag.medianValueScore).toBeGreaterThanOrEqual(4.5);
    expect(diag.medianValueScore).toBeLessThanOrEqual(6.5);
  });

  it("acceptance #2: at least 2 prototyping candidates outside Foundation", () => {
    expect(diag.prototypingCandidatesCount).toBeGreaterThanOrEqual(2);
  });

  it("acceptance #3: TC-10 hard-fails (technicallyInfeasible) and lands in Foundation", () => {
    const tc10 = quadrantMap.get("TC-10")!;
    expect(tc10.quadrant).toBe("foundation");
    expect(tc10.layer).toBe(1);
    expect((tc10.hardFailures ?? []).length).toBeGreaterThan(0);
  });

  it("acceptance #4: TC-07 raises a sponsor soft blocker without any hard knock-out", () => {
    const tc07 = quadrantMap.get("TC-07")!;
    expect((tc07.hardFailures ?? []).length).toBe(0);
    expect((tc07.softBlockers ?? []).some((s) => s.toLowerCase().includes("sponsor"))).toBe(true);
  });

  it("acceptance #5: TC-03 raises a data-access soft blocker AND stays out of Foundation", () => {
    const tc03 = quadrantMap.get("TC-03")!;
    expect(tc03.quadrant).not.toBe("foundation");
    expect((tc03.softBlockers ?? []).some((s) => s.toLowerCase().includes("data access"))).toBe(true);
  });

  it("acceptance #6: portfolio diagnostic raises READINESS_BUNCHED_LOW", () => {
    expect(diag.warnings.some((w) => w.code === "READINESS_BUNCHED_LOW")).toBe(true);
  });
});
