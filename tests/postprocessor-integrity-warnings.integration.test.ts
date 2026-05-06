import { describe, it, expect } from "vitest";
import {
  gateBenefitsByClass,
  readDeclaredClasses,
} from "../src/calc/useCaseClassification";
import { validateRiskAnchoring } from "../src/calc/riskAnchoring";
import { validateBenchmarkCitations } from "../src/calc/benchmarksRegistry";

// Mirrors the integrity warning pipeline in
// server/calculation-postprocessor.ts: each guard's warnings get pushed
// into a single buffer and surface in vrm.diagnostic.warnings with a
// `remediation` alias for the existing UI.
function pipeline(records: any[], industry: string) {
  type W = {
    severity: "info" | "warning" | "critical";
    code: string;
    message: string;
    recommendedAction: string;
  };
  const integrityWarnings: W[] = [];

  // C1
  const benchVal = validateBenchmarkCitations({
    industry,
    step2Records: records.filter((r) => r._kind === "kpi"),
    hardReject: false,
  });
  for (const w of benchVal.warnings) {
    integrityWarnings.push({
      severity: w.severity,
      code: w.code,
      message: w.message,
      recommendedAction: w.recommendedAction,
    });
  }

  const kpiIds = new Set<string>(
    records.filter((r) => r._kind === "kpi").map((r) => String(r["KPI ID"])),
  );

  let totals = { revenue: 0, cost: 0, risk: 0, cashFlow: 0 };

  for (const uc of records.filter((r) => r._kind === "uc")) {
    // B1
    const declared = readDeclaredClasses(uc);
    const gate = gateBenefitsByClass({
      useCaseId: uc.ID,
      declaredClasses: declared,
      revenueBenefit: uc.revenue,
      costBenefit: uc.cost,
      riskBenefit: uc.risk,
      cashFlowBenefit: uc.cashFlow,
    });
    let { revenue, cost, risk, cashFlow } = gate.adjusted;
    for (const w of gate.warnings) integrityWarnings.push(w);

    // B2
    const ra = validateRiskAnchoring({
      useCaseId: uc.ID,
      riskBenefit: risk,
      lossCategory: uc.lossCategory,
      kpiAnchorId: uc.kpiAnchorId,
      step2KpiIds: kpiIds,
      hardReject: false,
    });
    risk = ra.adjustedRiskBenefit;
    for (const w of ra.warnings) integrityWarnings.push(w);

    totals.revenue += revenue;
    totals.cost += cost;
    totals.risk += risk;
    totals.cashFlow += cashFlow;
  }

  // Mimic the postprocessor's UI alias step.
  const diagnosticWarnings = integrityWarnings.map((w) => ({
    ...w,
    remediation: w.recommendedAction,
  }));

  return { diagnosticWarnings, totals };
}

describe("postprocessor integrity warning pipeline", () => {
  it("advisory mode: missing fields surface warnings without altering totals", () => {
    const records = [
      { _kind: "kpi", "KPI ID": "KPI-1", "KPI Name": "DSO", "Benchmark (Avg)": "32 days" },
      {
        _kind: "uc",
        ID: "UC-1",
        revenue: 0,
        cost: 1_000_000,
        risk: 500_000,
        cashFlow: 0,
      },
    ];
    const { diagnosticWarnings, totals } = pipeline(records, "retail");
    const codes = diagnosticWarnings.map((w) => w.code);

    expect(codes).toContain("BENCHMARK_UNSOURCED");
    expect(codes).toContain("CLASS_INFERRED_NO_DECLARATION");
    expect(codes).toContain("RISK_NOT_ANCHORED");

    // remediation alias present (UI key)
    for (const w of diagnosticWarnings) {
      expect((w as any).remediation).toBeTruthy();
    }

    // Totals untouched in advisory mode.
    expect(totals.cost).toBe(1_000_000);
    expect(totals.risk).toBe(500_000);
  });

  it("declared-class mismatch hard-rejects revenue and cost", () => {
    const records = [
      { _kind: "kpi", "KPI ID": "KPI-1", "KPI Name": "DSO" },
      {
        _kind: "uc",
        ID: "UC-2",
        "Use Case Class": "risk_bearing",
        revenue: 8_000_000,
        cost: 2_000_000,
        risk: 1_000_000,
        cashFlow: 100_000,
        lossCategory: "fraud",
        kpiAnchorId: "KPI-1",
      },
    ];
    const { diagnosticWarnings, totals } = pipeline(records, "retail");
    const codes = diagnosticWarnings.map((w) => w.code);

    expect(codes).toContain("CLASS_MISMATCH_REVENUE");
    expect(codes).toContain("CLASS_MISMATCH_COST");
    expect(totals.revenue).toBe(0);
    expect(totals.cost).toBe(0);
    expect(totals.cashFlow).toBe(0);
    expect(totals.risk).toBe(1_000_000); // legitimate, anchored, untouched
  });

  it("KPI anchor case/whitespace variance does not produce false RISK_KPI_NOT_FOUND", () => {
    const records = [
      { _kind: "kpi", "KPI ID": " kpi-7 ", "KPI Name": "DSO" },
      {
        _kind: "uc",
        ID: "UC-3",
        revenue: 0,
        cost: 0,
        risk: 1_000_000,
        cashFlow: 0,
        lossCategory: "markdown",
        kpiAnchorId: "KPI-7",
      },
    ];
    const { diagnosticWarnings } = pipeline(records, "retail");
    const codes = diagnosticWarnings.map((w) => w.code);
    expect(codes).not.toContain("RISK_KPI_NOT_FOUND");
  });
});
