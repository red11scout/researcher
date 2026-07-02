// Benchmarks source-of-truth registry (Stage C1).
//
// The LLM previously hallucinated benchmark values (industry avg /
// industry-best / overall-best). This registry seeds canonical
// benchmarks per (industry, KPI) so the post-processor can:
//   1. detect Step-2 benchmark figures that have no citation, and
//   2. (once the LLM contract is updated) reject benchmarks that
//      do not match a registry ID.
//
// The seed below is intentionally narrow — high-confidence industry
// benchmarks for the most common KPIs we surface. Expand by editing
// this file; persistence to a `benchmarks` DB table is the natural
// next step but is out of scope for this stage.

export interface BenchmarkRecord {
  id: string;            // stable ID e.g. "retail.dso.avg"
  industry: string;      // lowercase normalized industry
  kpiName: string;       // canonical KPI label
  metric: "avg" | "industry_best" | "overall_best";
  value: number;
  unit: string;
  sourceUrl: string;
  asOfYear: number;
}

// Hand-curated seed. Conservative — only entries with public sourcing.
export const BENCHMARKS_SEED: BenchmarkRecord[] = [
  {
    id: "retail.dso.avg",
    industry: "retail",
    kpiName: "Days Sales Outstanding",
    metric: "avg",
    value: 32,
    unit: "days",
    sourceUrl: "https://www.csimarket.com/Industry/industry_Efficiency.php?ind=1305",
    asOfYear: 2024,
  },
  {
    id: "retail.inventory_turns.avg",
    industry: "retail",
    kpiName: "Inventory Turnover",
    metric: "avg",
    value: 8,
    unit: "x/year",
    sourceUrl: "https://www.csimarket.com/Industry/industry_Efficiency.php?ind=1305",
    asOfYear: 2024,
  },
  {
    id: "banking.dso.avg",
    industry: "banking",
    kpiName: "Days Sales Outstanding",
    metric: "avg",
    value: 45,
    unit: "days",
    sourceUrl: "https://www.csimarket.com/Industry/industry_Efficiency.php?ind=601",
    asOfYear: 2024,
  },
  {
    id: "banking.cost_to_income.avg",
    industry: "banking",
    kpiName: "Cost-to-Income Ratio",
    metric: "avg",
    value: 0.58,
    unit: "ratio",
    sourceUrl: "https://www.spglobal.com/marketintelligence/en/news-insights/research/global-bank-cost-income-ratios",
    asOfYear: 2024,
  },
];

export function buildBenchmarksIndex(seed: BenchmarkRecord[] = BENCHMARKS_SEED): {
  byId: Map<string, BenchmarkRecord>;
  byIndustryKpi: Map<string, BenchmarkRecord[]>;
} {
  const byId = new Map<string, BenchmarkRecord>();
  const byIndustryKpi = new Map<string, BenchmarkRecord[]>();
  for (const b of seed) {
    byId.set(b.id, b);
    const key = `${b.industry.toLowerCase()}|${b.kpiName.toLowerCase()}`;
    const arr = byIndustryKpi.get(key) ?? [];
    arr.push(b);
    byIndustryKpi.set(key, arr);
  }
  return { byId, byIndustryKpi };
}

export interface BenchmarkValidationInput {
  industry: string;
  step2Records: any[];
  // When true, unsourced benchmarks are HARD-rejected (LLM contract on).
  hardReject?: boolean;
}

export interface BenchmarkValidationResult {
  warnings: Array<{
    code: "BENCHMARK_UNSOURCED" | "BENCHMARK_NOT_IN_REGISTRY" | "BENCHMARK_ID_MISMATCH";
    severity: "info" | "warning" | "critical";
    message: string;
    recommendedAction: string;
    rejected: boolean;
  }>;
  rejectedBenchmarkCount: number;
}

