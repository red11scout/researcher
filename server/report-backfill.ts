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

  if (!hasStep6) reasons.push("missing-step6");
  if (vrmSchemaVersion !== VRM_SCHEMA_VERSION)
    reasons.push(`vrm-schema=${vrmSchemaVersion ?? "missing"}`);
  if (!hasV21Diagnostic) reasons.push("missing-diagnostic");
  if (!hasFlatFields) reasons.push("missing-flat-fields");
  if (!hasStep6KOFields) reasons.push("missing-step6-knockout-fields");

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
          result = {
            id: report.id,
            companyName: report.companyName,
            isWhatIf: !!report.isWhatIf,
            status: "updated",
            reasons: force && !staleness.stale ? ["forced"] : staleness.reasons,
            upgrades,
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
