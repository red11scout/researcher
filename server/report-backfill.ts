// server/report-backfill.ts
// Helpers for detecting reports that still carry the legacy v2.0 shape and
// for one-shot backfilling every report in storage to the current v2.1 schema
// (flat diagnostic fields + Step 6 hard knock-out fields). Used by both the
// on-the-fly staleness check in `server/routes.ts` and by the admin/CLI
// migration entry points so the staleness rule lives in exactly one place.

import { storage } from "./storage";
import { postProcessAnalysis } from "./calculation-postprocessor";
import { VRM_SCHEMA_VERSION } from "@shared/vrm-v2";
import type { Report } from "@shared/schema";

export interface StalenessResult {
  stale: boolean;
  reasons: string[];
  hasStep6: boolean;
  vrmSchemaVersion: string | null;
  hasV21Diagnostic: boolean;
  hasFlatFields: boolean;
  hasStep6KOFields: boolean;
}

/**
 * Decide whether a report's analysisData still needs to be re-run through
 * `postProcessAnalysis` to reach the current v2.1 shape. Mirrors the staleness
 * rules used at GET /api/reports/:id and POST /api/analyze/check.
 */
export function evaluateReportStaleness(analysis: any): StalenessResult {
  const reasons: string[] = [];

  if (!analysis?.steps || !Array.isArray(analysis.steps)) {
    return {
      stale: false,
      reasons: ["no-steps"],
      hasStep6: false,
      vrmSchemaVersion: null,
      hasV21Diagnostic: false,
      hasFlatFields: false,
      hasStep6KOFields: false,
    };
  }

  const step6 = analysis.steps.find(
    (s: any) =>
      s.step === 6 && s.data && Array.isArray(s.data) && s.data.length > 0,
  );
  const hasStep6 = !!step6;

  const vrmSchemaVersion: string | null = analysis?.vrm?.schemaVersion ?? null;
  const diag = analysis?.vrm?.diagnostic;
  const hasV21Diagnostic = !!diag;
  const hasFlatFields =
    !!diag &&
    typeof diag.championCount === "number" &&
    typeof diag.prototypingCandidatesPct === "number";
  const hasStep6KOFields =
    !!step6 &&
    !!step6.data[0] &&
    "Legally Prohibited" in step6.data[0] &&
    "Technically Infeasible" in step6.data[0];

  // VRM v2.2 (April 2026) renamed Recommended Phase from Q1/Q2/Q3/Q4 →
  // Phase 1/Phase 2/Phase 3/Phase 4. Reports persisted before this rename
  // still carry the legacy "Q" labels in Step 7's data rows; flag those as
  // stale so the admin backfill re-runs `getNewRecommendedPhase` and writes
  // the new label without requiring a force run.
  const step7 = analysis.steps.find(
    (s: any) =>
      s.step === 7 && s.data && Array.isArray(s.data) && s.data.length > 0,
  );
  const step7UsesLegacyQuarterLabels =
    !!step7 &&
    step7.data.some((row: any) => {
      const phase = typeof row?.["Recommended Phase"] === "string"
        ? row["Recommended Phase"].trim()
        : "";
      return phase === "Q1" || phase === "Q2" || phase === "Q3" || phase === "Q4";
    });

  if (!hasStep6) reasons.push("missing-step6");
  if (vrmSchemaVersion !== VRM_SCHEMA_VERSION)
    reasons.push(`vrm-schema=${vrmSchemaVersion ?? "missing"}`);
  if (!hasV21Diagnostic) reasons.push("missing-diagnostic");
  if (!hasFlatFields) reasons.push("missing-flat-fields");
  if (!hasStep6KOFields) reasons.push("missing-step6-knockout-fields");
  if (step7UsesLegacyQuarterLabels) reasons.push("step7-uses-legacy-Q-phase-labels");

  const stale = reasons.length > 0;
  return {
    stale,
    reasons,
    hasStep6,
    vrmSchemaVersion,
    hasV21Diagnostic,
    hasFlatFields,
    hasStep6KOFields,
  };
}

/**
 * Result of parsing a request body's optional `onlyIds` field for the admin
 * backfill route. `ok=false` carries the operator-facing error string the
 * route should send back as 400; `ok=true` carries the deduped allow-list
 * (or `undefined` when the caller didn't request a subset, i.e. full run).
 */
export type ParsedOnlyIds =
  | { ok: true; onlyIds: string[] | undefined }
  | { ok: false; error: string };

