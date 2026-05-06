export interface ReportUpgrade {
  code:
    | "added-step6"
    | "bumped-schema"
    | "added-diagnostic"
    | "added-flat-fields"
    | "added-step6-ko-fields";
  label: string;
}

// Mirrors `ReportMetricDelta` in server/report-backfill.ts. Each entry is
// one headline number that changed during the backfill (Total annual value,
// Lead Champion count, etc.) so admins can tell whether a "bumped schema"
// migration actually moved the bottom line or was just cosmetic.
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
  delta: number;
  unit: "money" | "count";
}

export interface BackfillReportResult {
  id: string;
  companyName: string;
  isWhatIf: boolean;
  status: "updated" | "skipped" | "failed";
  reasons?: string[];
  upgrades?: ReportUpgrade[];
  metricDeltas?: ReportMetricDelta[];
  error?: string;
  durationMs: number;
}
