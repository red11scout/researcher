// tests/post-process-analysis.test.ts
//
// End-to-end coverage for `postProcessAnalysis` itself — the calculation
// pipeline that turns an AI-generated v2.0-shaped analysis into the current
// v2.2 contract that the rest of the app reads. The migration / backfill
// suite (tests/report-backfill.test.ts) covers the staleness rules and the
// admin entry point that calls this function; here we exercise the function
// directly to guard against scoping / initialization regressions in the
// calculation engine itself (e.g. the `portfolioDiagnosticV22 is not
// defined` bug that would have shipped silently without any pipeline-level
// test).
//
// Three baseline fixtures exercise the supported entry shapes:
//   1. Minimal v2.0   — single use case with the smallest possible inputs
//   2. Full v2.0      — multiple use cases across themes, fully populated
//   3. Synthesized-from-Step-5 — Step 6 omitted entirely so the recovery
//      branch synthesizes Step 6 records from Step 5
//
// Every test asserts the post-processed `vrm` block is a v2.2 envelope with
// a populated diagnostic and the flat fields the UI is keyed off.
//
// A regression test specifically pins the path that produced the original
// scoping bug: a portfolio where no use case qualifies as a champion. The
// v2.2 metadata block must still be built (with championCount === 0) rather
// than crashing because `portfolioDiagnosticV22` is undefined.

import { describe, expect, it } from "vitest";

import { postProcessAnalysis } from "../server/calculation-postprocessor";
import { evaluateReportStaleness } from "../server/report-backfill";
import { VRM_SCHEMA_VERSION } from "../shared/vrm-v2";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/**
 * Smallest viable v2.0-shaped analysis: one use case, structured cost labels
 * so the value-scoring path produces a non-zero benefit, and a Step 6 record
 * without the v2.1 hard knock-out fields.
 */
function makeMinimalV20Analysis(): any {
  return {
    steps: [
      {
        step: 0,
        title: "Company Profile",
        data: [{ "Annual Revenue ($)": 50_000_000, "Total Employees": 250 }],
      },
      {
        step: 5,
        title: "Benefits Quantification",
        data: [
          {
            ID: "UC-1",
            "Use Case": "Automated Quote Generation",
            "Cost Formula Labels": {
              components: [
                { label: "Hours Saved", value: 4000 },
                { label: "Loaded Hourly Rate", value: 120 },
                { label: "Benefits Loading", value: 1.35 },
                { label: "Adoption Rate", value: 0.9 },
                { label: "Data Maturity", value: 0.75 },
              ],
            },
            "Probability of Success": 0.75,
          },
        ],
      },
      {
        step: 6,
        title: "Readiness & Token Modeling",
        data: [
          {
            ID: "UC-1",
            "Use Case": "Automated Quote Generation",
            "Organizational Capacity": 7,
            "Data Availability & Quality": 7,
            "Technical Infrastructure": 7,
            "Governance": 7,
            "Time-to-Value (months)": 6,
            "Runs/Month": 1000,
            "Input Tokens/Run": 800,
            "Output Tokens/Run": 800,
          },
        ],
      },
    ],
    vrm: { schemaVersion: "2.0" },
  };
}

/**
 * Larger v2.0-shaped analysis: four use cases with varied readiness and value
 * inputs so the v2.2 quadrant assignment exercises Champion + non-Champion
 * paths in the same run. Steps 0/5/6 are fully populated; Step 7 is omitted
 * on purpose so the recovery branch builds it from Step 5 + Step 6 (mirrors
 * how a v2.0 export from the AI usually arrives).
 */
