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

export interface BackfillReportResult {
  id: string;
  companyName: string;
  isWhatIf: boolean;
  status: "updated" | "skipped" | "failed";
  reasons?: string[];
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
  const { force = false, onProgress } = opts;
  const startedAt = Date.now();
  const allReports: Report[] = await storage.getAllReports();
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
          result = {
            id: report.id,
            companyName: report.companyName,
            isWhatIf: !!report.isWhatIf,
            status: "updated",
            reasons: force && !staleness.stale ? ["forced"] : staleness.reasons,
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
