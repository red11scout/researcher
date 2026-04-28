/**
 * VRM v2.1 Diagnostic Test — verifies the corrective release on top of v2.0.
 *
 * Acceptance criteria (from replit-prompt-vrm-v2.1):
 *   - Median value score in 4.5–6.5 (log-normalized) so the portfolio is
 *     not artificially bunched at the floor.
 *   - ≥ 2 prototyping candidates outside Foundation
 *     (Champion + ConditionalChampion + QuickWin).
 *   - The diagnostic raises READINESS_BUNCHED_LOW because most readiness
 *     scores live in the low band and no Conditional Champion was promoted.
 *   - At least one use case is hard-failed (legallyProhibited or
 *     technicallyInfeasible) and lands in Foundation with a hard reason.
 *   - Soft blockers (sponsor null, data unavailable) DO NOT relegate items to
 *     Foundation — they should still appear in Champion / Quick Win etc.
 *
 * Run: `tsx scripts/diagnostic-vrm-v21.ts`
 */
import {
  DEFAULT_ENGAGEMENT_CONFIG,
  assignPortfolioQuadrantsV21,
  computePortfolioDiagnostic,
  normalizeValueScores,
  resolveEngagementConfig,
  type UseCaseScoringV21,
} from "../shared/vrm-v2.js";

type FixtureRow = {
  id: string;
  useCase: string;
  evRaw: number;          // expected value × probability of success
  frictionAnnual: number; // friction-cost denominator
  absoluteAnnualValue: number; // total annual value × P
  readinessScore: number;
  hasNamedSponsor: boolean | null;
  dataAvailable: boolean | null;
  timeToPilotWeeks: number;
  legallyProhibited: boolean;
  technicallyInfeasible: boolean;
};

// 10 use cases designed to exercise the v2.1 logic.
//   - TC-01 = Champion (V high, R high)
//   - TC-03 = Quick Win, BUT data unavailable → soft blocker (still QW)
//   - TC-07 = Foundation (R<6) but sponsor null → soft blocker
//   - TC-10 = HARD FAIL (technicallyInfeasible) → Foundation
//   - Most readiness < 5.0 → READINESS_BUNCHED_LOW
//   - Median value (after log-normalize) in 4.5–6.5
const FIXTURES: FixtureRow[] = [
  { id: "TC-01", useCase: "AML Alert Triage",                  evRaw: 2_500_000, frictionAnnual: 320_000, absoluteAnnualValue: 4_200_000, readinessScore: 7.6, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 10, legallyProhibited: false, technicallyInfeasible: false },
  { id: "TC-02", useCase: "Wealth Advisor Productivity",       evRaw: 1_800_000, frictionAnnual: 260_000, absoluteAnnualValue: 3_100_000, readinessScore: 4.5, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 12, legallyProhibited: false, technicallyInfeasible: false },
  { id: "TC-03", useCase: "Customer Onboarding Copilot",       evRaw: 1_400_000, frictionAnnual: 220_000, absoluteAnnualValue: 2_400_000, readinessScore: 7.7, hasNamedSponsor: true,  dataAvailable: false, timeToPilotWeeks:  8, legallyProhibited: false, technicallyInfeasible: false },
  { id: "TC-04", useCase: "Branch Forecasting",                evRaw:   950_000, frictionAnnual: 200_000, absoluteAnnualValue: 1_900_000, readinessScore: 4.6, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 14, legallyProhibited: false, technicallyInfeasible: false },
  { id: "TC-05", useCase: "Servicing Knowledge Search",        evRaw:   700_000, frictionAnnual: 180_000, absoluteAnnualValue: 1_500_000, readinessScore: 4.4, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 12, legallyProhibited: false, technicallyInfeasible: false },
  { id: "TC-06", useCase: "Loss Mitigation Triage",            evRaw:   600_000, frictionAnnual: 170_000, absoluteAnnualValue: 1_350_000, readinessScore: 4.3, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 13, legallyProhibited: false, technicallyInfeasible: false },
  { id: "TC-07", useCase: "Document Summarization",            evRaw:   550_000, frictionAnnual: 160_000, absoluteAnnualValue: 1_200_000, readinessScore: 4.5, hasNamedSponsor: null,  dataAvailable: true,  timeToPilotWeeks: 11, legallyProhibited: false, technicallyInfeasible: false },
  { id: "TC-08", useCase: "Vendor Risk Surveillance",          evRaw:   400_000, frictionAnnual: 140_000, absoluteAnnualValue:   950_000, readinessScore: 4.2, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks: 22, legallyProhibited: false, technicallyInfeasible: false },
  { id: "TC-09", useCase: "Internal Policy Q&A Bot",           evRaw:   220_000, frictionAnnual: 110_000, absoluteAnnualValue:   720_000, readinessScore: 4.3, hasNamedSponsor: true,  dataAvailable: true,  timeToPilotWeeks:  9, legallyProhibited: false, technicallyInfeasible: false },
  { id: "TC-10", useCase: "Real-Time Speech Lie Detection",    evRaw:   180_000, frictionAnnual:  90_000, absoluteAnnualValue:   350_000, readinessScore: 4.0, hasNamedSponsor: false, dataAvailable: false, timeToPilotWeeks: 26, legallyProhibited: false, technicallyInfeasible: true  },
];