function normaliseKey(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

const BENCHMARK_FIELDS = [
  "Benchmark (Avg)",
  "Benchmark (Industry Best)",
  "Benchmark (Overall Best)",
  "Industry Benchmark",
] as const;

const SOURCE_FIELDS = ["Source URL", "Source", "Benchmark Source", "sourceUrl"] as const;

function hasSomeBenchmarkValue(rec: any): boolean {
  for (const f of BENCHMARK_FIELDS) {
    const v = rec?.[f];
    if (v !== undefined && v !== null && String(v).trim() !== "" && String(v).trim() !== "—") {
      return true;
    }
  }
  return false;
}

function hasSourceCitation(rec: any): boolean {
  for (const f of SOURCE_FIELDS) {
    const v = rec?.[f];
    if (v && String(v).trim().length > 0) return true;
  }
  // benchmarkId reference also counts as sourced.
  if (rec?.["Benchmark ID"] || rec?.benchmarkId) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Benchmark SOURCE normalization (verifiable clickable citations)
//
// The LLM emits a `Benchmark Sources` object per Step-2 row with one entry per
// benchmark tier (avg / industryBest / overallBest). Each entry may carry a
// clickable `url`. This module sanitizes those citations so the UI can render
// trustworthy links: only well-formed http(s) URLs survive (javascript:, data:,
// relative, or garbage URLs are dropped), and a curated registry URL is
// preferred when a Benchmark ID maps the row's tier to a verified source.
// ---------------------------------------------------------------------------

export interface NormalizedBenchmarkSource {
  label?: string;
  publisher?: string;
  title?: string;
  year?: number;
  url?: string;
}

export interface NormalizedBenchmarkSources {
  avg?: NormalizedBenchmarkSource;
  industryBest?: NormalizedBenchmarkSource;
  overallBest?: NormalizedBenchmarkSource;
}

type BenchmarkTier = "avg" | "industryBest" | "overallBest";

const TIER_TO_METRIC: Record<BenchmarkTier, BenchmarkRecord["metric"]> = {
  avg: "avg",
  industryBest: "industry_best",
  overallBest: "overall_best",
};

const TIER_TO_VALUE_FIELD: Record<BenchmarkTier, string> = {
  avg: "Benchmark (Avg)",
  industryBest: "Benchmark (Industry Best)",
  overallBest: "Benchmark (Overall Best)",
};

const SOURCE_OBJECT_FIELDS = ["Benchmark Sources", "BenchmarkSources", "benchmarkSources"] as const;

/**
 * Validate and normalize a candidate source URL. Returns the trimmed URL only
 * when it parses cleanly AND uses the http/https protocol. Everything else
 * (javascript:, data:, mailto:, relative paths, malformed strings) returns
 * undefined so a broken or unsafe `href` is never rendered.
 */
export function sanitizeBenchmarkUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  if (!parsed.hostname || !parsed.hostname.includes(".")) return undefined;
  return parsed.toString();
}

function cleanStr(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function cleanYear(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n)) return undefined;
  if (n < 1900 || n > 2100) return undefined;
  return n;
}

function readSourcesObject(record: any): Record<string, any> | undefined {
  for (const f of SOURCE_OBJECT_FIELDS) {
    const v = record?.[f];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, any>;
  }
  return undefined;
}

function normalizeOneSource(
  raw: any,
  registryUrl: string | undefined,
): { source: NormalizedBenchmarkSource | undefined; droppedUrl: boolean } {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const label = cleanStr(obj.label ?? obj.context ?? obj.source);
  const publisher = cleanStr(obj.publisher ?? obj.org ?? obj.organization ?? obj.author);
  const title = cleanStr(obj.title ?? obj.report ?? obj.dataset);
  const year = cleanYear(obj.year ?? obj.asOfYear ?? obj.date);

  const rawUrl = obj.url ?? obj.link ?? obj.href ?? obj.sourceUrl;
  const hadUrlIntent = cleanStr(rawUrl) !== undefined;
  const llmUrl = sanitizeBenchmarkUrl(rawUrl);
  const droppedUrl = hadUrlIntent && !llmUrl;
  // Prefer the curated, verified registry URL whenever the Benchmark ID's
  // metric matches this tier; fall back to the (sanitized) LLM URL otherwise.
  const registrySafe = sanitizeBenchmarkUrl(registryUrl);
  const url = registrySafe ?? llmUrl;

  const source: NormalizedBenchmarkSource = {};
  if (label !== undefined) source.label = label;
  if (publisher !== undefined) source.publisher = publisher;
  if (title !== undefined) source.title = title;
  if (year !== undefined) source.year = year;
  if (url !== undefined) source.url = url;

  return {
    source: Object.keys(source).length > 0 ? source : undefined,
    droppedUrl,
  };
}

