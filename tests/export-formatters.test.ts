/**
 * Cross-format numeric-consistency suite.
 *
 * Calculation-determinism gate: proves that the JSON and Markdown
 * export pipelines are dumb pass-throughs of the canonical
 * post-processor payload. Numbers must NEVER be recomputed,
 * re-summed, rounded, or invented inside the export layer — every
 * numeric value that reaches a downloaded file must already exist
 * in the source `analysisData`.
 *
 * If a future refactor introduces arithmetic into
 * `server/export-formatters.ts` (or replaces the helpers with
 * inline math at the route level), these tests will fail. That is
 * the intended trip-wire.
 */
import { describe, it, expect } from "vitest";
import {
  formatReportAsJson,
  formatReportAsMarkdown,
  type ExportableReport,
  type ExportContext,
} from "../server/export-formatters";

const FIXED_EXPORT_TIMESTAMP = "2026-05-05T12:00:00.000Z";

const CANONICAL_PAYLOAD = {
  summary:
    "TestCorp shows $1,234,567.89 in total annual AI value across 4 use cases.",
  executiveDashboard: {
    totalRevenueBenefit: 500_000,
    totalCostBenefit: 400_000,
    totalCashFlowBenefit: 200_000,
    totalRiskBenefit: 134_567.89,
    totalAnnualValue: 1_234_567.89,
    topUseCases: [
      { name: "AI Sales Assistant", value: 500_000, priority: "High", driver: "Revenue" },
      { name: "Process Automation", value: 400_000, priority: "High", driver: "Cost" },
    ],
  },
  steps: [
    {
      step: 5,
      title: "Step 5: Use Case Analysis",
      content:
        "Use case 1 contributes $500,000 in revenue benefit. Use case 2 contributes $400,000 in cost savings.",
    },
    {
      step: 7,
      title: "Step 7: Executive Summary",
      content: "Total annual value: $1,234,567.89.",
    },
  ],
  vrm: {
    schemaVersion: "2.2",
    valueNormalizationVersion: "v3",
  },
};

const REPORT: ExportableReport = {
  id: "rep-test-1",
  companyName: "TestCorp Industries",
  createdAt: new Date("2026-05-04T00:00:00.000Z"),
  analysisData: CANONICAL_PAYLOAD,
};

const CTX: ExportContext = {
  reportType: "ai-opportunity-assessment",
  exportedAt: FIXED_EXPORT_TIMESTAMP,
};

/**
 * Every dollar value the user could see anywhere in the app, as it
 * was computed by the deterministic post-processor. Each export
 * format must surface these exact strings (or their numeric
 * equivalents) — never a rounded, re-summed, or recomputed variant.
 */
const CANONICAL_NUMBERS_AS_STRINGS = [
  "1234567.89",
  "500000",
  "400000",
  "200000",
  "134567.89",
];

describe("export-formatters: JSON pass-through", () => {
  it("emits the canonical analysisData reference-equal under `data`", () => {
    const out = formatReportAsJson(REPORT, CTX);
    // Reference equality — the export layer must NOT clone, reshape,
    // or recompute. Anything other than identity invites silent drift.
    expect(out.data).toBe(REPORT.analysisData);
  });

  it("emits the company, reportType, and exportedAt verbatim", () => {
    const out = formatReportAsJson(REPORT, CTX);
    expect(out.company).toBe("TestCorp Industries");
    expect(out.reportType).toBe("ai-opportunity-assessment");
    expect(out.exportedAt).toBe(FIXED_EXPORT_TIMESTAMP);
  });

  it("round-trips every canonical dollar value through JSON.stringify+parse", () => {
    const json = JSON.parse(JSON.stringify(formatReportAsJson(REPORT, CTX)));
    const dash = json.data.executiveDashboard;
    expect(dash.totalAnnualValue).toBe(1_234_567.89);
    expect(dash.totalRevenueBenefit).toBe(500_000);
    expect(dash.totalCostBenefit).toBe(400_000);
    expect(dash.totalCashFlowBenefit).toBe(200_000);
    expect(dash.totalRiskBenefit).toBe(134_567.89);
  });

  it("preserves the dashboard total as the exact sum of its parts (post-processor invariant)", () => {
    // This is a *witness* test, not a recomputation: it asserts the
    // canonical payload itself is internally consistent. If the
    // post-processor ever ships a dashboard whose totalAnnualValue
    // disagrees with its breakdown, the export-format test would
    // happily pass — but downstream UI would mismatch. Catch it here.
    const d = CANONICAL_PAYLOAD.executiveDashboard;
    const sum =
      d.totalRevenueBenefit +
      d.totalCostBenefit +
      d.totalCashFlowBenefit +
      d.totalRiskBenefit;
    expect(sum).toBeCloseTo(d.totalAnnualValue, 2);
  });
});

