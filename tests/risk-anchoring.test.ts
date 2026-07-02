import { describe, it, expect } from "vitest";
import {
  validateRiskAnchoring,
  readRiskAnchorFromRecord,
} from "../src/calc/riskAnchoring";

describe("riskAnchoring", () => {
  it("emits no warning when risk benefit is zero", () => {
    const r = validateRiskAnchoring({
      useCaseId: "UC-1",
      riskBenefit: 0,
      step2KpiIds: new Set(),
    });
    expect(r.warnings).toHaveLength(0);
  });

  it("emits advisory RISK_NOT_ANCHORED when fields missing and hardReject=false", () => {
    const r = validateRiskAnchoring({
      useCaseId: "UC-2",
      riskBenefit: 1_000_000,
      step2KpiIds: new Set(["KPI-1"]),
      hardReject: false,
    });
    expect(r.warnings[0].code).toBe("RISK_NOT_ANCHORED");
    expect(r.warnings[0].severity).toBe("warning");
    expect(r.warnings[0].rejected).toBe(false);
    expect(r.adjustedRiskBenefit).toBe(1_000_000);
  });

  it("hard-rejects when fields missing and hardReject=true", () => {
    const r = validateRiskAnchoring({
      useCaseId: "UC-3",
      riskBenefit: 5_000_000,
      step2KpiIds: new Set(["KPI-1"]),
      hardReject: true,
    });
    expect(r.warnings[0].rejected).toBe(true);
    expect(r.warnings[0].severity).toBe("critical");
    expect(r.adjustedRiskBenefit).toBe(0);
  });

  it("flags RISK_KPI_NOT_FOUND when anchor refers to a non-existent KPI", () => {
    const r = validateRiskAnchoring({
      useCaseId: "UC-4",
      riskBenefit: 2_000_000,
      lossCategory: "fraud",
      kpiAnchorId: "KPI-999",
      step2KpiIds: new Set(["KPI-1", "KPI-2"]),
      hardReject: false,
    });
    expect(r.warnings.find((w) => w.code === "RISK_KPI_NOT_FOUND")).toBeDefined();
  });

  it("readRiskAnchorFromRecord pulls from labels or top-level fields", () => {
    expect(
      readRiskAnchorFromRecord({
        "Loss Category": "markdown",
        "KPI Anchor ID": "KPI-7",
      }),
    ).toEqual({ lossCategory: "markdown", kpiAnchorId: "KPI-7" });

    expect(
      readRiskAnchorFromRecord({
        "Risk Formula Labels": { lossCategory: "fraud", kpiAnchorId: "KPI-9" },
      }),
    ).toEqual({ lossCategory: "fraud", kpiAnchorId: "KPI-9" });
  });
});