export interface BenchmarkSourcesNormalizationResult {
  warnings: Array<{
    code: "BENCHMARK_SOURCE_URL_INVALID" | "BENCHMARK_SOURCE_UNLINKED";
    severity: "info" | "warning" | "critical";
    message: string;
    recommendedAction: string;
  }>;
  rowsWithLinks: number;
  rowsWithBenchmarksButNoLinks: number;
  droppedUrlCount: number;
}

/**
 * Normalize the `Benchmark Sources` citation object on every Step-2 record
 * IN PLACE. Pure aside from rewriting the record's own citation field — it
 * never touches numeric benchmark/value fields. Emits advisory integrity
 * warnings when benchmark figures are present without a verifiable link, or
 * when a supplied URL was malformed/unsafe and had to be dropped.
 */
export function normalizeBenchmarkSources(
  step2Records: any[],
): BenchmarkSourcesNormalizationResult {
  const out: BenchmarkSourcesNormalizationResult = {
    warnings: [],
    rowsWithLinks: 0,
    rowsWithBenchmarksButNoLinks: 0,
    droppedUrlCount: 0,
  };
  const { byId } = buildBenchmarksIndex();
  const tiers: BenchmarkTier[] = ["avg", "industryBest", "overallBest"];

  let rowsMissingLink = 0;

  for (const rec of step2Records || []) {
    if (!rec || typeof rec !== "object") continue;

    const regId = cleanStr(rec["Benchmark ID"] ?? rec.benchmarkId);
    const reg = regId ? byId.get(regId) : undefined;

    const rawSources = readSourcesObject(rec) ?? {};
    const normalized: NormalizedBenchmarkSources = {};
    let anyLink = false;
    let benchmarkWithoutLink = false;

    for (const tier of tiers) {
      const hasBenchmarkValue =
        cleanStr(rec[TIER_TO_VALUE_FIELD[tier]]) !== undefined &&
        cleanStr(rec[TIER_TO_VALUE_FIELD[tier]]) !== "—";
      // Registry URL only applies to the tier whose metric matches the ID.
      const registryUrl = reg && reg.metric === TIER_TO_METRIC[tier] ? reg.sourceUrl : undefined;
      const { source, droppedUrl } = normalizeOneSource((rawSources as any)[tier], registryUrl);
      if (droppedUrl) out.droppedUrlCount += 1;
      if (source) {
        normalized[tier] = source;
        if (source.url) anyLink = true;
      }
      if (hasBenchmarkValue && !(source && source.url)) benchmarkWithoutLink = true;
    }

    // Write back the sanitized object (or remove an empty/garbage one).
    if (Object.keys(normalized).length > 0) {
      rec["Benchmark Sources"] = normalized;
    } else {
      delete rec["Benchmark Sources"];
    }
    // Drop any non-canonical alias keys so only "Benchmark Sources" remains.
    for (const f of SOURCE_OBJECT_FIELDS) {
      if (f !== "Benchmark Sources") delete rec[f];
    }

    if (anyLink) out.rowsWithLinks += 1;
    if (benchmarkWithoutLink) rowsMissingLink += 1;
  }

  out.rowsWithBenchmarksButNoLinks = rowsMissingLink;

  if (out.droppedUrlCount > 0) {
    out.warnings.push({
      code: "BENCHMARK_SOURCE_URL_INVALID",
      severity: "warning",
      message: `${out.droppedUrlCount} benchmark citation${out.droppedUrlCount === 1 ? "" : "s"} supplied a malformed or unsafe source URL, which was dropped (only http(s) links are rendered).`,
      recommendedAction:
        "Provide a fully-qualified https URL to a public source for each benchmark tier, or reference a Benchmark ID from the canonical registry.",
    });
  }
  if (rowsMissingLink > 0) {
    out.warnings.push({
      code: "BENCHMARK_SOURCE_UNLINKED",
      severity: "info",
      message: `${rowsMissingLink} Step-2 KPI${rowsMissingLink === 1 ? "" : "s"} report a benchmark figure without a clickable, verifiable source link.`,
      recommendedAction:
        "Each industry / industry-best / overall-best benchmark should cite a public source URL so reviewers can verify it.",
    });
  }

  return out;
}