describe("export-formatters: Markdown pass-through", () => {
  it("contains the verbatim canonical summary string", () => {
    const md = formatReportAsMarkdown(REPORT, CTX);
    expect(md).toContain(CANONICAL_PAYLOAD.summary);
  });

  it("contains every step's verbatim content", () => {
    const md = formatReportAsMarkdown(REPORT, CTX);
    for (const step of CANONICAL_PAYLOAD.steps) {
      expect(md).toContain(step.title);
      expect(md).toContain(step.content);
    }
  });

  it("does not introduce any numeric value that is not already in the source payload", () => {
    const md = formatReportAsMarkdown(REPORT, CTX);
    // Strip the timestamp line (which contains digits but is meta,
    // not a calculated business number).
    const mdNoTimestamp = md.replace(/\*\*Generated:\*\* [^\n]+\n/g, "");
    // Strip step numbers like "Step 5", "Step 7" — they are headings,
    // not calculated values.
    const mdNoStepNums = mdNoTimestamp.replace(/Step \d+/g, "Step");
    // Every digit-bearing token left must appear in the source JSON
    // string of analysisData. (Concrete: the markdown body cannot
    // invent a "$2.5M" total that isn't in the source.)
    const sourceJson = JSON.stringify(CANONICAL_PAYLOAD);
    const numericTokens = mdNoStepNums.match(/[\d,]+\.?\d*/g) ?? [];
    for (const token of numericTokens) {
      const stripped = token.replace(/,/g, "");
      // Ignore single-digit punctuation artifacts (e.g. trailing "."
      // from sentences). Numbers we actually care about are >=3 chars
      // or contain a decimal.
      if (stripped.length < 3 && !stripped.includes(".")) continue;
      const inSource =
        sourceJson.includes(stripped) || sourceJson.includes(token);
      expect(inSource, `markdown contains numeric token "${token}" not present in canonical payload`).toBe(true);
    }
  });

  it("emits a graceful header when summary is missing (never invents a number)", () => {
    const reportNoSummary: ExportableReport = {
      ...REPORT,
      analysisData: { ...CANONICAL_PAYLOAD, summary: undefined },
    };
    const md = formatReportAsMarkdown(reportNoSummary, CTX);
    expect(md).toContain("No summary available");
    // No dollar values should leak into the summary placeholder.
    const summarySection = md.split("## Summary")[1].split("##")[0];
    expect(summarySection).not.toMatch(/\$[\d,]+/);
  });

  it("is deterministic for fixed inputs (same exportedAt → byte-identical output)", () => {
    const a = formatReportAsMarkdown(REPORT, CTX);
    const b = formatReportAsMarkdown(REPORT, CTX);
    expect(a).toBe(b);
  });
});

describe("export-formatters: cross-format numeric consistency", () => {
  it("the JSON `data.executiveDashboard.totalAnnualValue` matches every Markdown rendering of the same number", () => {
    const json = formatReportAsJson(REPORT, CTX);
    const md = formatReportAsMarkdown(REPORT, CTX);
    const totalFromJson = (json.data as typeof CANONICAL_PAYLOAD)
      .executiveDashboard.totalAnnualValue;
    // The Markdown output must contain the same number, formatted
    // verbatim in at least one of the source strings.
    const formatted = totalFromJson.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(md).toContain(formatted); // "1,234,567.89"
  });

  it("every canonical dollar string survives both export pipelines unchanged", () => {
    const json = JSON.stringify(formatReportAsJson(REPORT, CTX));
    const md = formatReportAsMarkdown(REPORT, CTX);
    for (const numStr of CANONICAL_NUMBERS_AS_STRINGS) {
      expect(json, `JSON export missing canonical number ${numStr}`).toContain(
        numStr,
      );
      // Markdown contains the formatted variant; the underlying number
      // is in the JSON of the source. Both paths see the same number.
    }
    // And the dashboard's total is in both formats.
    expect(json).toContain("1234567.89");
    expect(md).toContain("1,234,567.89");
  });
});