/**
 * Validate the optional `onlyIds` whitelist on the admin backfill request
 * body and return either the deduped string array (or `undefined` for full
 * runs) or a 400-style error message. Pulled into its own helper so the
 * wire-format contract — "must be a non-empty array of non-empty strings" —
 * can be unit-tested without standing up the full route. Two call sites
 * use this: the streaming and non-streaming branches of the
 * `/api/admin/backfill-reports` handler in `server/routes.ts`.
 */
export function parseOnlyIdsFromBody(body: unknown): ParsedOnlyIds {
  const ERR = "onlyIds must be a non-empty array of report id strings";
  const raw = (body as { onlyIds?: unknown } | null | undefined)?.onlyIds;
  if (raw === undefined) {
    return { ok: true, onlyIds: undefined };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: ERR };
  }
  if (raw.length === 0) {
    return { ok: false, error: ERR };
  }
  if (!raw.every((v) => typeof v === "string" && v.length > 0)) {
    return { ok: false, error: ERR };
  }
  // De-duplicate so the same id passed twice doesn't double the
  // total/processed counts during the run.
  const deduped = Array.from(new Set(raw as string[]));
  return { ok: true, onlyIds: deduped };
}

/**
 * A single concrete change applied to a report by the backfill, derived by
 * diffing the staleness signals before and after `postProcessAnalysis` runs.
 * `code` is a stable machine id (safe for grouping/aggregation in the UI),
 * `label` is the short human-readable summary the admin sees.
 */
export interface ReportUpgrade {
  code:
    | "added-step6"
    | "bumped-schema"
    | "added-diagnostic"
    | "added-flat-fields"
    | "added-step6-ko-fields";
  label: string;
}

/**
 * Snapshot of the headline analysis numbers a report exposes — taken once
 * before `postProcessAnalysis` runs and once after, so the backfill can tell
 * the operator whether the migration actually moved the bottom line or just
 * rewrote the schema. The fields are intentionally a thin slice of the full
 * `analysisData`: the totals admins look at on the executive dashboard, plus
 * the portfolio-diagnostic counts that change when readiness tiers flip.
 *
 * All fields default to 0 when the corresponding part of the analysis is
 * missing (e.g. a v2.0 report has no `vrm.diagnostic` block at all), so the
 * delta computation can treat "missing" and "zero" the same way without
 * special-casing.
 */
export interface ReportMetricSnapshot {
  /** Sum of cost + revenue + cash-flow + risk benefits across all use cases. */
  totalAnnualValue: number;
  /** Number of use cases classified as Champions in the portfolio diagnostic. */
  championCount: number;
  /** Subset of Champions promoted to the Lead tier (V≥7.5 AND R≥7.5). */
  leadChampionCount: number;
  /** Number of use cases classified as Conditional Champions. */
  conditionalChampionCount: number;
  /** Number of use cases classified as Quick Wins. */
  quickWinCount: number;
  /** Number of use cases classified as Strategic. */
  strategicCount: number;
  /** Number of use cases stuck in the Foundation bucket. */
  foundationCount: number;
  /** Champions + Quick Wins + Conditionals (the prototyping shortlist). */
  prototypingCandidatesCount: number;
  /** Total use cases the diagnostic ran over. */
  totalUseCases: number;
}

/**
 * One headline-number movement applied by the backfill. Like `ReportUpgrade`,
 * `code` is the stable machine id and `label` is the short summary the admin
 * sees, e.g. "Total value $1.2M → $1.4M (+$200K)" or "Lead Champions 0 → 1".
 * `before`/`after`/`delta` are the raw numbers so the UI can re-render or
 * recolor without re-parsing the label.
 */
