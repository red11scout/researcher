import { describe, it, expect } from "vitest";
import { computeRealismFlags } from "../src/calc/realismGates";

describe("realismGates", () => {
  it("returns no flags for a plausible portfolio", () => {
    const flags = computeRealismFlags({
      totalAnnualValue: 50_000_000,       // $50M
      companyRevenue: 5_000_000_000,      // 1% of $5B revenue
      irr: 0.45,                          // 45% IRR
      paybackMonths: 10,                  // 10-month payback
    });
    expect(flags).toEqual([]);
  });

  it("trips IRR_IMPLAUSIBLE warn between 100-300%", () => {
    const flags = computeRealismFlags({
      totalAnnualValue: 0,
      irr: 1.5,
      paybackMonths: 12,
    });
    const f = flags.find((x) => x.code === "IRR_IMPLAUSIBLE");
    expect(f?.severity).toBe("warn");
  });

  it("trips IRR_IMPLAUSIBLE critical above 300%", () => {
    const flags = computeRealismFlags({
      totalAnnualValue: 0,
      irr: 3.468,                         // CFO-killer Tractor Supply number
      paybackMonths: 12,
    });
    const f = flags.find((x) => x.code === "IRR_IMPLAUSIBLE");
    expect(f?.severity).toBe("critical");
  });

  it("trips PAYBACK_IMPLAUSIBLE critical at 0 months", () => {
    const flags = computeRealismFlags({
      totalAnnualValue: 0,
      irr: 0.20,
      paybackMonths: 0,                   // CFO-killer "instant payback"
    });
    const f = flags.find((x) => x.code === "PAYBACK_IMPLAUSIBLE");
    expect(f?.severity).toBe("critical");
  });

  it("trips PAYBACK_IMPLAUSIBLE warn for 1-2 month payback", () => {
    const flags = computeRealismFlags({
      totalAnnualValue: 0,
      irr: 0.20,
      paybackMonths: 2,
    });
    const f = flags.find((x) => x.code === "PAYBACK_IMPLAUSIBLE");
    expect(f?.severity).toBe("warn");
  });

  it("trips VALUE_VS_REVENUE warn at 0.91% of revenue is fine but >2% warns", () => {
    // 0.91% (Tractor Supply) is below the 2% warn threshold — should NOT fire.
    const ok = computeRealismFlags({
      totalAnnualValue: 134_900_000,
      companyRevenue: 14_800_000_000,
      irr: 0.20,
      paybackMonths: 12,
    });
    expect(ok.find((x) => x.code === "VALUE_VS_REVENUE")).toBeUndefined();

    const warn = computeRealismFlags({
      totalAnnualValue: 450_000_000,      // 3% of $15B
      companyRevenue: 15_000_000_000,
      irr: 0.20,
      paybackMonths: 12,
    });
    expect(warn.find((x) => x.code === "VALUE_VS_REVENUE")?.severity).toBe("warn");
  });

  it("trips VALUE_VS_REVENUE critical above 5%", () => {
    const flags = computeRealismFlags({
      totalAnnualValue: 1_000_000_000,    // 6.67% of $15B
      companyRevenue: 15_000_000_000,
      irr: 0.20,
      paybackMonths: 12,
    });
    expect(flags.find((x) => x.code === "VALUE_VS_REVENUE")?.severity).toBe("critical");
  });

  it("flags the full Tractor Supply CFO-killer combo", () => {
    const flags = computeRealismFlags({
      totalAnnualValue: 134_900_000,
      companyRevenue: 14_800_000_000,
      irr: 3.468,
      paybackMonths: 0,
    });
    const codes = flags.map((f) => f.code).sort();
    expect(codes).toContain("IRR_IMPLAUSIBLE");
    expect(codes).toContain("PAYBACK_IMPLAUSIBLE");
    // VALUE_VS_REVENUE should NOT trip (0.91% < 2%)
    expect(codes).not.toContain("VALUE_VS_REVENUE");
  });

  it("skips revenue ratio when companyRevenue is missing", () => {
    const flags = computeRealismFlags({
      totalAnnualValue: 999_999_999_999,
      irr: 0.20,
      paybackMonths: 12,
    });
    expect(flags.find((x) => x.code === "VALUE_VS_REVENUE")).toBeUndefined();
  });
});
