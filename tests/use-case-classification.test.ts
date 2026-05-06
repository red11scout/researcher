import { describe, it, expect } from "vitest";
import {
  gateBenefitsByClass,
  inferUseCaseClasses,
  readDeclaredClasses,
} from "../src/calc/useCaseClassification";

describe("useCaseClassification", () => {
  it("inferUseCaseClasses picks every pillar with a positive benefit", () => {
    const cls = inferUseCaseClasses({
      useCaseId: "UC-1",
      revenueBenefit: 100,
      costBenefit: 50,
      riskBenefit: 0,
      cashFlowBenefit: 0,
    });
    expect(cls.sort()).toEqual(["cost_bearing", "revenue_bearing"]);
  });

  it("inferUseCaseClasses defaults to cost_bearing when nothing emitted", () => {
    expect(
      inferUseCaseClasses({
        useCaseId: "UC-X",
        revenueBenefit: 0,
        costBenefit: 0,
        riskBenefit: 0,
        cashFlowBenefit: 0,
      }),
    ).toEqual(["cost_bearing"]);
  });

  it("emits info-level advisory warning when class is not declared", () => {
    const r = gateBenefitsByClass({
      useCaseId: "UC-2",
      revenueBenefit: 1_000_000,
      costBenefit: 0,
      riskBenefit: 0,
      cashFlowBenefit: 0,
    });
    expect(r.classesWereDeclared).toBe(false);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].code).toBe("CLASS_INFERRED_NO_DECLARATION");
    expect(r.warnings[0].severity).toBe("info");
    expect(r.warnings[0].rejected).toBe(false);
    expect(r.adjusted.revenue).toBe(1_000_000); // not zeroed in advisory mode
  });

  it("hard-rejects revenue benefit when declared classes exclude revenue_bearing", () => {
    const r = gateBenefitsByClass({
      useCaseId: "UC-3",
      declaredClasses: ["cost_bearing"],
      revenueBenefit: 5_000_000,
      costBenefit: 2_000_000,
      riskBenefit: 0,
      cashFlowBenefit: 100_000,
    });
    expect(r.warnings.find((w) => w.code === "CLASS_MISMATCH_REVENUE")).toBeDefined();
    expect(r.adjusted.revenue).toBe(0);
    expect(r.adjusted.cost).toBe(2_000_000); // legitimate, untouched
  });

  it("hard-rejects cost AND cash-flow when declared classes exclude cost_bearing", () => {
    const r = gateBenefitsByClass({
      useCaseId: "UC-4",
      declaredClasses: ["revenue_bearing"],
      revenueBenefit: 8_000_000,
      costBenefit: 1_000_000,
      riskBenefit: 0,
      cashFlowBenefit: 500_000,
    });
    expect(r.adjusted.cost).toBe(0);
    expect(r.adjusted.cashFlow).toBe(0);
    expect(r.adjusted.revenue).toBe(8_000_000);
  });

  it("readDeclaredClasses parses CSV / array / undefined", () => {
    expect(readDeclaredClasses({ "Use Case Class": "revenue_bearing, cost_bearing" })).toEqual([
      "revenue_bearing",
      "cost_bearing",
    ]);
    expect(readDeclaredClasses({ useCaseClass: ["risk_bearing"] })).toEqual(["risk_bearing"]);
    expect(readDeclaredClasses({})).toBeUndefined();
    expect(readDeclaredClasses({ "Use Case Class": "garbage" })).toBeUndefined();
  });
});