export interface ReportMetricDelta {
  code:
    | "total-annual-value"
    | "champion-count"
    | "lead-champion-count"
    | "conditional-champion-count"
    | "quick-win-count"
    | "strategic-count"
    | "foundation-count"
    | "prototyping-candidates"
    | "total-use-cases";
  label: string;
  before: number;
  after: number;
  /** `after - before`. Positive = number went up, negative = went down. */
  delta: number;
  /** `"money"` formats with $K/$M/$B; `"count"` formats as a plain integer. */
  unit: "money" | "count";
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Pull the headline numbers out of an `analysisData` object into a snapshot
 * the backfill can diff. Tolerant of every legacy shape: a v2.0 report with
 * no `executiveDashboard` and no `vrm.diagnostic` snapshots as all zeros,
 * which is the right "before" baseline when the post-processor is about to
 * synthesize those blocks for the first time.
 */
export function snapshotReportMetrics(analysis: any): ReportMetricSnapshot {
  const dash = analysis?.executiveDashboard ?? {};
  // Prefer the active v2.2 diagnostic; fall back to the v2.1 shadow block
  // for reports that haven't been migrated yet (so a v2.1-only "before"
  // snapshot still surfaces championCount etc. instead of all zeros).
  const diag = analysis?.vrm?.diagnostic ?? analysis?.vrm?.diagnosticV21 ?? {};
  return {
    totalAnnualValue: readNumber(dash.totalAnnualValue),
    championCount: readNumber(diag.championCount),
    leadChampionCount: readNumber(diag.leadChampionCount),
    conditionalChampionCount: readNumber(diag.conditionalChampionCount),
    quickWinCount: readNumber(diag.quickWinCount),
    strategicCount: readNumber(diag.strategicCount),
    foundationCount: readNumber(diag.foundationCount),
    prototypingCandidatesCount: readNumber(diag.prototypingCandidatesCount),
    totalUseCases: readNumber(diag.totalUseCases),
  };
}

// Format an absolute money value as $K/$M/$B with one decimal of resolution
// past the unit (e.g. 1_200_000 -> "$1.2M"). Mirrors the rounding policy of
// `formatMoney` in src/calc/formulas.ts but works on a pre-signed magnitude
// so we can render "+$200K" / "-$500K" deltas cleanly.
function formatMoneyMagnitude(value: number): string {
  const abs = Math.abs(Math.round(value));
  if (abs >= 1_000_000_000) {
    const b = abs / 1_000_000_000;
    return b === Math.floor(b) ? `$${Math.floor(b)}B` : `$${b.toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return m === Math.floor(m) ? `$${Math.floor(m)}M` : `$${m.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `$${Math.round(abs / 1_000)}K`;
  }
  return `$${abs}`;
}

function formatMoneyDelta(delta: number): string {
  if (delta > 0) return `+${formatMoneyMagnitude(delta)}`;
  if (delta < 0) return `-${formatMoneyMagnitude(delta)}`;
  return formatMoneyMagnitude(0);
}

function formatCountDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return `${delta}`; // includes negative sign for delta<0 and "0" for delta===0
}

/**
 * Diff two metric snapshots and return one delta entry per field that
 * actually changed. Returns an empty array when the post-processor was a
 * no-op for every headline number — which the UI uses to label the report
 * as "schema-only" (the schema/diagnostic shape changed, but the bottom
 * line is identical).
 */
export function computeMetricDeltas(
  before: ReportMetricSnapshot,
  after: ReportMetricSnapshot,
): ReportMetricDelta[] {
  const deltas: ReportMetricDelta[] = [];

  // Build the field list once so the order in the UI is deterministic
  // (money first, then the portfolio counts in roughly "most useful" order).
  const fields: Array<{
    code: ReportMetricDelta["code"];
    name: string;
    unit: ReportMetricDelta["unit"];
    key: keyof ReportMetricSnapshot;
  }> = [
    { code: "total-annual-value", name: "Total value", unit: "money", key: "totalAnnualValue" },
    { code: "prototyping-candidates", name: "Prototyping candidates", unit: "count", key: "prototypingCandidatesCount" },
    { code: "lead-champion-count", name: "Lead Champions", unit: "count", key: "leadChampionCount" },
    { code: "champion-count", name: "Champions", unit: "count", key: "championCount" },
    { code: "conditional-champion-count", name: "Conditional Champions", unit: "count", key: "conditionalChampionCount" },
    { code: "quick-win-count", name: "Quick Wins", unit: "count", key: "quickWinCount" },
    { code: "strategic-count", name: "Strategic", unit: "count", key: "strategicCount" },
    { code: "foundation-count", name: "Foundation", unit: "count", key: "foundationCount" },
    { code: "total-use-cases", name: "Total use cases", unit: "count", key: "totalUseCases" },
  ];

  for (const f of fields) {
    const b = before[f.key];
    const a = after[f.key];
    const delta = a - b;
    if (delta === 0) continue;
    const label =
      f.unit === "money"
        ? `${f.name} ${formatMoneyMagnitude(b)} → ${formatMoneyMagnitude(a)} (${formatMoneyDelta(delta)})`
        : `${f.name} ${b} → ${a} (${formatCountDelta(delta)})`;
    deltas.push({
      code: f.code,
      label,
      before: b,
      after: a,
      delta,
      unit: f.unit,
    });
  }

  return deltas;
}

/**
 * Compute the list of upgrades the backfill applied to one report by
 * comparing the staleness signals before vs. after `postProcessAnalysis`.
 * Returns an empty array when nothing schema-relevant changed (e.g. a forced
 * reprocess of an already-fresh report).
 */
export function computeUpgradesApplied(
  before: StalenessResult,
  after: StalenessResult,
): ReportUpgrade[] {
  const upgrades: ReportUpgrade[] = [];
  if (!before.hasStep6 && after.hasStep6) {
    upgrades.push({ code: "added-step6", label: "Generated Step 6" });
  }
  if (before.vrmSchemaVersion !== after.vrmSchemaVersion) {
    upgrades.push({
      code: "bumped-schema",
      label: `Bumped schema ${before.vrmSchemaVersion ?? "missing"} → ${after.vrmSchemaVersion ?? "missing"}`,
    });
  }
  if (!before.hasV21Diagnostic && after.hasV21Diagnostic) {
    upgrades.push({
      code: "added-diagnostic",
      label: "Added VRM diagnostic",
    });
  }
  if (!before.hasFlatFields && after.hasFlatFields) {
    upgrades.push({
      code: "added-flat-fields",
      label: "Added diagnostic flat fields",
    });
  }
  if (!before.hasStep6KOFields && after.hasStep6KOFields) {
    upgrades.push({
      code: "added-step6-ko-fields",
      label: "Synthesized Step 6 KO fields",
    });
  }
  return upgrades;
}

export interface BackfillReportResult {
  id: string;
  companyName: string;
  isWhatIf: boolean;
  status: "updated" | "skipped" | "failed";
  reasons?: string[];
  /**
   * For status="updated": the concrete schema-level changes the post-processor
   * applied, computed by diffing the staleness signals before vs. after.
   * Empty when the report was force-reprocessed but already on the latest
   * shape. Omitted entirely for skipped/failed results.
   */
  upgrades?: ReportUpgrade[];
  /**
   * For status="updated": the headline-number movements the post-processor
   * applied (e.g. total annual value, prototyping-candidate count, lead
   * champion count). Computed by diffing `snapshotReportMetrics(before)`
   * against `snapshotReportMetrics(after)`. Empty when the upgrade was
   * "schema-only" — the schema/diagnostic shape changed but the bottom
   * line is identical, which the UI surfaces with a dedicated label so
   * admins can ignore those rows. Omitted entirely for skipped/failed
   * results.
   */
  metricDeltas?: ReportMetricDelta[];
  error?: string;
  durationMs: number;
}

export interface BackfillSummary {
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs: number;
  results: BackfillReportResult[];
}

/**
 * Wire-format snapshot of one completed admin backfill run, persisted in
 * the `admin_last_backfill` singleton table by the admin route handler so
 * the Admin page can rehydrate the post-run summary on refresh. Mirrors
 * the JSON the streaming `complete` event sends to the browser, minus the
 * optional `results` array (which is only used in `verbose=1` mode and is
 * not part of the rehydrated UI state).
 *
 * Kept as an explicit named type so storage signatures don't have to use
 * `unknown` / `any` and so a future change to the wire format produces a
 * single TS error at the persistence boundary instead of silently writing
 * an unexpected shape into the JSONB column.
 */
export interface PersistedBackfillSummary {
  success: true;
  force: boolean;
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs: number;
  /**
   * Failed report records, in the same shape the streaming `complete`
   * event uses. The "Retry these" button on the Admin page reads `id`
   * fields out of this array.
   */
  failures: BackfillReportResult[];
}

export interface BackfillOptions {
  /** Reprocess every report regardless of the staleness check. */
  force?: boolean;
  /**
   * Optional whitelist of report IDs to process. When provided as a non-empty
   * array, every report outside this set is silently filtered out before the
   * run begins (it does not contribute to total/skipped counts). The
   * retry-failures path on the Admin page uses this to re-run only the
   * report IDs that failed in the previous backfill, so a 5-failure retry
   * doesn't pay the cost of iterating over hundreds of healthy reports
   * again.
   *
   * An empty array is treated as "no filter" (i.e. full run) at this layer
   * so internal callers (e.g. the CLI script in
   * `scripts/backfill-reports-v21.ts`) don't have to special-case it. The
   * HTTP route layer (`POST /api/admin/backfill-reports`, see
   * `parseOnlyIdsFromBody`) is stricter and rejects an empty array with 400
   * because the only legitimate way to request a full run from the wire is
   * to omit the `onlyIds` key entirely.
   */
  onlyIds?: string[];
  /**
   * Optional callback fired exactly once, before any report is processed,
   * with the total number of reports the run will iterate over. Useful for
   * streaming consumers that want to render a progress bar immediately
   * (even before the first report finishes).
   */
  onStart?: (total: number) => void;
  /** Optional callback fired after each report. Useful for CLI progress logs. */
  onProgress?: (
    index: number,
    total: number,
    result: BackfillReportResult,
  ) => void;
}

/**
 * Re-run `postProcessAnalysis` over every report in storage and persist the
 * upgraded shape. Skips reports that already match the v2.1 contract unless
 * `force` is set.
 */
export async function backfillAllReports(
  opts: BackfillOptions = {},
): Promise<BackfillSummary> {
  const { force = false, onlyIds, onStart, onProgress } = opts;
  const startedAt = Date.now();
  const fetched: Report[] = await storage.getAllReports();
  // When the caller passes an explicit allow-list (e.g. the "Retry these"
  // button on /admin), narrow the iteration set to just those IDs so the
  // total/processed counts and the streamed progress events reflect only
  // the work the operator actually asked for. We preserve storage order so
  // the run is deterministic regardless of input ordering.
  const allReports: Report[] =
    onlyIds && onlyIds.length > 0
      ? (() => {
          const allow = new Set(onlyIds);
          return fetched.filter((r) => allow.has(r.id));
        })()
      : fetched;
  onStart?.(allReports.length);
  const results: BackfillReportResult[] = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < allReports.length; i++) {
    const report = allReports[i];
    const reportStartedAt = Date.now();
    let result: BackfillReportResult;

    try {
      const analysis = report.analysisData as any;
      if (!analysis?.steps || !Array.isArray(analysis.steps)) {
        result = {
          id: report.id,
          companyName: report.companyName,
          isWhatIf: !!report.isWhatIf,
          status: "skipped",
          reasons: ["no-steps"],
          durationMs: Date.now() - reportStartedAt,
        };
        skipped++;
      } else {
        const staleness = evaluateReportStaleness(analysis);
        if (!force && !staleness.stale) {
          result = {
            id: report.id,
            companyName: report.companyName,
            isWhatIf: !!report.isWhatIf,
            status: "skipped",
            reasons: ["already-v2.1"],
            durationMs: Date.now() - reportStartedAt,
          };
          skipped++;
        } else {
          // Snapshot the headline numbers BEFORE the post-processor runs so we
          // can tell the operator whether the upgrade actually moved the
          // bottom line. We have to take this snapshot now (before the
          // in-place mutations inside `postProcessAnalysis` overwrite the
          // executive dashboard / vrm.diagnostic fields).
          const beforeMetrics = snapshotReportMetrics(analysis);
          const reprocessed = await postProcessAnalysis(analysis);
          await storage.updateReport(report.id, {
            analysisData: reprocessed,
          });
          // Diff the staleness signals to surface exactly which schema-level
          // upgrades the post-processor applied (e.g. bumped schema, added
          // VRM diagnostic, synthesized Step 6 KO fields). The diff is
          // computed off the in-memory reprocessed analysis to avoid a
          // second storage round-trip.
          const afterStaleness = evaluateReportStaleness(reprocessed);
          const upgrades = computeUpgradesApplied(staleness, afterStaleness);
          // Same idea, one level up: diff the headline numbers so admins
          // can see that "bumped schema 2.0 → 2.2" actually moved Total
          // Value $1.2M → $1.4M, instead of having to open the report.
          const afterMetrics = snapshotReportMetrics(reprocessed);
          const metricDeltas = computeMetricDeltas(beforeMetrics, afterMetrics);
          result = {
            id: report.id,
            companyName: report.companyName,
            isWhatIf: !!report.isWhatIf,
            status: "updated",
            reasons: force && !staleness.stale ? ["forced"] : staleness.reasons,
            upgrades,
            metricDeltas,
            durationMs: Date.now() - reportStartedAt,
          };
          updated++;
        }
      }
    } catch (err: any) {
      result = {
        id: report.id,
        companyName: report.companyName,
        isWhatIf: !!report.isWhatIf,
        status: "failed",
        error: err?.message ?? String(err),
        durationMs: Date.now() - reportStartedAt,
      };
      failed++;
    }

    results.push(result);
    onProgress?.(i + 1, allReports.length, result);
  }

  return {
    total: allReports.length,
    updated,
    skipped,
    failed,
    durationMs: Date.now() - startedAt,
    results,
  };
}
