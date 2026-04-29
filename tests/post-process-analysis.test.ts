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
import {
  BASELINE_WEIGHTS,
  DEFAULT_ENGAGEMENT_CONFIG,
  SECTOR_PRESETS,
  VRM_SCHEMA_VERSION,
  type EngagementConfig,
  type SectorPreset,
} from "../shared/vrm-v2";

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

  // -------------------------------------------------------------------------
  // Regression (Task #26): the human-readable `Risk Formula` audit string
  // must show the *capped* reduction percentage (8% per use case), never the
  // overstated value the AI proposed. When the cap binds, the original raw
  // percentage is preserved as a "(capped from X%)" annotation so reviewers
  // can still see what was overridden, and the printed math multiplies out
  // to the printed dollar value.
  // -------------------------------------------------------------------------
  it("displays the capped risk-reduction percentage (with `capped from` annotation) in the Step 5 Risk Formula audit text", () => {
    // Structured-labels path: AI claims a 20% risk reduction but the engine
    // caps at 8% per use case.
    const fixture = {
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
              ID: "UC-RISK",
              "Use Case": "Fraud Detection",
              "Strategic Theme": "Risk",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Risk Formula Labels": {
                components: [
                  { label: "Risk Reduction %", value: 0.20 },
                  { label: "Risk Exposure", value: 1_000_000 },
                  { label: "Realization Factor", value: 0.80 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Probability of Success": 0.7,
            },
          ],
        },
        {
          step: 6,
          title: "Readiness & Token Modeling",
          data: [
            {
              ID: "UC-RISK",
              "Use Case": "Fraud Detection",
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

    const result = postProcessAnalysis(fixture);
    const step5 = result.steps.find((s: any) => s.step === 5);
    const record = step5.data.find((r: any) => r.ID === "UC-RISK");
    const formulaText: string = record["Risk Formula"];

    // Audit text must lead with the *capped* 8%, not the raw 20%, and the
    // dollar number printed must equal 8% × $1M × 0.80 × 0.75 = $48,000.
    expect(formulaText.startsWith("8%")).toBe(true);
    expect(formulaText).toContain("(capped from 20%)");
    // 8% × $1M × 0.80 × 0.75 = $48K; the dollar result must reflect the cap,
    // not the AI's overstated 20% (which would imply $120K).
    expect(formulaText).toContain("$48K");
    expect(formulaText).not.toContain("$120K");
    // The overstated raw percentage must not appear as the leading factor.
    expect(formulaText).not.toMatch(/^20%/);
  });

  it("displays the capped risk-reduction percentage in the legacy formula-string path (no Risk Formula Labels)", () => {
    // Fallback path: no `Risk Formula Labels`, only a free-text `Risk Formula`
    // string. recalculateRiskBenefit must parse the inputs and emit the same
    // capped audit text + annotation.
    const fixture = {
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
              ID: "UC-RISK-LEGACY",
              "Use Case": "Legacy Risk String",
              "Strategic Theme": "Risk",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              // No Risk Formula Labels → recalculateRiskBenefit handles it.
              "Risk Formula": "20% × $1,000,000 × 0.80 × 0.75 = $120,000",
              "Probability of Success": 0.7,
            },
          ],
        },
        {
          step: 6,
          title: "Readiness & Token Modeling",
          data: [
            {
              ID: "UC-RISK-LEGACY",
              "Use Case": "Legacy Risk String",
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

    const result = postProcessAnalysis(fixture);
    const step5 = result.steps.find((s: any) => s.step === 5);
    const record = step5.data.find((r: any) => r.ID === "UC-RISK-LEGACY");
    const formulaText: string = record["Risk Formula"];

    expect(formulaText.startsWith("8%")).toBe(true);
    expect(formulaText).toContain("(capped from 20%)");
    expect(formulaText).toContain("$48K");
    expect(formulaText).not.toMatch(/^20%/);
  });

  it("displays the (uncapped) 5% reduction in the derived-from-Step-3 risk branch", () => {
    // Derived-from-Step-3 path: Step 5 has no risk inputs at all, so the
    // initial risk calculation returns $0. Step 4 links the use case to a
    // Step 3 friction whose Primary Driver Impact mentions "risk", which
    // triggers the derivation branch with the hardcoded 5% reduction (below
    // the 8% cap). The audit text must start with "5%" and emit no
    // "capped from" annotation, locking in current behavior so any future
    // change to the derivation default surfaces as a test failure.
    const fixture = {
      steps: [
        {
          step: 0,
          title: "Company Profile",
          data: [{ "Annual Revenue ($)": 50_000_000, "Total Employees": 250 }],
        },
        {
          step: 3,
          title: "Friction Inventory",
          data: [
            {
              "Friction Point": "Manual fraud review backlog",
              "Primary Driver Impact": "Risk reduction",
              "Annual Hours": 2000,
              "Hourly Rate": 120,
            },
          ],
        },
        {
          step: 4,
          title: "Use Case Mapping",
          data: [
            {
              ID: "UC-RISK-DERIVED",
              "Use Case": "Risk Derivation",
              "Target Friction": "Manual fraud review backlog",
            },
          ],
        },
        {
          step: 5,
          title: "Benefits Quantification",
          data: [
            {
              ID: "UC-RISK-DERIVED",
              "Use Case": "Risk Derivation",
              "Strategic Theme": "Risk",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              // No Risk Formula and no Risk Formula Labels → upstream risk
              // is $0 → derivation branch fires.
              "Probability of Success": 0.7,
            },
          ],
        },
        {
          step: 6,
          title: "Readiness & Token Modeling",
          data: [
            {
              ID: "UC-RISK-DERIVED",
              "Use Case": "Risk Derivation",
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

    const result = postProcessAnalysis(fixture);
    const step5 = result.steps.find((s: any) => s.step === 5);
    const record = step5.data.find((r: any) => r.ID === "UC-RISK-DERIVED");
    const formulaText: string = record["Risk Formula"];

    expect(formulaText.startsWith("5%")).toBe(true);
    expect(formulaText).not.toContain("capped from");
    expect(formulaText).toContain("[derived from");
  });

  it("does not annotate the Risk Formula audit text when the cap does not bind", () => {
    // Structured-labels path: AI claims a 5% risk reduction (below the 8%
    // per-use-case cap) so no annotation should be emitted.
    const fixture = {
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
              ID: "UC-RISK-LOW",
              "Use Case": "Compliance Monitoring",
              "Strategic Theme": "Risk",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Risk Formula Labels": {
                components: [
                  { label: "Risk Reduction %", value: 0.05 },
                  { label: "Risk Exposure", value: 2_000_000 },
                  { label: "Realization Factor", value: 0.80 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Probability of Success": 0.7,
            },
          ],
        },
        {
          step: 6,
          title: "Readiness & Token Modeling",
          data: [
            {
              ID: "UC-RISK-LOW",
              "Use Case": "Compliance Monitoring",
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

    const result = postProcessAnalysis(fixture);
    const step5 = result.steps.find((s: any) => s.step === 5);
    const record = step5.data.find((r: any) => r.ID === "UC-RISK-LOW");
    const formulaText: string = record["Risk Formula"];

    expect(formulaText.startsWith("5%")).toBe(true);
    expect(formulaText).not.toContain("capped from");
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

// ---------------------------------------------------------------------------
// Sector preset + engagement config coverage
//
// `vrm.sectorPreset` re-weights each use case's component scores via
// `computeWeightedReadiness`/`getWeightsForPreset`, and `engagementConfig`
// shifts the v2.1 quadrant cutoffs and the soft-blocker thresholds picked up
// by `evaluateFloors`. The baseline v2.2 contract tests above only exercise
// the default `baseline` preset with the default config, so a regression in
// `computeWeightedReadiness`, `assignClassificationsV22`, or any
// `SECTOR_PRESETS` row would silently shift Champion/Foundation calls for
// non-default sector reports without tripping any test.
//
// `regulated` here is the preset that maps to financial-services and
// healthcare engagements per the SECTOR_PRESETS description.
// ---------------------------------------------------------------------------

/**
 * Sector-flavoured fixture: three use cases whose Step 6 component scores
 * are intentionally non-uniform so the weighted readiness produced by each
 * preset diverges. UC-1 leans on Governance + Org Capacity (favors the
 * regulated / heavy-regulated presets), UC-2 leans on Org Capacity + Tech
 * Infrastructure (favors the internal-productivity preset), UC-3 is a
 * balanced control. Time-to-pilot is varied so the engagement-config test
 * can exercise `maxTimeToPilotWeeks` directly.
 */
function makeSectorFixture(opts: {
  sectorPreset?: SectorPreset;
  engagementConfig?: Partial<EngagementConfig>;
} = {}): any {
  const useCases = [
    { id: "UC-1", name: "Underwriting Risk Triage", theme: "Risk", hours: 6000, oc: 8, dq: 8, ti: 4, gov: 10, ttp: 12 },
    { id: "UC-2", name: "Customer Onboarding Automation", theme: "Cost", hours: 4000, oc: 10, dq: 5, ti: 8, gov: 4, ttp: 6 },
    { id: "UC-3", name: "Regulatory Reporting Assistant", theme: "Compliance", hours: 3500, oc: 7, dq: 7, ti: 6, gov: 8, ttp: 14 },
  ];

  const root: any = {
    steps: [
      {
        step: 0,
        title: "Company Profile",
        data: [{ "Annual Revenue ($)": 250_000_000, "Total Employees": 1500 }],
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
          "Organizational Capacity": uc.oc,
          "Data Availability & Quality": uc.dq,
          "Technical Infrastructure": uc.ti,
          "Governance": uc.gov,
          "Time-to-Value (months)": 6,
          "Time-to-Pilot (weeks)": uc.ttp,
          "Runs/Month": 1500,
          "Input Tokens/Run": 900,
          "Output Tokens/Run": 700,
        })),
      },
    ],
    vrm: { schemaVersion: "2.0" },
  };

  if (opts.sectorPreset) root.vrm.sectorPreset = opts.sectorPreset;
  if (opts.engagementConfig) root.engagementConfig = opts.engagementConfig;
  return root;
}

describe("postProcessAnalysis — sector preset coverage", () => {
  // Two non-default presets cover the two distinct re-weighting families:
  //   - `regulated` raises Governance, lowers Tech Infrastructure
  //     (financial-services / healthcare engagements per SECTOR_PRESETS).
  //   - `internal_productivity` raises Org Capacity / Tech Infrastructure,
  //     lowers Governance / Data Readiness.
  // We additionally include `heavy_regulated` because it pushes Governance
  // even further (0.30) and is the most likely preset to silently mis-score
  // a Champion-vs-Foundation call if `getWeightsForPreset` ever regresses.
  const presets: SectorPreset[] = ["regulated", "heavy_regulated", "internal_productivity"];

  for (const preset of presets) {
    it(`emits the '${preset}' preset's weights and label in the v2.2 vrm block`, () => {
      const result = postProcessAnalysis(makeSectorFixture({ sectorPreset: preset }));

      expect(result.vrm.schemaVersion).toBe(VRM_SCHEMA_VERSION);
      expect(result.vrm.sectorPreset).toBe(preset);
      expect(result.vrm.sectorPresetLabel).toBe(SECTOR_PRESETS[preset].label);
      // Active weights must come from the chosen preset, not the baseline
      // table. baselineWeights is also surfaced for the UI's diff view.
      expect(result.vrm.weights).toEqual(SECTOR_PRESETS[preset].weights);
      expect(result.vrm.baselineWeights).toEqual(BASELINE_WEIGHTS);
      // No engagement override on this fixture — resolved config matches
      // the deep-copied defaults exactly.
      expect(result.vrm.engagementConfig).toEqual(DEFAULT_ENGAGEMENT_CONFIG);
    });
  }

  it("re-weights Step 6 readiness when the sector preset shifts component weights", () => {
    // Same component scores, four different presets. Weighted readiness must
    // diverge in the directions each preset's weight table predicts —
    // anything else means `computeWeightedReadiness` is no longer wired to
    // the active preset.
    const baseline = postProcessAnalysis(makeSectorFixture());
    const regulated = postProcessAnalysis(makeSectorFixture({ sectorPreset: "regulated" }));
    const heavy = postProcessAnalysis(makeSectorFixture({ sectorPreset: "heavy_regulated" }));
    const internalProd = postProcessAnalysis(makeSectorFixture({ sectorPreset: "internal_productivity" }));

    const readinessByPreset = (r: any): Record<string, number> => {
      const step6 = r.steps.find((s: any) => s.step === 6).data;
      return Object.fromEntries(step6.map((row: any) => [row.ID, row["Readiness Score"]]));
    };

    const baselineR = readinessByPreset(baseline);
    const regulatedR = readinessByPreset(regulated);
    const heavyR = readinessByPreset(heavy);
    const internalR = readinessByPreset(internalProd);

    // UC-1 (gov=10, techInfra=4): both regulated presets raise governance and
    // shrink techInfra, so weighted readiness must rise; internal_productivity
    // does the opposite.
    expect(regulatedR["UC-1"]).toBeGreaterThan(baselineR["UC-1"]);
    expect(heavyR["UC-1"]).toBeGreaterThan(regulatedR["UC-1"]);
    expect(internalR["UC-1"]).toBeLessThan(baselineR["UC-1"]);

    // UC-2 (orgCap=10, techInfra=8, gov=4): internal_productivity boosts
    // orgCap (0.40) and techInfra (0.20) so readiness rises; heavy_regulated
    // crushes techInfra (0.05) and inflates the gov=4 weight, so readiness
    // falls.
    expect(internalR["UC-2"]).toBeGreaterThan(baselineR["UC-2"]);
    expect(heavyR["UC-2"]).toBeLessThan(baselineR["UC-2"]);

    // Sanity: with default config + log-norm value-fallback (no Step 4
    // friction), the v2.2 envelope is still well-formed for every preset.
    for (const r of [baseline, regulated, heavy, internalProd]) {
      expect(r.vrm.diagnostic).toBeDefined();
      expect(r.vrm.diagnostic.totalUseCases).toBe(3);
    }
  });
});

describe("postProcessAnalysis — custom engagement config", () => {
  it("propagates a custom engagementConfig and shifts quadrant placements", () => {
    const sectorPreset: SectorPreset = "regulated";

    const defaultRun = postProcessAnalysis(makeSectorFixture({ sectorPreset }));

    // Custom config: lower the v2.1 champion cutoff so mid-range readiness
    // earns Champion (the default 7.5 cutoff sends them to Foundation), and
    // tighten the pilot window so a use case with 12-week time-to-pilot now
    // emits a soft blocker that the default 16-week ceiling allows.
    const overrides: Partial<EngagementConfig> = {
      championMin: 5.5,
      quickStrategicMin: 4.0,
      maxTimeToPilotWeeks: 8,
    };
    const customRun = postProcessAnalysis(
      makeSectorFixture({ sectorPreset, engagementConfig: overrides }),
    );

    // The vrm block must reflect the resolved config. Defaults remain on
    // any field the caller didn't override (`valueFloor` here).
    expect(defaultRun.vrm.engagementConfig).toEqual(DEFAULT_ENGAGEMENT_CONFIG);
    expect(customRun.vrm.engagementConfig.championMin).toBe(5.5);
    expect(customRun.vrm.engagementConfig.quickStrategicMin).toBe(4.0);
    expect(customRun.vrm.engagementConfig.maxTimeToPilotWeeks).toBe(8);
    expect(customRun.vrm.engagementConfig.valueFloor).toEqual(
      DEFAULT_ENGAGEMENT_CONFIG.valueFloor,
    );
    // Threshold mirror surfaced for back-compat readers must follow the
    // overrides as well.
    expect(customRun.vrm.quadrantThresholds.championMin).toBe(5.5);
    expect(customRun.vrm.quadrantThresholds.quickStrategicMin).toBe(4.0);
    expect(customRun.vrm.quadrantThresholds.maxTimeToPilotWeeks).toBe(8);

    // Pull the v2.1 quadrant column — that's the column wired to
    // `championMin` / `quickStrategicMin` (the v2.2 active geometry uses
    // the constants 5.5 / 7.5 by design and is intentionally insensitive to
    // these overrides).
    const quadrantsV21 = (r: any): Record<string, string> => {
      const step7 = r.steps.find((s: any) => s.step === 7).data;
      return Object.fromEntries(
        step7.map((row: any) => [row.ID, row["Quadrant v2.1"]]),
      );
    };

    const defaultQ = quadrantsV21(defaultRun);
    const customQ = quadrantsV21(customRun);

    // With championMin=7.5 (default) and v=5.5 across the portfolio, no use
    // case can land in the v2.1 Champion quadrant — the layer-3 safety net
    // promotes the top two by composite to `conditional_champion` and the
    // remainder fall to `foundation`.
    const defaultQuadrants = Object.values(defaultQ);
    expect(defaultQuadrants).not.toContain("champion");
    expect(defaultQuadrants).toContain("conditional_champion");

    // With championMin=5.5 the same use cases (v=5.5, r≥5.5) clear the
    // v2.1 Champion threshold and must now classify as `champion`.
    const customQuadrants = Object.values(customQ);
    expect(customQuadrants).toContain("champion");
    expect(customQuadrants).not.toContain("conditional_champion");

    // At least one use case must have actually moved between the two runs —
    // this is the regression signal the task is guarding against.
    const movedIds = Object.keys(defaultQ).filter(
      (id) => defaultQ[id] !== customQ[id],
    );
    expect(movedIds.length).toBeGreaterThan(0);

    // The tightened maxTimeToPilotWeeks must surface as a soft blocker on
    // UC-1 (time-to-pilot 12 weeks > custom 8 cap, but ≤ default 16 cap).
    const softBlockersFor = (r: any, id: string): string[] => {
      const row = r.steps
        .find((s: any) => s.step === 7)
        .data.find((x: any) => x.ID === id);
      return (row?.["Soft Blockers"] ?? []) as string[];
    };
    const defaultSoft = softBlockersFor(defaultRun, "UC-1");
    const customSoft = softBlockersFor(customRun, "UC-1");
    expect(defaultSoft.some((b) => b.includes("Time-to-pilot"))).toBe(false);
    expect(
      customSoft.some((b) =>
        b.includes("Time-to-pilot 12 weeks exceeds 8-week target"),
      ),
    ).toBe(true);
  });
});