export function validateBenchmarkCitations(
  input: BenchmarkValidationInput,
): BenchmarkValidationResult {
  const out: BenchmarkValidationResult = { warnings: [], rejectedBenchmarkCount: 0 };
  const hard = !!input.hardReject;
  const { byId } = buildBenchmarksIndex();

  let unsourcedCount = 0;
  let notInRegistryCount = 0;
  let mismatchCount = 0;
  const ctxIndustry = normaliseKey(input.industry);

  for (const rec of input.step2Records || []) {
    if (!hasSomeBenchmarkValue(rec)) continue;
    const sourced = hasSourceCitation(rec);
    if (!sourced) {
      unsourcedCount += 1;
      if (hard) {
        out.rejectedBenchmarkCount += 1;
        // Strip the unsourced benchmarks (in-place) so downstream consumers
        // can't render them.
        for (const f of BENCHMARK_FIELDS) delete rec[f];
      }
      continue;
    }
    const id = rec?.["Benchmark ID"] ?? rec?.benchmarkId;
    if (id) {
      const reg = byId.get(String(id).trim());
      if (!reg) {
        notInRegistryCount += 1;
        if (hard) {
          out.rejectedBenchmarkCount += 1;
          for (const f of BENCHMARK_FIELDS) delete rec[f];
        }
        continue;
      }
      // Verify the registered (industry, KPI) matches the row context.
      const recKpi = normaliseKey(rec?.["KPI Name"] ?? rec?.kpiName);
      const regKpi = normaliseKey(reg.kpiName);
      const regIndustry = normaliseKey(reg.industry);
      const industryOk = !ctxIndustry || regIndustry === ctxIndustry;
      const kpiOk = !recKpi || regKpi === recKpi;
      if (!industryOk || !kpiOk) {
        mismatchCount += 1;
        if (hard) {
          out.rejectedBenchmarkCount += 1;
          for (const f of BENCHMARK_FIELDS) delete rec[f];
        }
      }
    }
  }

  if (unsourcedCount > 0) {
    out.warnings.push({
      code: "BENCHMARK_UNSOURCED",
      severity: hard ? "critical" : "warning",
      message: `${unsourcedCount} Step-2 KPI${unsourcedCount === 1 ? "" : "s"} report benchmark figures with no citation.${hard ? " Rejected." : " Advisory only — update the AI contract to require a Source URL or Benchmark ID."}`,
      recommendedAction:
        "Each industry / industry-best / overall-best benchmark must cite a public source URL (or reference a Benchmark ID from the canonical registry).",
      rejected: hard,
    });
  }
  if (notInRegistryCount > 0) {
    out.warnings.push({
      code: "BENCHMARK_NOT_IN_REGISTRY",
      severity: hard ? "critical" : "warning",
      message: `${notInRegistryCount} Step-2 benchmark ID${notInRegistryCount === 1 ? "" : "s"} ${notInRegistryCount === 1 ? "does" : "do"} not match the canonical benchmarks registry.${hard ? " Rejected." : ""}`,
      recommendedAction:
        "Verify the Benchmark ID against `src/calc/benchmarksRegistry.ts`. Add new entries to the registry rather than inventing IDs.",
      rejected: hard,
    });
  }
  if (mismatchCount > 0) {
    out.warnings.push({
      code: "BENCHMARK_ID_MISMATCH",
      severity: hard ? "critical" : "warning",
      message: `${mismatchCount} Step-2 benchmark ID${mismatchCount === 1 ? "" : "s"} cite a registry entry whose industry or KPI does not match the row context.${hard ? " Rejected." : ""}`,
      recommendedAction:
        "Pick a Benchmark ID whose registered industry and KPI match the Step-2 row. Re-using an ID from another (industry, KPI) pair is treated as a citation error.",
      rejected: hard,
    });
  }
  return out;
}