function main() {
  const cfg = resolveEngagementConfig();
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("VRM v2.1 — Diagnostic Test (10 Use Cases)");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(
    `Engagement config: minNorm=${cfg.valueFloor.minNormalizedScore}, ` +
      `minAbs=$${(cfg.valueFloor.minAbsoluteAnnualValue / 1000).toFixed(0)}K, ` +
      `championMin=${cfg.championMin}, quickStrategicMin=${cfg.quickStrategicMin}, ` +
      `maxTTP=${cfg.maxTimeToPilotWeeks}wk, dataSprint=${cfg.dataAccessSprintWeeks}wk\n`,
  );

  // Step 1 — log-transformed normalization across the portfolio
  const rawRatios = FIXTURES.map((f) => f.evRaw / Math.max(f.frictionAnnual, 1));
  const normalizedValues = normalizeValueScores(rawRatios);

  // Step 2 — build UseCaseScoringV21 inputs
  const portfolio: UseCaseScoringV21[] = FIXTURES.map((f, i) => ({
    id: f.id,
    useCase: f.useCase,
    valueScore: normalizedValues[i],
    valueScoreRaw: rawRatios[i],
    absoluteAnnualValue: f.absoluteAnnualValue,
    readinessScore: f.readinessScore,
    timeToPilotWeeks: f.timeToPilotWeeks,
    hasNamedSponsor: f.hasNamedSponsor,
    dataAvailableForEngagement: f.dataAvailable,
    legallyProhibited: f.legallyProhibited,
    technicallyInfeasible: f.technicallyInfeasible,
  }));

  // Step 3 — assign quadrants & compute the diagnostic
  const quadrantMap = assignPortfolioQuadrantsV21(portfolio, cfg);
  const diag = computePortfolioDiagnostic(portfolio, quadrantMap, cfg);

  // Per-use-case assignments
  console.log("USE CASE ASSIGNMENTS");
  console.log("────────────────────────────────────────────────────────────────────");
  console.log("ID     V(raw)   V(norm)  R    Quadrant              Layer  Hard / Soft blockers");
  for (const sc of portfolio) {
    const q = quadrantMap.get(sc.id)!;
    const hardArr = q.hardFailures ?? [];
    const softArr = q.softBlockers ?? [];
    const hard = hardArr.length > 0 ? `HARD: ${hardArr.join("; ")}` : "";
    const soft = softArr.length > 0 ? `SOFT: ${softArr.join("; ")}` : "";
    console.log(
      `${sc.id}  ${(sc.valueScoreRaw ?? 0).toFixed(2).padStart(6)}   ` +
        `${sc.valueScore.toFixed(2).padStart(5)}   ${sc.readinessScore.toFixed(1)}  ` +
        `${q.quadrant.padEnd(20)}  L${q.layer}    ${[hard, soft].filter(Boolean).join(" | ")}`,
    );
  }

  console.log("\nPORTFOLIO DIAGNOSTIC");
  console.log("────────────────────────────────────────────────────────────────────");
  console.log(`Total use cases: ${diag.totalUseCases}`);
  console.log(
    `Prototyping candidates: ${diag.prototypingCandidatesCount} ` +
      `(${diag.totalUseCases > 0 ? Math.round((diag.prototypingCandidatesCount / diag.totalUseCases) * 100) : 0}%)`,
  );
  console.log(
    `  Champion: ${diag.byQuadrant.champion}  ` +
      `ConditionalChamp: ${diag.byQuadrant.conditional_champion}  ` +
      `QuickWin: ${diag.byQuadrant.quick_win}  ` +
      `Strategic: ${diag.byQuadrant.strategic}  ` +
      `Foundation: ${diag.byQuadrant.foundation}`,
  );
  console.log(
    `Median value: ${diag.medianValueScore.toFixed(2)}  ` +
      `Median readiness: ${diag.medianReadinessScore.toFixed(2)}  ` +
      `HardFloorRate: ${(diag.hardFloorFailureRate * 100).toFixed(0)}%  ` +
      `IntakeIncomplete: ${(diag.intakeIncompletionRate * 100).toFixed(0)}%`,
  );

  if (diag.warnings.length === 0) {
    console.log("\nNo warnings raised.");
  } else {
    console.log("\nWARNINGS");
    for (const w of diag.warnings) {
      console.log(`  [${w.severity.toUpperCase()}] ${w.code}: ${w.message}`);
      if (w.recommendedAction) console.log(`           → ${w.recommendedAction}`);
    }
  }

  // Acceptance criteria
  console.log("\nACCEPTANCE CRITERIA");
  console.log("────────────────────────────────────────────────────────────────────");
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  const medV = diag.medianValueScore;
  checks.push({
    name: "Median value in 4.5–6.5",
    pass: medV >= 4.5 && medV <= 6.5,
    detail: `medianValueScore=${medV.toFixed(2)}`,
  });

  const protoCount = diag.prototypingCandidatesCount;
  checks.push({
    name: "≥ 2 prototyping candidates outside Foundation",
    pass: protoCount >= 2,
    detail: `prototypingCandidatesCount=${protoCount} (champ=${diag.byQuadrant.champion}, cc=${diag.byQuadrant.conditional_champion}, qw=${diag.byQuadrant.quick_win})`,
  });

  const tc10 = quadrantMap.get("TC-10")!;
  const tc10HardFailed = (tc10.hardFailures ?? []).length > 0 && tc10.quadrant === "foundation";
  checks.push({
    name: "TC-10 hard-failed → Foundation",
    pass: tc10HardFailed,
    detail: `quadrant=${tc10.quadrant}, hard=[${(tc10.hardFailures ?? []).join("; ")}]`,
  });

  const tc07 = quadrantMap.get("TC-07")!;
  const tc07SoftSponsor = (tc07.softBlockers ?? []).some((s) => s.toLowerCase().includes("sponsor"));
  checks.push({
    name: "TC-07 has sponsor soft blocker, no hard knock-out",
    pass: tc07SoftSponsor && (tc07.hardFailures ?? []).length === 0,
    detail: `quadrant=${tc07.quadrant}, soft=[${(tc07.softBlockers ?? []).join("; ")}], hardCount=${(tc07.hardFailures ?? []).length}`,
  });

  const tc03 = quadrantMap.get("TC-03")!;
  const tc03DataSoft = (tc03.softBlockers ?? []).some((s) => s.toLowerCase().includes("data access"));
  checks.push({
    name: "TC-03 has data-access soft blocker AND stays out of Foundation",
    pass: tc03DataSoft && tc03.quadrant !== "foundation",
    detail: `quadrant=${tc03.quadrant}, soft=[${(tc03.softBlockers ?? []).join("; ")}]`,
  });

  const hasReadinessBunched = diag.warnings.some((w) => w.code === "READINESS_BUNCHED_LOW");
  checks.push({
    name: "READINESS_BUNCHED_LOW warning raised",
    pass: hasReadinessBunched,
    detail: `warnings=[${diag.warnings.map((w) => w.code).join(", ")}]`,
  });

  let pass = true;
  for (const c of checks) {
    const mark = c.pass ? "✔" : "✗";
    console.log(`  ${mark} ${c.name}`);
    console.log(`      ${c.detail}`);
    if (!c.pass) pass = false;
  }

  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log(
    pass
      ? "✔ PASS — VRM v2.1 satisfies the corrective release acceptance suite."
      : "✗ FAIL — review the failing checks above.",
  );
  console.log("═══════════════════════════════════════════════════════════════════");

  process.exit(pass ? 0 : 1);
}

main();
