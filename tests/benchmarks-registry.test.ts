import { describe, it, expect } from "vitest";
import {
  buildBenchmarksIndex,
  validateBenchmarkCitations,
  BENCHMARKS_SEED,
} from "../src/calc/benchmarksRegistry";

describe("benchmarksRegistry", () => {
  it("indexes the seed by id and (industry, kpi)", () => {
    const idx = buildBenchmarksIndex();
    expect(idx.byId.size).toBe(BENCHMARKS_SEED.length);
    expect(idx.byId.get("retail.dso.avg")?.value).toBe(32);
    const retailDso = idx.byIndustryKpi.get("retail|days sales outstanding");
    expect(retailDso?.length).toBeGreaterThan(0);
  });

  it("emits BENCHMARK_UNSOURCED warning (advisory) when figures lack citation", () => {
    const r = validateBenchmarkCitations({
      industry: "retail",
      step2Records: [
        { "KPI Name": "DSO", "Benchmark (Avg)": "32 days" },
        { "KPI Name": "Inventory Turns", "Benchmark (Industry Best)": "12x" },
      ],
      hardReject: false,
    });
    const w = r.warnings.find((x) => x.code === "BENCHMARK_UNSOURCED");
    expect(w).toBeDefined();
    expect(w?.severity).toBe("warning");
    expect(w?.rejected).toBe(false);
    // values not stripped in advisory mode
    expect(r.rejectedBenchmarkCount).toBe(0);
  });

  it("strips unsourced benchmarks and reports critical when hardReject=true", () => {
    const recs = [
      { "KPI Name": "DSO", "Benchmark (Avg)": "32 days" },
      { "KPI Name": "Cost-to-Income", "Benchmark (Avg)": "0.55", "Source URL": "https://x" },
    ];
    const r = validateBenchmarkCitations({
      industry: "banking",
      step2Records: recs,
      hardReject: true,
    });
    const w = r.warnings.find((x) => x.code === "BENCHMARK_UNSOURCED");
    expect(w?.severity).toBe("critical");
    expect(w?.rejected).toBe(true);
    expect(r.rejectedBenchmarkCount).toBe(1);
    expect(recs[0]["Benchmark (Avg)"]).toBeUndefined(); // stripped
    expect(recs[1]["Benchmark (Avg)"]).toBe("0.55");    // sourced, untouched
  });
});
