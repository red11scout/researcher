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
