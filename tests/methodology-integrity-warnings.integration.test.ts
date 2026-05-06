import { describe, it, expect } from "vitest";
import { computeRealismFlags } from "../src/calc/realismGates";

describe("methodology integrity warnings — UI contract", () => {
  it("realism flags map cleanly into PortfolioWarning shape (severity warn → warning)", () => {
    const flags = computeRealismFlags({
      totalAnnualValue: 5_000_000_000,
      companyRevenue: 100_000_000_000,
      irr: 4.0,
      paybackMonths: 0,
    });
    expect(flags.length).toBeGreaterThan(0);

    const mapped = flags.map((f) => ({
      severity: f.severity === "warn" ? "warning" : "critical",
      code: f.code,
      message: f.message,
      recommendedAction: f.remediation,
    }));

    for (const w of mapped) {
      expect(["warning", "critical"]).toContain(w.severity);
      expect(typeof w.code).toBe("string");
      expect(w.message.length).toBeGreaterThan(0);
      expect(w.recommendedAction.length).toBeGreaterThan(0);
    }

    expect(mapped.find((w) => w.code === "IRR_IMPLAUSIBLE")?.severity).toBe(
      "critical",
    );
    expect(mapped.find((w) => w.code === "PAYBACK_IMPLAUSIBLE")?.severity).toBe(
      "critical",
    );
  });

  it("CFO-killer fixture (IRR 346%, payback 0, value 0.91% rev) trips IRR + PAYBACK", () => {
    const flags = computeRealismFlags({
      totalAnnualValue: 0.0091 * 14_800_000_000,
      companyRevenue: 14_800_000_000,
      irr: 3.46,
      paybackMonths: 0,
    });
    const codes = flags.map((f) => f.code);
    expect(codes).toContain("IRR_IMPLAUSIBLE");
    expect(codes).toContain("PAYBACK_IMPLAUSIBLE");
    expect(codes).not.toContain("VALUE_VS_REVENUE"); // 0.91% < 2% threshold
  });
});