function makeFullV20Analysis(): any {
  const useCases = [
    {
      id: "UC-A",
      name: "Automated Quote Generation",
      theme: "Revenue",
      hours: 5000,
      readiness: 9,
    },
    {
      id: "UC-B",
      name: "Customer Churn Prediction",
      theme: "Revenue",
      hours: 3500,
      readiness: 8,
    },
    {
      id: "UC-C",
      name: "Vendor Invoice Triage",
      theme: "Cost",
      hours: 1500,
      readiness: 6,
    },
    {
      id: "UC-D",
      name: "Knowledge Base Summarization",
      theme: "Productivity",
      hours: 2200,
      readiness: 7,
    },
  ];

  return {
    steps: [
      {
        step: 0,
        title: "Company Profile",
        data: [
          {
            "Annual Revenue ($)": 250_000_000,
            "Total Employees": 1200,
          },
        ],
      },
      {
        step: 5,
        title: "Benefits Quantification",
        data: useCases.map((uc) => ({
          ID: uc.id,
          "Use Case": uc.name,
          "Strategic Theme": uc.theme,
          "Cost Formula Labels": {
            components: [
              { label: "Hours Saved", value: uc.hours },
              { label: "Loaded Hourly Rate", value: 110 },
              { label: "Benefits Loading", value: 1.3 },
              { label: "Adoption Rate", value: 0.85 },
              { label: "Data Maturity", value: 0.8 },
            ],
          },
          "Probability of Success": 0.7,
        })),
      },
      {
        step: 6,
        title: "Readiness & Token Modeling",
        data: useCases.map((uc) => ({
          ID: uc.id,
          "Use Case": uc.name,
          "Organizational Capacity": uc.readiness,
          "Data Availability & Quality": uc.readiness,
          "Technical Infrastructure": uc.readiness,
          "Governance": uc.readiness,
          "Time-to-Value (months)": 6,
          "Runs/Month": 1500,
          "Input Tokens/Run": 900,
          "Output Tokens/Run": 700,
        })),
      },
    ],
    vrm: { schemaVersion: "2.0" },
  };
}

/**
 * v2.0-shaped analysis whose Step 6 is omitted entirely so the synthesis
 * branch in `postProcessAnalysis` has to materialize Step 6 records from
 * Step 5. The test then asserts the v2.2 metadata block is still built end
 * to end, even though the readiness side of the matrix was never directly
 * supplied by the source.
 */
function makeSynthesizedFromStep5Analysis(): any {
  return {
    steps: [
      {
        step: 0,
        title: "Company Profile",
        data: [{ "Annual Revenue ($)": 75_000_000, "Total Employees": 400 }],
      },
      {
        step: 5,
        title: "Benefits Quantification",
        data: [
          {
            ID: "UC-1",
            "Use Case": "Contract Clause Extraction",
            "Strategic Theme": "Risk",
            "Cost Formula Labels": {
              components: [
                { label: "Hours Saved", value: 2400 },
                { label: "Loaded Hourly Rate", value: 95 },
                { label: "Benefits Loading", value: 1.3 },
                { label: "Adoption Rate", value: 0.8 },
                { label: "Data Maturity", value: 0.7 },
              ],
            },
            "Probability of Success": 0.7,
          },
          {
            ID: "UC-2",
            "Use Case": "Helpdesk Ticket Routing",
            "Strategic Theme": "Cost",
            "Cost Formula Labels": {
              components: [
                { label: "Hours Saved", value: 1800 },
                { label: "Loaded Hourly Rate", value: 80 },
                { label: "Benefits Loading", value: 1.3 },
                { label: "Adoption Rate", value: 0.85 },
                { label: "Data Maturity", value: 0.75 },
              ],
            },
            "Probability of Success": 0.7,
          },
        ],
      },
      // Step 6 intentionally omitted — synthesis branch must run.
    ],
    vrm: { schemaVersion: "2.0" },
  };
}

/**
 * Extract the v2.2 metadata block from a post-processed analysis with strong
 * type narrowing — every field this codebase relies on (schemaVersion, the
 * diagnostic envelope, and the flat fields the UI keys off) is asserted in
 * one place.
 */
function expectV22Envelope(result: any) {
  expect(result).toBeDefined();
  expect(result.vrm).toBeDefined();
  expect(result.vrm.schemaVersion).toBe(VRM_SCHEMA_VERSION);
  expect(result.vrm.schemaVersion).toBe("2.2");

  const diagnostic = result.vrm.diagnostic;
  expect(diagnostic).not.toBeNull();
  expect(diagnostic).toBeDefined();
  expect(diagnostic.schemaVersion).toBe("2.2");
  expect(typeof diagnostic.totalUseCases).toBe("number");
  expect(typeof diagnostic.championCount).toBe("number");
  expect(typeof diagnostic.prototypingCandidatesPct).toBe("number");
  expect(diagnostic.prototypingCandidatesPct).toBeGreaterThanOrEqual(0);
  expect(diagnostic.prototypingCandidatesPct).toBeLessThanOrEqual(100);
  expect(Array.isArray(diagnostic.warnings)).toBe(true);

  return diagnostic;
}

