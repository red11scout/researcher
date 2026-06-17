import { describe, it, expect } from "vitest";
import {
  buildBenchmarksIndex,
  validateBenchmarkCitations,
  normalizeBenchmarkSources,
  sanitizeBenchmarkUrl,
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

describe("sanitizeBenchmarkUrl", () => {
  it("keeps well-formed http and https URLs", () => {
    expect(sanitizeBenchmarkUrl("https://example.com/report")).toBe("https://example.com/report");
    expect(sanitizeBenchmarkUrl("  http://data.gov/x  ")).toBe("http://data.gov/x");
  });

  it("drops unsafe or malformed URLs", () => {
    expect(sanitizeBenchmarkUrl("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeBenchmarkUrl("data:text/html,<script>")).toBeUndefined();
    expect(sanitizeBenchmarkUrl("mailto:a@b.com")).toBeUndefined();
    expect(sanitizeBenchmarkUrl("/relative/path")).toBeUndefined();
    expect(sanitizeBenchmarkUrl("not a url")).toBeUndefined();
    expect(sanitizeBenchmarkUrl("http://localhost")).toBeUndefined(); // no dotted host
    expect(sanitizeBenchmarkUrl("")).toBeUndefined();
    expect(sanitizeBenchmarkUrl(undefined)).toBeUndefined();
    expect(sanitizeBenchmarkUrl(42)).toBeUndefined();
  });
});

describe("normalizeBenchmarkSources", () => {
  it("normalizes valid http(s) citations across all three tiers and counts links", () => {
    const recs = [
      {
        "KPI Name": "DSO",
        "Benchmark (Avg)": "32 days",
        "Benchmark (Industry Best)": "20 days",
        "Benchmark (Overall Best)": "12 days",
        "Benchmark Sources": {
          avg: { publisher: "CSIMarket", title: "Efficiency", year: "2024", url: "https://csimarket.com/a" },
          industryBest: { publisher: "Hackett", year: 2023, url: "https://thehackettgroup.com/b" },
          overallBest: { publisher: "APQC", url: "https://apqc.org/c" },
        },
      },
    ];
    const r = normalizeBenchmarkSources(recs);
    const src = recs[0]["Benchmark Sources"] as any;
    expect(src.avg.url).toBe("https://csimarket.com/a");
    expect(src.avg.year).toBe(2024); // coerced to number
    expect(src.industryBest.url).toBe("https://thehackettgroup.com/b");
    expect(src.overallBest.url).toBe("https://apqc.org/c");
    expect(r.rowsWithLinks).toBe(1);
    expect(r.rowsWithBenchmarksButNoLinks).toBe(0);
    expect(r.droppedUrlCount).toBe(0);
    expect(r.warnings).toHaveLength(0);
  });

  it("drops malformed/unsafe URLs but keeps the rest of the citation and warns", () => {
    const recs = [
      {
        "KPI Name": "DSO",
        "Benchmark (Avg)": "32 days",
        "Benchmark Sources": {
          avg: { publisher: "Sketchy", year: 2024, url: "javascript:alert(1)" },
        },
      },
    ];
    const r = normalizeBenchmarkSources(recs);
    const src = recs[0]["Benchmark Sources"] as any;
    expect(src.avg.url).toBeUndefined();          // unsafe URL removed
    expect(src.avg.publisher).toBe("Sketchy");    // attribution preserved
    expect(r.droppedUrlCount).toBe(1);
    expect(r.warnings.find((w) => w.code === "BENCHMARK_SOURCE_URL_INVALID")?.severity).toBe("warning");
  });

  it("emits an advisory BENCHMARK_SOURCE_UNLINKED warning when a benchmark has no link", () => {
    const recs = [
      { "KPI Name": "DSO", "Benchmark (Avg)": "32 days" }, // value present, no sources at all
    ];
    const r = normalizeBenchmarkSources(recs);
    expect(recs[0]["Benchmark Sources"]).toBeUndefined(); // empty object not written
    expect(r.rowsWithBenchmarksButNoLinks).toBe(1);
    const w = r.warnings.find((x) => x.code === "BENCHMARK_SOURCE_UNLINKED");
    expect(w?.severity).toBe("info");
  });

  it("prefers a curated registry sourceUrl when the matching tier has no usable URL", () => {
    const recs = [
      {
        "KPI Name": "Days Sales Outstanding",
        "Benchmark ID": "retail.dso.avg", // metric=avg → applies to the avg tier only
        "Benchmark (Avg)": "32 days",
        "Benchmark Sources": {
          avg: { publisher: "CSIMarket" }, // no URL supplied
        },
      },
    ];
    normalizeBenchmarkSources(recs);
    const src = recs[0]["Benchmark Sources"] as any;
    expect(src.avg.url).toBe(BENCHMARKS_SEED.find((b) => b.id === "retail.dso.avg")!.sourceUrl);
  });

  it("prefers the curated registry URL OVER a valid LLM-supplied URL for the matching tier", () => {
    const registryUrl = BENCHMARKS_SEED.find((b) => b.id === "retail.dso.avg")!.sourceUrl;
    const recs = [
      {
        "KPI Name": "Days Sales Outstanding",
        "Benchmark ID": "retail.dso.avg", // metric=avg
        "Benchmark (Avg)": "32 days",
        "Benchmark (Industry Best)": "20 days",
        "Benchmark Sources": {
          avg: { publisher: "LLM", url: "https://llm-supplied.example.com/avg" },
          industryBest: { publisher: "LLM", url: "https://llm-supplied.example.com/best" },
        },
      },
    ];
    normalizeBenchmarkSources(recs);
    const src = recs[0]["Benchmark Sources"] as any;
    // avg tier matches the registry metric → curated URL wins
    expect(src.avg.url).toBe(registryUrl);
    // industryBest tier has no matching registry entry → LLM URL retained
    expect(src.industryBest.url).toBe("https://llm-supplied.example.com/best");
  });

  it("reads legacy alias keys and rewrites to the canonical 'Benchmark Sources' field", () => {
    const recs = [
      {
        "KPI Name": "DSO",
        "Benchmark (Avg)": "32 days",
        BenchmarkSources: {
          avg: { publisher: "APQC", url: "https://apqc.org/x" },
        },
      },
    ];
    normalizeBenchmarkSources(recs as any);
    expect((recs[0] as any).BenchmarkSources).toBeUndefined(); // alias removed
    expect((recs[0] as any)["Benchmark Sources"].avg.url).toBe("https://apqc.org/x");
  });

  it("is a no-op safe pass for empty/garbage records", () => {
    const recs = [null, undefined, 42, { "KPI Name": "X" }] as any[];
    const r = normalizeBenchmarkSources(recs);
    expect(r.warnings).toHaveLength(0);
    expect(r.rowsWithLinks).toBe(0);
  });
});
