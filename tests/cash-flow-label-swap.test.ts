import { describe, it, expect } from "vitest";
import { postProcessAnalysis } from "../server/calculation-postprocessor";

// Build a minimal analysis fixture with a single use case where the LLM has
// supplied a "Cash Flow Formula Labels" structure whose "Annual Revenue"
// value is actually Revenue at Risk ($14M) instead of company revenue ($14.8B).
function buildFixture(annualRevenueLabel: number) {
  return {
    sectorPreset: "baseline",
    steps: [
      {
        step: 0,
        title: "Company Profile",
        data: { "Annual Revenue ($)": 14_800_000_000, "Total Employees": 50_000 },
      },
      {
        step: 3,
        title: "Friction Point Mapping",
        data: [
          {
            "Friction Point": "Slow inventory turn",
            "Primary Driver Impact": "cash flow",
            "Annual Hours": 10_000,
            "Hourly Rate": 100,
          },
        ],
      },
      {
        step: 4,
        title: "Use Case Generation",
        data: [{ ID: "UC-04", "Target Friction": "Slow inventory turn", "Use Case": "Inventory cash velocity" }],
      },
      {
        step: 5,
        title: "Benefits Quantification by Driver",
        data: [
          {
            ID: "UC-04",
            "Use Case": "Inventory cash velocity",
            "Cost Formula Labels": {
              components: [
                { label: "Annual Hours", value: 0 },
                { label: "Loaded Hourly Rate", value: 100 },
                { label: "Cost Realization Factor", value: 1.0 },
                { label: "Adoption Curve Multiplier", value: 0.9 },
                { label: "Data Maturity", value: 0.75 },
              ],
            },
            "Cash Flow Formula Labels": {
              components: [
                { label: "Annual Revenue", value: annualRevenueLabel },
                { label: "Days Improved", value: 90 },
                { label: "Cost of Capital", value: 0.08 },
                { label: "Cash Flow Realization Factor", value: 0.85 },
                { label: "Data Maturity", value: 0.75 },
              ],
            },
          },
        ],
      },
      {
        step: 6,
        title: "Readiness & Token Modeling",
        data: [
          {
            ID: "UC-04",
            "Use Case": "Inventory cash velocity",
            "Runs/Month": 100,
            "Input Tokens/Run": 5000,
            "Output Tokens/Run": 1500,
            "Organizational Capacity": 5,
            "Data Availability & Quality": 5,
            "Technical Infrastructure": 5,
            "Governance": 5,
          },
        ],
      },
      {
        step: 7,
        title: "Prioritization",
        data: [{ ID: "UC-04", "Use Case": "Inventory cash velocity" }],
      },
    ],
  };
}

describe("cash-flow label-swap guard", () => {
  it("detects label swap when LLM puts $14M into the Annual Revenue slot of a $14.8B company", () => {
    const result = postProcessAnalysis(buildFixture(14_000_000));
    const warnings = (result.validationWarnings as string[]) || [];
    const swapWarning = warnings.find((w) => /label swap detected/i.test(w));
    expect(swapWarning).toBeDefined();
    expect(swapWarning).toMatch(/UC-04/);
    expect(swapWarning).toMatch(/\$14,800,000,000|\$14\.8B/);
  });

  it("passes through structured inputs when the supplied annualRevenue is within tolerance", () => {
    // Within tolerance = >= 50% of company revenue. $10B passes.
    const result = postProcessAnalysis(buildFixture(10_000_000_000));
    const warnings = (result.validationWarnings as string[]) || [];
    const swapWarning = warnings.find((w) => /label swap detected/i.test(w));
    expect(swapWarning).toBeUndefined();
  });

  it("attaches realism flags to the result", () => {
    const result = postProcessAnalysis(buildFixture(14_800_000_000));
    expect(Array.isArray(result.realismFlags)).toBe(true);
  });
});