// ---------------------------------------------------------------------------
// Baseline fixtures
// ---------------------------------------------------------------------------
describe("postProcessAnalysis — v2.2 contract", () => {
  it("upgrades a minimal v2.0 fixture (single use case) to a populated v2.2 envelope", () => {
    const result = postProcessAnalysis(makeMinimalV20Analysis());
    const diagnostic = expectV22Envelope(result);

    expect(diagnostic.totalUseCases).toBe(1);
    // championCount + quickWinCount + strategicCount + foundationCount must
    // account for every use case in the portfolio.
    const accounted =
      diagnostic.championCount +
      diagnostic.quickWinCount +
      diagnostic.strategicCount +
      diagnostic.foundationCount;
    expect(accounted).toBe(diagnostic.totalUseCases);

    // Step 6 must carry the v2.2 hard knock-out fields after migration so the
    // staleness check downstream will treat the report as fresh.
    const step6 = result.steps.find((s: any) => s.step === 6);
    expect(step6).toBeDefined();
    expect(step6.data[0]).toHaveProperty("Legally Prohibited");
    expect(step6.data[0]).toHaveProperty("Technically Infeasible");
  });

  it("upgrades a full v2.0 fixture (multiple use cases) to a populated v2.2 envelope", () => {
    const result = postProcessAnalysis(makeFullV20Analysis());
    const diagnostic = expectV22Envelope(result);

    expect(diagnostic.totalUseCases).toBe(4);
    const accounted =
      diagnostic.championCount +
      diagnostic.quickWinCount +
      diagnostic.strategicCount +
      diagnostic.foundationCount;
    expect(accounted).toBe(diagnostic.totalUseCases);

    // Step 7 was omitted in the source — recovery must have built it.
    const step7 = result.steps.find((s: any) => s.step === 7);
    expect(step7).toBeDefined();
    expect(Array.isArray(step7.data)).toBe(true);
    expect(step7.data).toHaveLength(4);
    for (const row of step7.data) {
      expect(typeof row["Priority Tier"]).toBe("string");
      expect(typeof row["Quadrant v2.2"]).toBe("string");
    }

    // Executive dashboard surfaces should match the totals the rest of the
    // app reads — sanity-check they exist and are non-negative.
    expect(result.executiveDashboard).toBeDefined();
    expect(result.executiveDashboard.totalAnnualValue).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.executiveDashboard.topUseCases)).toBe(true);
  });

  it("synthesizes Step 6 from Step 5 and still produces a populated v2.2 envelope", () => {
    const fixture = makeSynthesizedFromStep5Analysis();
    expect(fixture.steps.find((s: any) => s.step === 6)).toBeUndefined();

    const result = postProcessAnalysis(fixture);
    const diagnostic = expectV22Envelope(result);

    // Step 6 must now exist with one record per Step 5 use case, carrying
    // the readiness inputs the diagnostic computation depends on.
    const step6 = result.steps.find((s: any) => s.step === 6);
    expect(step6).toBeDefined();
    expect(Array.isArray(step6.data)).toBe(true);
    expect(step6.data).toHaveLength(2);
    for (const row of step6.data) {
      expect(typeof row["Readiness Score"]).toBe("number");
      expect(typeof row["Organizational Capacity"]).toBe("number");
      expect(typeof row["Data Availability & Quality"]).toBe("number");
    }

    expect(diagnostic.totalUseCases).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Regression: synthesized Step 6 records must carry the v2.2 hard knock-out
  // fields so the staleness checker (`missing-step6-knockout-fields`) does
  // not re-flag synthesized reports on every backfill run. Without this
  // guarantee the admin migration tool re-processes and re-persists the same
  // set of synthesized reports forever, polluting the "updated vs skipped"
  // counts and masking real staleness signals.
  // -------------------------------------------------------------------------
  it("attaches v2.2 hard knock-out fields to synthesized Step 6 records and reports the result as not stale", () => {
    const fixture = makeSynthesizedFromStep5Analysis();
    const result = postProcessAnalysis(fixture);

    const step6 = result.steps.find((s: any) => s.step === 6);
    expect(step6).toBeDefined();
    expect(Array.isArray(step6.data)).toBe(true);
    expect(step6.data.length).toBeGreaterThan(0);

    // Every synthesized record — not just the first — must carry both KO
    // fields, defaulting to false the same way the non-synthesized path does
    // at the end of the readiness loop.
    for (const row of step6.data) {
      expect(row).toHaveProperty("Legally Prohibited");
      expect(row).toHaveProperty("Technically Infeasible");
      expect(row["Legally Prohibited"]).toBe(false);
      expect(row["Technically Infeasible"]).toBe(false);
    }

    // The post-processed analysis must be considered fresh by the staleness
    // checker so a re-run of the admin migration would skip it with reason
    // `already-v2.1` rather than re-persisting the same record forever.
    const staleness = evaluateReportStaleness(result);
    expect(staleness.stale).toBe(false);
    expect(staleness.reasons).toEqual([]);
    expect(staleness.hasStep6KOFields).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression: the v2.2 metadata block must be built even when no use case
// qualifies as a champion. This is the path that exercised the original
// `portfolioDiagnosticV22 is not defined` scoping bug — when the variable
// was declared inside an inner conditional, code paths that didn't promote
// any use case into the champion quadrant would still try to reference it
// while building the vrm metadata block at the end of postprocessing.
// ---------------------------------------------------------------------------
describe("postProcessAnalysis — no-champion regression", () => {
  /**
   * v2.0-shaped fixture where every use case is hard-floor-failed via the
   * `Legally Prohibited` flag, guaranteeing zero champions in the resulting
   * portfolio while still exercising the full v2.2 classification + diagnostic
   * pipeline (quadrant assignment, diagnostic computation, vrm envelope).
   */
  function makeNoChampionAnalysis(): any {
    const ids = ["UC-NC-1", "UC-NC-2", "UC-NC-3"];
    return {
      steps: [
        {
          step: 0,
          title: "Company Profile",
          data: [{ "Annual Revenue ($)": 40_000_000, "Total Employees": 180 }],
        },
        {
          step: 5,
          title: "Benefits Quantification",
          data: ids.map((id, i) => ({
            ID: id,
            "Use Case": `Restricted Workflow ${i + 1}`,
            "Cost Formula Labels": {
              components: [
                { label: "Hours Saved", value: 800 + i * 100 },
                { label: "Loaded Hourly Rate", value: 90 },
                { label: "Benefits Loading", value: 1.3 },
                { label: "Adoption Rate", value: 0.5 },
                { label: "Data Maturity", value: 0.5 },
              ],
            },
            "Probability of Success": 0.5,
          })),
        },
        {
          step: 6,
          title: "Readiness & Token Modeling",
          data: ids.map((id, i) => ({
            ID: id,
            "Use Case": `Restricted Workflow ${i + 1}`,
            // Modest readiness inputs — irrelevant once `Legally Prohibited`
            // hard-fails the use case, but still asserted so the recovery
            // branch doesn't kick in.
            "Organizational Capacity": 5,
            "Data Availability & Quality": 5,
            "Technical Infrastructure": 5,
            "Governance": 5,
            "Time-to-Value (months)": 9,
            "Runs/Month": 500,
            "Input Tokens/Run": 800,
            "Output Tokens/Run": 800,
            // Hard knock-out: every use case is legally prohibited, so none
            // can land in the Champion quadrant.
            "Legally Prohibited": true,
            "Technically Infeasible": false,
          })),
        },
      ],
      vrm: { schemaVersion: "2.0" },
    };
  }

  it("builds the v2.2 vrm metadata block when the portfolio has zero champions", () => {
    // The function must not throw — this is exactly the path that produced
    // `portfolioDiagnosticV22 is not defined` before Task #8.
    const result = postProcessAnalysis(makeNoChampionAnalysis());
    const diagnostic = expectV22Envelope(result);

    expect(diagnostic.totalUseCases).toBe(3);
    expect(diagnostic.championCount).toBe(0);
    expect(diagnostic.leadChampionCount).toBe(0);

    // Hard-floor failures should be reflected in the diagnostic.
    expect(diagnostic.foundationCount).toBe(3);
    expect(diagnostic.foundationHardCount).toBe(3);
    expect(diagnostic.hardFloorFailureRate).toBeCloseTo(1.0, 5);

    // Even with zero champions the prototyping percentage must be a valid
    // number (not NaN) so the UI can render it.
    expect(Number.isFinite(diagnostic.prototypingCandidatesPct)).toBe(true);
    expect(diagnostic.prototypingCandidatesPct).toBe(0);
  });
});
