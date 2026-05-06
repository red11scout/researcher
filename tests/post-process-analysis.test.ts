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

  // -------------------------------------------------------------------------
  // Regression (Task #36): the human-readable `Revenue Formula` audit string
  // must show the *capped* uplift percentage (5% per use case, the
  // `INPUT_BOUNDS.upliftPct.max` value), never the overstated value the AI
  // proposed. When the cap binds, the original raw percentage is preserved as
  // a "(capped from X%)" annotation so reviewers can still see what was
  // overridden, and the printed math multiplies out to the printed dollar
  // value. Mirrors the Task #26 risk-side coverage above.
  // -------------------------------------------------------------------------
  it("displays the capped revenue uplift percentage (with `capped from` annotation) in the Step 5 Revenue Formula audit text", () => {
    // Structured-labels path: AI claims an 8% uplift but the engine caps at
    // 5% per use case (INPUT_BOUNDS.upliftPct.max = 0.05).
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
              ID: "UC-REV",
              "Use Case": "Sales Acceleration",
              "Strategic Theme": "Revenue",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Revenue Formula Labels": {
                components: [
                  { label: "Uplift %", value: 0.08 },
                  { label: "Revenue at Risk", value: 10_000_000 },
                  { label: "Realization Factor", value: 0.95 },
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
              ID: "UC-REV",
              "Use Case": "Sales Acceleration",
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
    const record = step5.data.find((r: any) => r.ID === "UC-REV");
    const formulaText: string = record["Revenue Formula"];

    // Audit text must lead with the *capped* 5%, not the raw 8%, and the
    // dollar number printed must equal 5% × $10M × 0.95 × 0.75 = $356,250.
    expect(formulaText.startsWith("5%")).toBe(true);
    expect(formulaText).toContain("(capped from 8%)");
    expect(formulaText).toContain("$356K");
    // The overstated raw percentage must not be the leading factor.
    expect(formulaText).not.toMatch(/^8%/);
    // 8% × $10M × 0.95 × 0.75 = $570,000 — must NOT appear, because the
    // engine capped uplift to 5% before computing the dollar value.
    expect(formulaText).not.toContain("$570K");
  });

  it("displays the capped revenue uplift percentage in the legacy formula-string path (no Revenue Formula Labels)", () => {
    // Fallback path: no `Revenue Formula Labels`, only a free-text
    // `Revenue Formula` string. recalculateRevenueBenefit must parse the
    // inputs and emit the same capped audit text + annotation.
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
              ID: "UC-REV-LEGACY",
              "Use Case": "Legacy Revenue String",
              "Strategic Theme": "Revenue",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              // No Revenue Formula Labels → recalculateRevenueBenefit handles it.
              "Revenue Formula": "8% × $10,000,000 × 0.95 × 0.75 = $570,000",
              "Probability of Success": 0.7,
            },
          ],
        },
        {
          step: 6,
          title: "Readiness & Token Modeling",
          data: [
            {
              ID: "UC-REV-LEGACY",
              "Use Case": "Legacy Revenue String",
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
    const record = step5.data.find((r: any) => r.ID === "UC-REV-LEGACY");
    const formulaText: string = record["Revenue Formula"];

    expect(formulaText.startsWith("5%")).toBe(true);
    expect(formulaText).toContain("(capped from 8%)");
    expect(formulaText).toContain("$356K");
    expect(formulaText).not.toMatch(/^8%/);
    expect(formulaText).not.toContain("$570K");
  });

  it("does not annotate the Revenue Formula audit text when the cap does not bind", () => {
    // Structured-labels path: AI claims a 4% uplift (below the 5%
    // per-use-case cap) so no annotation should be emitted, and the printed
    // math must still multiply out to the printed dollar value.
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
              ID: "UC-REV-LOW",
              "Use Case": "Conservative Pipeline Lift",
              "Strategic Theme": "Revenue",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Revenue Formula Labels": {
                components: [
                  { label: "Uplift %", value: 0.04 },
                  { label: "Revenue at Risk", value: 10_000_000 },
                  { label: "Realization Factor", value: 0.95 },
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
              ID: "UC-REV-LOW",
              "Use Case": "Conservative Pipeline Lift",
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
    const record = step5.data.find((r: any) => r.ID === "UC-REV-LOW");
    const formulaText: string = record["Revenue Formula"];

    expect(formulaText.startsWith("4%")).toBe(true);
    expect(formulaText).not.toContain("capped from");
    // 4% × $10M × 0.95 × 0.75 = $285,000 — the printed dollar must reflect
    // the (uncapped) 4% input.
    expect(formulaText).toContain("$285K");
  });

  it("displays the (uncapped) hardcoded uplift in the derived-from-Step-3 revenue branch", () => {
    // Derived-from-Step-3 path: Step 5 has no revenue inputs at all, so the
    // initial revenue calculation returns $0. Step 4 links the use case to a
    // Step 3 friction whose Primary Driver Impact mentions "revenue", which
    // triggers the derivation branch with the hardcoded 0.3% uplift (well
    // below the 5% cap). The audit text must not emit a "capped from"
    // annotation, locking in current behavior so any future change to the
    // derivation default surfaces as a test failure (mirrors the matching
    // Task #26 test for the derived-from-Step-3 risk branch above).
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
              "Friction Point": "Slow lead-to-quote handoff",
              "Primary Driver Impact": "Revenue acceleration",
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
              ID: "UC-REV-DERIVED",
              "Use Case": "Revenue Derivation",
              "Target Friction": "Slow lead-to-quote handoff",
            },
          ],
        },
        {
          step: 5,
          title: "Benefits Quantification",
          data: [
            {
              ID: "UC-REV-DERIVED",
              "Use Case": "Revenue Derivation",
              "Strategic Theme": "Revenue",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              // No Revenue Formula and no Revenue Formula Labels → upstream
              // revenue is $0 → derivation branch fires.
              "Probability of Success": 0.7,
            },
          ],
        },
        {
          step: 6,
          title: "Readiness & Token Modeling",
          data: [
            {
              ID: "UC-REV-DERIVED",
              "Use Case": "Revenue Derivation",
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
    const record = step5.data.find((r: any) => r.ID === "UC-REV-DERIVED");
    const formulaText: string = record["Revenue Formula"];

    // The hardcoded derived uplift (0.003 = 0.3%) is now rendered with
    // adaptive precision as "0.3%" so the printed formula evaluates to the
    // printed result. The cap (5%) does not bind, so no "(capped from X%)"
    // annotation should appear.
    expect(formulaText).not.toContain("capped from");
    expect(formulaText).toContain("[derived from");
    // The leading factor must be the percentage (whole or fractional), not
    // a dollar amount — guarding against accidental reordering of inputs.
    expect(formulaText).toMatch(/^\d+(?:\.\d+)?%/);
    // Sub-1% uplifts must NEVER be silently collapsed to "0%" (regression
    // for the app-wide "0% × $X = $25M" mismatch reported in 2026-05).
    expect(formulaText.startsWith("0% ")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regression (Task #52): when the HyperFormula engine binds the per-use-case
// revenue-uplift cap (`INPUT_BOUNDS.upliftPct.max`), each revenue branch
// (`recalculateRevenueBenefit`, the structured-labels branch, the
// derived-from-Step-3 branch) must push a structured warning into its
// `warnings: string[]` array. The audit `formulaText` already annotates this
// inline (Task #36), but the warnings array is what the Validation Summary
// `details` carries — and what admin tooling can filter/aggregate to spot
// AI-generated reports leaning on overstated revenue uplift without scraping
// the audit text per row. Mirrors the Task #36 audit-text suite above.
// ---------------------------------------------------------------------------
describe("postProcessAnalysis — revenue-uplift cap warnings", () => {
  it("emits a per-use-case warning when the structured-labels revenue branch caps the uplift", () => {
    // Structured-labels path: AI claims an 8% uplift but the engine caps at
    // 5% per use case (INPUT_BOUNDS.upliftPct.max = 0.05). The audit text
    // already shows "(capped from 8%)" via Task #36; here we assert the
    // structured warning lands in the Validation Summary details too.
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
              ID: "UC-REV",
              "Use Case": "Sales Acceleration",
              "Strategic Theme": "Revenue",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Revenue Formula Labels": {
                components: [
                  { label: "Uplift %", value: 0.08 },
                  { label: "Revenue at Risk", value: 10_000_000 },
                  { label: "Realization Factor", value: 0.95 },
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
              ID: "UC-REV",
              "Use Case": "Sales Acceleration",
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
    const details: string[] = result.validationSummary.details;

    // The warning must include the use case ID (so admin filters can group
    // by UC) and use the same whole-number "from X% to Y%" phrasing the
    // audit string uses, so the two surfaces stay consistent.
    expect(details).toContain("UC-REV revenue uplift capped from 8% to 5%");
  });

  it("emits a per-use-case warning when the legacy formula-string revenue branch caps the uplift", () => {
    // Fallback path: no `Revenue Formula Labels`, only a free-text
    // `Revenue Formula` string. recalculateRevenueBenefit must still emit
    // the structured warning into the Validation Summary details, and must
    // include the record ID so admin tooling can attribute it.
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
              ID: "UC-REV-LEGACY",
              "Use Case": "Legacy Revenue String",
              "Strategic Theme": "Revenue",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Revenue Formula": "8% × $10,000,000 × 0.95 × 0.75 = $570,000",
              "Probability of Success": 0.7,
            },
          ],
        },
        {
          step: 6,
          title: "Readiness & Token Modeling",
          data: [
            {
              ID: "UC-REV-LEGACY",
              "Use Case": "Legacy Revenue String",
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
    const details: string[] = result.validationSummary.details;

    expect(details).toContain("UC-REV-LEGACY revenue uplift capped from 8% to 5%");
  });

  it("does NOT emit the cap warning when the structured-labels uplift stays under the cap", () => {
    // Negative control mirroring the Task #36 uncapped audit-text test:
    // a 4% uplift is below the 5% per-use-case cap, so no warning should
    // appear. Without this assertion a naive implementation that always
    // pushed the warning would still pass the capped tests above.
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
              ID: "UC-REV-LOW",
              "Use Case": "Conservative Pipeline Lift",
              "Strategic Theme": "Revenue",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Revenue Formula Labels": {
                components: [
                  { label: "Uplift %", value: 0.04 },
                  { label: "Revenue at Risk", value: 10_000_000 },
                  { label: "Realization Factor", value: 0.95 },
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
              ID: "UC-REV-LOW",
              "Use Case": "Conservative Pipeline Lift",
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
    const details: string[] = result.validationSummary.details;

    // No "revenue uplift capped" line should appear for any UC ID.
    expect(details.some((d) => /revenue uplift capped from/.test(d))).toBe(false);
  });

  it("does NOT emit the cap warning in the derived-from-Step-3 revenue branch (hardcoded 0.3% uplift stays under the cap)", () => {
    // Derived-from-Step-3 path: Step 5 has no revenue inputs at all, so the
    // initial revenue calculation returns $0 and the derivation branch
    // fires with the hardcoded 0.3% uplift (well below the 5% cap). No cap
    // warning should appear, but the existing "Revenue derived from Step 3
    // driver impact: ..." warning must still be emitted so the cap path is
    // independently observable from the derivation path. Mirrors the
    // matching Task #36 derived-branch audit-text test above.
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
              "Friction Point": "Slow lead-to-quote handoff",
              "Primary Driver Impact": "Revenue acceleration",
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
              ID: "UC-REV-DERIVED",
              "Use Case": "Revenue Derivation",
              "Target Friction": "Slow lead-to-quote handoff",
            },
          ],
        },
        {
          step: 5,
          title: "Benefits Quantification",
          data: [
            {
              ID: "UC-REV-DERIVED",
              "Use Case": "Revenue Derivation",
              "Strategic Theme": "Revenue",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 1000 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
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
              ID: "UC-REV-DERIVED",
              "Use Case": "Revenue Derivation",
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
    const details: string[] = result.validationSummary.details;

    // The derivation warning still appears (independent observability of
    // the two paths), but no cap warning should be present.
    expect(details.some((d) => /Revenue derived from Step 3 driver impact/.test(d))).toBe(true);
    expect(details.some((d) => /revenue uplift capped from/.test(d))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regression (Task #76): mirror of the Task #52 revenue-uplift cap-warnings
// suite for the risk side. When the HyperFormula engine binds the per-use-case
// risk-reduction cap (`INPUT_BOUNDS.riskReductionPct.max`), each risk branch
// (`recalculateRiskBenefit`, the structured-labels branch, the
// derived-from-Step-3 branch) must push a structured warning into its
// `warnings: string[]` array. The audit `formulaText` already annotates this
// inline (Task #26), but the warnings array is what the Validation Summary
// `details` carries — and what admin tooling can filter/aggregate to spot
// AI-generated reports leaning on overstated risk reduction without scraping
// the audit text per row.
// ---------------------------------------------------------------------------
describe("postProcessAnalysis — risk-reduction cap warnings", () => {
  it("emits a per-use-case warning when the structured-labels risk branch caps the reduction", () => {
    // Structured-labels path: AI claims a 20% risk reduction but the engine
    // caps at 8% per use case (INPUT_BOUNDS.riskReductionPct.max = 0.08).
    // The audit text already shows "(capped from 20%)" via Task #26; here we
    // assert the structured warning lands in the Validation Summary details too.
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
    const details: string[] = result.validationSummary.details;

    // The warning must include the use case ID (so admin filters can group
    // by UC) and use the same whole-number "from X% to Y%" phrasing the
    // audit string uses, so the two surfaces stay consistent.
    expect(details).toContain("UC-RISK risk reduction capped from 20% to 8%");
  });

  it("emits a per-use-case warning when the legacy formula-string risk branch caps the reduction", () => {
    // Fallback path: no `Risk Formula Labels`, only a free-text `Risk Formula`
    // string. recalculateRiskBenefit must still emit the structured warning
    // into the Validation Summary details, and must include the record ID so
    // admin tooling can attribute it.
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
    const details: string[] = result.validationSummary.details;

    expect(details).toContain("UC-RISK-LEGACY risk reduction capped from 20% to 8%");
  });

  it("does NOT emit the cap warning when the structured-labels reduction stays under the cap", () => {
    // Negative control mirroring the Task #26 uncapped audit-text test:
    // a 4% reduction is below the 8% per-use-case cap, so no warning should
    // appear. Without this assertion a naive implementation that always
    // pushed the warning would still pass the capped tests above.
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
              "Use Case": "Modest Risk Reduction",
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
                  { label: "Risk Reduction %", value: 0.04 },
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
              ID: "UC-RISK-LOW",
              "Use Case": "Modest Risk Reduction",
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
    const details: string[] = result.validationSummary.details;

    // No "risk reduction capped" line should appear for any UC ID.
    expect(details.some((d) => /risk reduction capped from/.test(d))).toBe(false);
  });

  it("does NOT emit the cap warning in the derived-from-Step-3 risk branch (hardcoded 5% reduction stays under the cap)", () => {
    // Derived-from-Step-3 path: Step 5 has no risk inputs at all, so the
    // initial risk calculation returns $0 and the derivation branch fires
    // with the hardcoded 5% reduction (well below the 8% cap). No cap
    // warning should appear, but the existing "Risk derived from Step 3
    // driver impact: ..." warning must still be emitted so the cap path is
    // independently observable from the derivation path.
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
              "Friction Point": "Manual compliance review",
              "Primary Driver Impact": "Risk mitigation",
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
              "Target Friction": "Manual compliance review",
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
    const details: string[] = result.validationSummary.details;

    // The derivation warning still appears (independent observability of
    // the two paths), but no cap warning should be present.
    expect(details.some((d) => /Risk derived from Step 3 driver impact/.test(d))).toBe(true);
    expect(details.some((d) => /risk reduction capped from/.test(d))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regression (Task #51): the end-of-pipeline Validation Summary count
// (`validationSummary.useCasesCapped`, also surfaced on the Report UI as
// "X use cases capped to meet CFO-credible limits") must include use cases
// whose individual revenue uplift or risk-reduction percentage was capped
// *inside* the HyperFormula engine (`hfCalculateRevenueBenefit` /
// `hfCalculateRiskBenefit`), not just use cases caught by the post-process
// portfolio-cap pass. Tasks #26 and #36 already make engine capping visible
// on the per-row audit text via the "(capped from X%)" annotation; this
// test pins the equivalent rolled-up signal so a portfolio that leans on
// AI-overstated inputs no longer reports "0 UCs capped".
// ---------------------------------------------------------------------------
describe("postProcessAnalysis — engine-cap counting in Validation Summary", () => {
  it("counts use cases whose revenue uplift OR risk reduction was capped inside the HyperFormula engine", () => {
    // Three use cases:
    //   UC-REV-CAP    — structured-labels REVENUE branch, AI claims 8%
    //                   uplift; engine caps at 5% (INPUT_BOUNDS.upliftPct.max).
    //   UC-RISK-CAP   — structured-labels RISK branch, AI claims 20% risk
    //                   reduction; engine caps at 8%
    //                   (INPUT_BOUNDS.riskReductionPct.max).
    //   UC-CLEAN      — neither cap binds (3% uplift, 4% risk reduction);
    //                   serves as a negative control so a naive
    //                   "everything counts" implementation would fail.
    // Annual revenue is large enough that the post-process portfolio cap
    // (advisory at 3% of revenue) does NOT bind — every "capped" signal in
    // the summary therefore comes purely from the engine path.
    const fixture = {
      steps: [
        {
          step: 0,
          title: "Company Profile",
          data: [
            { "Annual Revenue ($)": 500_000_000, "Total Employees": 1000 },
          ],
        },
        {
          step: 5,
          title: "Benefits Quantification",
          data: [
            {
              ID: "UC-REV-CAP",
              "Use Case": "Sales Acceleration",
              "Strategic Theme": "Revenue",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 800 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Revenue Formula Labels": {
                components: [
                  { label: "Uplift %", value: 0.08 },
                  { label: "Revenue at Risk", value: 5_000_000 },
                  { label: "Realization Factor", value: 0.95 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Probability of Success": 0.7,
            },
            {
              ID: "UC-RISK-CAP",
              "Use Case": "Fraud Detection",
              "Strategic Theme": "Risk",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 800 },
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
            {
              ID: "UC-CLEAN",
              "Use Case": "Routine Reporting",
              "Strategic Theme": "Cost",
              "Cost Formula Labels": {
                components: [
                  { label: "Hours Saved", value: 800 },
                  { label: "Loaded Hourly Rate", value: 100 },
                  { label: "Benefits Loading", value: 1.3 },
                  { label: "Adoption Rate", value: 0.8 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Revenue Formula Labels": {
                components: [
                  { label: "Uplift %", value: 0.03 },
                  { label: "Revenue at Risk", value: 2_000_000 },
                  { label: "Realization Factor", value: 0.95 },
                  { label: "Data Maturity", value: 0.75 },
                ],
              },
              "Risk Formula Labels": {
                components: [
                  { label: "Risk Reduction %", value: 0.04 },
                  { label: "Risk Exposure", value: 500_000 },
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
          data: ["UC-REV-CAP", "UC-RISK-CAP", "UC-CLEAN"].map((id) => ({
            ID: id,
            "Use Case": id,
            "Organizational Capacity": 7,
            "Data Availability & Quality": 7,
            "Technical Infrastructure": 7,
            "Governance": 7,
            "Time-to-Value (months)": 6,
            "Runs/Month": 1000,
            "Input Tokens/Run": 800,
            "Output Tokens/Run": 800,
          })),
        },
      ],
      vrm: { schemaVersion: "2.0" },
    };

    const result = postProcessAnalysis(fixture);

    // Sanity: the per-row audit text confirms the engine actually capped
    // both flagged use cases (this is the Task #26/#36 contract). If those
    // annotations stop appearing the test fixture has drifted from the
    // engine bounds and the count assertion below would be meaningless.
    const step5 = result.steps.find((s: any) => s.step === 5);
    const revRow = step5.data.find((r: any) => r.ID === "UC-REV-CAP");
    const riskRow = step5.data.find((r: any) => r.ID === "UC-RISK-CAP");
    const cleanRow = step5.data.find((r: any) => r.ID === "UC-CLEAN");
    expect(revRow["Revenue Formula"]).toContain("(capped from 8%)");
    expect(riskRow["Risk Formula"]).toContain("(capped from 20%)");
    expect(cleanRow["Revenue Formula"]).not.toContain("capped from");
    expect(cleanRow["Risk Formula"]).not.toContain("capped from");

    // The portfolio-cap pass must NOT have fired on this fixture — only
    // then can we attribute the entire `useCasesCapped` count to engine
    // capping. Total benefits are well under the 3%-of-revenue advisory
    // threshold ($15M against $500M revenue), so `portfolioScaleFactor`
    // stays at 1.0 and `validatedTotal` matches `originalTotal` exactly.
    expect(result.validationSummary.portfolioScaleFactor).toBe(1);
    expect(result.validationSummary.validatedTotal).toBe(
      result.validationSummary.originalTotal,
    );

    // The Validation Summary count must include both engine-capped use
    // cases — and only those. Before Task #51 this stayed at 0 even though
    // the engine capped both records, hiding the AI-overstated inputs from
    // the rolled-up summary admins use to spot-check a portfolio.
    expect(result.validationSummary.useCasesCapped).toBe(2);
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

// ---------------------------------------------------------------------------
// PORTFOLIO CASH-FLOW DAYS CAP — Task #107 regression (Constellation Energy).
// ---------------------------------------------------------------------------
//
// Constellation-Energy-shaped fixture: 10 use cases each booking ~9 days of
// working-capital improvement against the same $22.4B revenue base. Each UC
// is per-UC-credible (well below INPUT_BOUNDS.daysImprovement.max = 90), but
// the SUM is portfolio-implausible (~92 days = three months, all discounting
// the same DSO/DPO/inventory pool). The portfolio cash-flow guardrail must:
//   1. fire and emit a `PORTFOLIO_CASHFLOW_DAYS_CAP` integrity warning
//   2. scale every Step 5 row's `Cash Flow Benefit ($)` down
//   3. update each row's `Total Annual Value ($)` and `Expected Value ($)`
//      so per-UC totals stay consistent with the portfolio rollup
//   4. preserve audit reconciliation by appending the prorate term to the
//      `Cash Flow Formula` string
describe("PORTFOLIO CASH-FLOW DAYS CAP — Constellation Energy regression (Task #107)", () => {
  function makeConstellationLikeAnalysis(): any {
    const annualRevenue = 22_400_000_000; // $22.4B
    const useCases = Array.from({ length: 10 }, (_, i) => {
      const days = 9 + (i % 3); // 9, 10, 11 day mix
      return {
        ID: `UC-${i + 1}`,
        "Use Case": `Working Capital Initiative ${i + 1}`,
        "Cost Formula Labels": {
          components: [
            { label: "Hours Saved", value: 4000 },
            { label: "Loaded Hourly Rate", value: 120 },
            { label: "Benefits Loading", value: 1.35 },
            { label: "Adoption Rate", value: 0.9 },
            { label: "Data Maturity", value: 0.75 },
          ],
        },
        "Cash Flow Formula Labels": {
          components: [
            { label: "Annual Revenue", value: annualRevenue },
            { label: "Days Improved", value: days },
            { label: "Cost of Capital", value: 0.08 },
            { label: "Realization", value: 0.85 },
          ],
        },
        "Probability of Success": 0.75,
      };
    });
    return {
      steps: [
        {
          step: 0,
          title: "Company Profile",
          data: [{ "Annual Revenue ($)": annualRevenue, "Total Employees": 13_000 }],
        },
        { step: 5, title: "Benefits Quantification", data: useCases },
      ],
      vrm: { schemaVersion: "2.0" },
    };
  }

  function moneyToNumber(m: any): number {
    if (typeof m === "number") return m;
    if (typeof m !== "string") return 0;
    const t = m.trim().replace(/[$,]/g, "");
    const mult = t.endsWith("B") ? 1e9 : t.endsWith("M") ? 1e6 : t.endsWith("K") ? 1e3 : 1;
    const n = parseFloat(mult === 1 ? t : t.slice(0, -1));
    return isFinite(n) ? n * mult : 0;
  }

  it("guardrail fires, scales every UC's cash flow, and keeps per-UC totals consistent", () => {
    const result: any = postProcessAnalysis(makeConstellationLikeAnalysis());
    const step5 = result.steps.find((s: any) => s.step === 5).data as any[];
    expect(step5).toHaveLength(10);

    // Sum of per-UC scaled cash flow must be far below the unscaled portfolio
    // total (which would be ~$370M for ~92 days × $22.4B × 0.08 × 0.85). The
    // cap (30 days) clips it to roughly 30/92 ≈ 33% of that.
    const cashFlowSum = step5.reduce((s, r) => s + moneyToNumber(r["Cash Flow Benefit ($)"]), 0);
    expect(cashFlowSum).toBeGreaterThan(0);
    expect(cashFlowSum).toBeLessThan(150_000_000); // < $150M — portfolio is bounded

    // Every per-UC `Total Annual Value ($)` must reconcile with its 4 pillars
    // AFTER the cap (architect-found gap: row totals were stale before the fix).
    for (const r of step5) {
      const sum =
        moneyToNumber(r["Cost Benefit ($)"]) +
        moneyToNumber(r["Revenue Benefit ($)"]) +
        moneyToNumber(r["Cash Flow Benefit ($)"]) +
        moneyToNumber(r["Risk Benefit ($)"]);
      const printedTotal = moneyToNumber(r["Total Annual Value ($)"]);
      // Allow a small rounding tolerance from the abbreviated `formatMoney` form.
      const tolerance = Math.max(50_000, sum * 0.01);
      expect(Math.abs(printedTotal - sum)).toBeLessThanOrEqual(tolerance);
    }

    // Every cash-flow formula string must end with the appended prorate term so
    // the audit reconciliation rule (printed math == printed dollar) holds.
    for (const r of step5) {
      const formula = String(r["Cash Flow Formula"] || "");
      expect(formula).toContain("portfolio days cap");
    }

    // The PORTFOLIO_CASHFLOW_DAYS_CAP integrity warning must surface so the
    // Methodology Integrity panel renders it.
    const warnings: any[] = result?.vrm?.diagnostic?.warnings ?? [];
    const hit = warnings.find((w) => w?.code === "PORTFOLIO_CASHFLOW_DAYS_CAP");
    expect(hit).toBeTruthy();
    expect(String(hit.message)).toMatch(/portfolio cash-flow capped/i);
  });

  it("emits per-UC structured warnings (PORTFOLIO_CASHFLOW_DAYS_CAP_UC) for every affected UC", () => {
    const result: any = postProcessAnalysis(makeConstellationLikeAnalysis());
    const warnings: any[] = result?.vrm?.diagnostic?.warnings ?? [];
    const ucHits = warnings.filter((w) => w?.code === "PORTFOLIO_CASHFLOW_DAYS_CAP_UC");
    // 10 UCs all carry days; all should be prorated.
    expect(ucHits.length).toBe(10);
    for (const w of ucHits) {
      expect(String(w.message)).toMatch(/UC-\d+ cash flow prorated from .* to .* portfolio days cap/);
    }
  });

  it("clamps IRR > 200% and payback < 6 months for display, preserving raw values", () => {
    const result: any = postProcessAnalysis(makeConstellationLikeAnalysis());
    const m = result.multiYearProjection;
    expect(m).toBeTruthy();
    // Raw values are preserved as numbers.
    expect(typeof m.irrRaw === "number" || m.irrRaw === null).toBe(true);
    expect(typeof m.paybackMonthsRaw).toBe("number");
    // Display values are clamped strings when out of band.
    if (m.irrRaw !== null && m.irrRaw > 2.0) {
      expect(m.irr).toBe("200%+");
      const warnings: any[] = result?.vrm?.diagnostic?.warnings ?? [];
      expect(warnings.some((w) => w?.code === "IRR_DISPLAY_CLAMPED")).toBe(true);
    }
    if (m.paybackMonthsRaw >= 0 && m.paybackMonthsRaw < 6) {
      expect(m.paybackMonths).toBe("<6 mo");
      const warnings: any[] = result?.vrm?.diagnostic?.warnings ?? [];
      expect(warnings.some((w) => w?.code === "PAYBACK_DISPLAY_CLAMPED")).toBe(true);
    }
  });

  it("overrides the LLM executive-summary headline when it diverges > 10% from canonical", () => {
    const analysis: any = makeConstellationLikeAnalysis();
    // Inject an LLM headline whose dollar figure is wildly off from the
    // canonical (post-processed, post-cap) first-year value.
    analysis.executiveSummary = {
      headline:
        "Constellation Energy should execute 10 Critical-priority AI initiatives to capture $999M in first-year value.",
    };
    const result: any = postProcessAnalysis(analysis);
    const warnings: any[] = result?.vrm?.diagnostic?.warnings ?? [];
    const hit = warnings.find((w) => w?.code === "HEADLINE_RECONCILIATION_OVERRIDE");
    expect(hit).toBeTruthy();
    // Original LLM headline must be preserved verbatim.
    expect(result.executiveSummary.headlineLLMOriginal).toMatch(/\$999M/);
    // Overridden headline must reference canonical figure.
    expect(result.executiveSummary.headline).toMatch(/Canonical first-year value/);
  });

  it("does NOT override the headline when LLM figure is within 10% of canonical", () => {
    const analysis: any = makeConstellationLikeAnalysis();
    // First do a dry post-process to discover the canonical value, then
    // inject a matching headline and re-process.
    const dry: any = postProcessAnalysis(JSON.parse(JSON.stringify(analysis)));
    const canonical = dry.scenarioAnalysis.conservative.annualBenefit; // formatted "$X.XM"
    // Use the same formatted figure verbatim — it'll parse back to the same value.
    analysis.executiveSummary = {
      headline: `Capture ${canonical} in first-year value.`,
    };
    const result: any = postProcessAnalysis(analysis);
    const warnings: any[] = result?.vrm?.diagnostic?.warnings ?? [];
    const hit = warnings.find((w) => w?.code === "HEADLINE_RECONCILIATION_OVERRIDE");
    expect(hit).toBeUndefined();
    expect(result.executiveSummary.headlineLLMOriginal).toBeUndefined();
  });

  it("PORTFOLIO_CASHFLOW_SHARE warning fires when cash flow > 35% of total (advisory only)", () => {
    // Constellation-shaped portfolio: even AFTER the days cap prorates cash
    // flow, cash-flow share stays > 35% of total annual value because the
    // other pillars (cost/revenue/risk) are tiny. Gate (3) is advisory — it
    // emits a warning but does NOT scale further.
    const result: any = postProcessAnalysis(makeConstellationLikeAnalysis());
    const dash = result.executiveDashboard;
    const cfShare = dash.totalCashFlowBenefit / dash.totalAnnualValue;
    expect(cfShare).toBeGreaterThan(0.35);

    const warnings: any[] = result?.vrm?.diagnostic?.warnings ?? [];
    const hit = warnings.find((w) => w?.code === "PORTFOLIO_CASHFLOW_SHARE");
    expect(hit).toBeTruthy();
    expect(String(hit.message)).toMatch(/cash-flow share/i);
    expect(hit.severity).toBe("warning"); // advisory, not critical

    // Advisory-only: the cash-flow benefit equals the days-cap-prorated total
    // (no further scaling beyond what the days cap already applied).
    const step5 = result.steps.find((s: any) => s.step === 5).data as any[];
    const cashFlowSum = step5.reduce(
      (s, r) => s + moneyToNumber(r["Cash Flow Benefit ($)"]),
      0,
    );
    // Within abbreviated-formatMoney rounding tolerance.
    expect(Math.abs(cashFlowSum - dash.totalCashFlowBenefit)).toBeLessThan(
      Math.max(50_000, dash.totalCashFlowBenefit * 0.02),
    );
  });

  it("PORTFOLIO_CASHFLOW_SHARE does NOT fire when cash flow ≤ 35% of total", () => {
    // Balanced portfolio: 1 modest cash-flow UC + 2 hefty cost UCs so cash
    // flow stays well under 35% of the total.
    const annualRevenue = 500_000_000;
    const ucs = [
      {
        ID: "UC-1",
        "Use Case": "Working Capital",
        "Cost Formula Labels": {
          components: [
            { label: "Hours Saved", value: 500 },
            { label: "Loaded Hourly Rate", value: 100 },
          ],
        },
        "Cash Flow Formula Labels": {
          components: [
            { label: "Annual Revenue", value: annualRevenue },
            { label: "Days Improved", value: 5 },
            { label: "Cost of Capital", value: 0.08 },
          ],
        },
        "Probability of Success": 0.75,
      },
      {
        ID: "UC-2",
        "Use Case": "Cost Reduction A",
        "Cost Formula Labels": {
          components: [
            { label: "Hours Saved", value: 50_000 },
            { label: "Loaded Hourly Rate", value: 150 },
          ],
        },
        "Probability of Success": 0.75,
      },
      {
        ID: "UC-3",
        "Use Case": "Cost Reduction B",
        "Cost Formula Labels": {
          components: [
            { label: "Hours Saved", value: 50_000 },
            { label: "Loaded Hourly Rate", value: 150 },
          ],
        },
        "Probability of Success": 0.75,
      },
    ];
    const analysis: any = {
      steps: [
        {
          step: 0,
          title: "Company Profile",
          data: [{ "Annual Revenue ($)": annualRevenue, "Total Employees": 5_000 }],
        },
        { step: 5, title: "Benefits Quantification", data: ucs },
      ],
      vrm: { schemaVersion: "2.0" },
    };
    const result: any = postProcessAnalysis(analysis);
    const dash = result.executiveDashboard;
    const cfShare = dash.totalCashFlowBenefit / dash.totalAnnualValue;
    expect(cfShare).toBeLessThanOrEqual(0.35);
    const warnings: any[] = result?.vrm?.diagnostic?.warnings ?? [];
    expect(warnings.find((w) => w?.code === "PORTFOLIO_CASHFLOW_SHARE")).toBeUndefined();
  });

  it("realistic 3-UC portfolio (cumulative ≤ 30 days) does NOT trip the cap", () => {
    const annualRevenue = 500_000_000;
    const ucs = [12, 8, 5].map((days, i) => ({
      ID: `UC-${i + 1}`,
      "Use Case": `WC Initiative ${i + 1}`,
      "Cost Formula Labels": {
        components: [
          { label: "Hours Saved", value: 1000 },
          { label: "Loaded Hourly Rate", value: 100 },
        ],
      },
      "Cash Flow Formula Labels": {
        components: [
          { label: "Annual Revenue", value: annualRevenue },
          { label: "Days Improved", value: days },
          { label: "Cost of Capital", value: 0.08 },
        ],
      },
      "Probability of Success": 0.75,
    }));
    const analysis: any = {
      steps: [
        {
          step: 0,
          title: "Company Profile",
          data: [{ "Annual Revenue ($)": annualRevenue, "Total Employees": 2_500 }],
        },
        { step: 5, title: "Benefits Quantification", data: ucs },
      ],
      vrm: { schemaVersion: "2.0" },
    };
    const result: any = postProcessAnalysis(analysis);
    const warnings: any[] = result?.vrm?.diagnostic?.warnings ?? [];
    const hit = warnings.find((w) => w?.code === "PORTFOLIO_CASHFLOW_DAYS_CAP");
    expect(hit).toBeUndefined();
    const step5 = result.steps.find((s: any) => s.step === 5).data as any[];
    for (const r of step5) {
      expect(String(r["Cash Flow Formula"] || "")).not.toContain("portfolio days cap");
    }
  });
});
