/**
 * Pure export formatters for bulk report export.
 *
 * INVARIANT (calculation-determinism gate): these formatters MUST be
 * dumb pass-throughs of the post-processor's canonical payload. They
 * never recompute, re-sum, round, or invent numeric values. Every
 * number that reaches an exported file must already be present in the
 * input `analysisData` blob produced by `postProcessAnalysis`.
 *
 * If you find yourself reaching for arithmetic in this file, stop:
 * the right place to add the calculation is `src/calc/` /
 * `server/calculation-postprocessor.ts`, then surface the result on
 * `analysisData` so every export format reads the same number.
 *
 * Covered by `tests/export-formatters.test.ts` (cross-format
 * numeric-consistency suite).
 */

export interface ExportableReport {
  id: string;
  companyName: string;
  /**
   * Optional presentation-only override; absent or null means "use
   * companyName". Filenames and identifiers must always use companyName.
   */
  displayName?: string | null;
  createdAt?: Date | string | null;
  analysisData: unknown;
}

/**
 * Resolve the user-facing name for a report. Returns the trimmed
 * `displayName` when set, otherwise the canonical `companyName`.
 */
function resolveReportName(report: ExportableReport): string {
  const dn = typeof report.displayName === "string" ? report.displayName.trim() : "";
  return dn || report.companyName;
}

export interface ExportContext {
  reportType: string;
  exportedAt: string;
}

/**
 * JSON export: emits the canonical analysisData verbatim under `data`.
 *
 * Returned object's `data` field is reference-equal to
 * `report.analysisData` so the cross-format test can assert pure
 * pass-through (no copy, no transformation).
 */
export function formatReportAsJson(
  report: ExportableReport,
  ctx: ExportContext,
): {
  company: string;
  displayName: string | null;
  reportType: string;
  exportedAt: string;
  data: unknown;
} {
  return {
    company: report.companyName,
    // Top-level displayName lets a downstream import re-establish the
    // override without having to crack the analysisData blob.
    displayName: report.displayName ?? null,
    reportType: ctx.reportType,
    exportedAt: ctx.exportedAt,
    data: report.analysisData,
  };
}

/**
 * Markdown export: emits header + summary + each step's content
 * verbatim. Never extracts or reformats numeric values.
 */
export function formatReportAsMarkdown(
  report: ExportableReport,
  ctx: ExportContext,
): string {
  const analysisData = report.analysisData as
    | {
        summary?: string;
        steps?: Array<{
          step?: number;
          title?: string;
          content?: string;
        }>;
      }
    | null
    | undefined;

  let content = `# ${resolveReportName(report)} - ${ctx.reportType} Report\n\n`;
  content += `**Generated:** ${ctx.exportedAt}\n\n`;
  content += `## Summary\n\n${analysisData?.summary ?? "No summary available"}\n\n`;
  if (analysisData?.steps) {
    for (const step of analysisData.steps) {
      content += `## ${step.title || `Step ${step.step}`}\n\n`;
      content += `${step.content || ""}\n\n`;
    }
  }
  return content;
}
