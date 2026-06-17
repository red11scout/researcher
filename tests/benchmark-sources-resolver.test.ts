import { describe, it, expect } from "vitest";
import {
  sanitizeBenchmarkUrl,
  parsePublisherFromText,
  resolveDomainAuthority,
  resolveBenchmarkSource,
  resolveBenchmarkSourcesForRecord,
  augmentAnalysisBenchmarkSourcesForPresentation,
  extractBenchmarkContext,
  BENCHMARK_AUTHORITIES,
} from "../shared/benchmarkSources";

// Every URL the resolver can ever emit comes from this registry. Asserting
// against this set is how we prove "no fabricated URLs".
const REGISTRY_URLS = new Set(BENCHMARK_AUTHORITIES.map((a) => a.url));

describe("sanitizeBenchmarkUrl", () => {
  it("accepts well-formed http(s) URLs verbatim", () => {
    expect(sanitizeBenchmarkUrl("https://www.mgma.com/datadive")).toBe(
      "https://www.mgma.com/datadive",
    );
    expect(sanitizeBenchmarkUrl("http://example.org/x")).toBe(
      "http://example.org/x",
    );
  });

  it("rejects dangerous or malformed URLs", () => {
    expect(sanitizeBenchmarkUrl("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeBenchmarkUrl("ftp://example.org/x")).toBeUndefined();
    expect(sanitizeBenchmarkUrl("data:text/html,<script>")).toBeUndefined();
    expect(sanitizeBenchmarkUrl("not a url")).toBeUndefined();
    expect(sanitizeBenchmarkUrl("")).toBeUndefined();
    expect(sanitizeBenchmarkUrl(null)).toBeUndefined();
    expect(sanitizeBenchmarkUrl(42)).toBeUndefined();
  });
});

describe("extractBenchmarkContext", () => {
  it("pulls the parenthetical context phrase", () => {
    expect(extractBenchmarkContext("32 days (hospital industry average)")).toBe(
      "hospital industry average",
    );
    expect(extractBenchmarkContext("32 days")).toBeUndefined();
    expect(extractBenchmarkContext(123)).toBeUndefined();
  });
});

describe("parsePublisherFromText (named publisher)", () => {
  it("detects a named publisher and its year", () => {
    const r = parsePublisherFromText("US nuclear fleet average, NEI 2025");
    expect(r.authority?.key).toBe("nei");
    expect(r.year).toBe(2025);
  });

  it("detects MGMA", () => {
    const r = parsePublisherFromText("Median per MGMA DataDive 2024");
    expect(r.authority?.key).toBe("mgma");
    expect(r.year).toBe(2024);
  });

  it("returns empty for text with no recognized publisher", () => {
    expect(parsePublisherFromText("hospital industry average").authority).toBeUndefined();
    expect(parsePublisherFromText("").authority).toBeUndefined();
    expect(parsePublisherFromText(null).authority).toBeUndefined();
  });
});

describe("resolveDomainAuthority (generic domain fallback)", () => {
  it("maps a generic media phrase to a media authority", () => {
    const auth = resolveDomainAuthority("media industry typical");
    expect(auth).toBeDefined();
  });

  it("uses report industry when value text has no domain hint", () => {
    const auth = resolveDomainAuthority("32 days", "Healthcare");
    expect(auth).toBeDefined();
  });

  it("returns undefined when there is nothing to match", () => {
    expect(resolveDomainAuthority("", "")).toBeUndefined();
  });
});

describe("resolveBenchmarkSource — honest, verifiable, never fabricated", () => {
  it("keeps an existing valid URL verbatim (highest priority)", () => {
    const existing = {
      publisher: "Custom",
      url: "https://example.gov/report",
      title: "Custom title",
    };
    const out = resolveBenchmarkSource({ existing, valueText: "32 days (hospital industry average)" });
    expect(out?.url).toBe("https://example.gov/report");
    expect(out?.publisher).toBe("Custom");
    expect(out?.verificationStatus).toBe("publisherLanding");
  });

  it("named publisher in value text -> publisherLanding with registry URL", () => {
    const out = resolveBenchmarkSource({
      valueText: "US nuclear fleet average, NEI 2025",
    });
    expect(out?.publisher).toBe("NEI");
    expect(out?.url).toBe("https://www.nei.org/resources/statistics");
    expect(out?.verificationStatus).toBe("publisherLanding");
    expect(out?.year).toBe(2025);
    expect(REGISTRY_URLS.has(out!.url!)).toBe(true);
  });

  it("recognizes a named publisher carried only on existing.publisher", () => {
    const out = resolveBenchmarkSource({
      existing: { publisher: "MGMA" },
      valueText: "32 days",
    });
    expect(out?.url).toBe("https://www.mgma.com/datadive");
    expect(out?.verificationStatus).toBe("publisherLanding");
  });

  it("generic domain -> authorityReference labeled as an industry reference", () => {
    const out = resolveBenchmarkSource({ valueText: "typical (media industry typical)" });
    expect(out?.verificationStatus).toBe("authorityReference");
    expect(out?.label).toMatch(/industry ref/i);
    expect(REGISTRY_URLS.has(out!.url!)).toBe(true);
  });

  it("bare number with no hints still gets an honest cross-industry reference (APQC)", () => {
    const out = resolveBenchmarkSource({ valueText: "2.4 hours" });
    expect(out?.publisher).toBe("APQC");
    expect(out?.verificationStatus).toBe("authorityReference");
    expect(REGISTRY_URLS.has(out!.url!)).toBe(true);
  });

  it("never emits a URL outside the curated registry", () => {
    const samples = [
      "32 days (hospital industry average)",
      "media industry typical",
      "US nuclear fleet average, NEI 2025",
      "$1.2M",
      "98%",
      "n/a",
    ];
    for (const valueText of samples) {
      const out = resolveBenchmarkSource({ valueText, industry: "Healthcare" });
      if (out?.url) expect(REGISTRY_URLS.has(out.url)).toBe(true);
    }
  });

  it("returns undefined when there is no value and no existing attribution", () => {
    expect(resolveBenchmarkSource({})).toBeUndefined();
    expect(resolveBenchmarkSource({ valueText: "" })).toBeUndefined();
  });

  it("never cites a placeholder value (N/A, —, none, TBD) even with an industry", () => {
    for (const placeholder of ["N/A", "n/a", "na", "—", "-", "none", "TBD", "unknown", "?"]) {
      const out = resolveBenchmarkSource({ valueText: placeholder, industry: "Healthcare" });
      expect(out).toBeUndefined();
    }
  });

  it("drops an unsafe existing URL but keeps a label-only attribution", () => {
    const out = resolveBenchmarkSource({
      existing: { url: "javascript:alert(1)", label: "internal estimate" },
      valueText: "",
    });
    // No value to resolve from; unsafe URL must not survive.
    expect(out?.url === "javascript:alert(1)").toBe(false);
  });
});

describe("resolveBenchmarkSourcesForRecord", () => {
  it("fills only tiers that have a benchmark value", () => {
    const record = {
      KPI: "Days in A/R",
      "Benchmark (Avg)": "32 days (hospital industry average)",
      "Benchmark (Industry Best)": "MGMA 2025: 25 days",
      // overallBest intentionally absent
    };
    const out = resolveBenchmarkSourcesForRecord(record, { industry: "Healthcare" });
    expect(out.avg).toBeDefined();
    expect(out.industryBest?.url).toBe("https://www.mgma.com/datadive");
    expect(out.overallBest).toBeUndefined();
  });

  it("does not mutate the input record", () => {
    const record = {
      "Benchmark (Avg)": "32 days (hospital industry average)",
    };
    const snapshot = JSON.stringify(record);
    resolveBenchmarkSourcesForRecord(record, { industry: "Healthcare" });
    expect(JSON.stringify(record)).toBe(snapshot);
  });

  it("supports the 'Industry Benchmark' alias for the avg tier", () => {
    const record = { "Industry Benchmark": "media industry typical" };
    const out = resolveBenchmarkSourcesForRecord(record);
    expect(out.avg).toBeDefined();
  });
});

describe("augmentAnalysisBenchmarkSourcesForPresentation", () => {
  const buildAnalysis = () => ({
    companyOverview: { industry: "Healthcare" },
    steps: [
      { step: 1, data: [] },
      { step: 2, title: "Business Function Inventory & KPI Baselines", data: [
        { KPI: "Days in A/R", "Benchmark (Avg)": "32 days (hospital industry average)" },
      ] },
    ],
  });

  it("returns a clone and never mutates the input (imports stay immutable)", () => {
    const analysis = buildAnalysis();
    const snapshot = JSON.stringify(analysis);
    const out = augmentAnalysisBenchmarkSourcesForPresentation(analysis);
    expect(JSON.stringify(analysis)).toBe(snapshot);
    expect(out).not.toBe(analysis);
    const step2 = (out as any).steps.find((s: any) => s.step === 2);
    expect(step2.data[0]["Benchmark Sources"].avg).toBeDefined();
  });

  it("handles the nested analysisData.steps shape used by the HTML generators", () => {
    const analysis = { analysisData: buildAnalysis() };
    const out: any = augmentAnalysisBenchmarkSourcesForPresentation(analysis);
    const step2 = out.analysisData.steps.find((s: any) => s.step === 2);
    expect(step2.data[0]["Benchmark Sources"].avg).toBeDefined();
  });

  it("is a no-op on payloads without Step 2 data", () => {
    const analysis = { steps: [{ step: 1, data: [] }] };
    const out: any = augmentAnalysisBenchmarkSourcesForPresentation(analysis);
    expect(out.steps[0].data).toEqual([]);
  });

  it("tolerates non-object input", () => {
    expect(augmentAnalysisBenchmarkSourcesForPresentation(null as any)).toBeNull();
    expect(augmentAnalysisBenchmarkSourcesForPresentation("x" as any)).toBe("x");
  });
});
