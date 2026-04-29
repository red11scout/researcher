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
  const { force = false, onStart, onProgress } = opts;
  const startedAt = Date.now();
  const allReports: Report[] = await storage.getAllReports();
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
