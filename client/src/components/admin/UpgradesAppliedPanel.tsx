import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MetricDeltaChip } from "./MetricDeltaChip";
import type { BackfillReportResult } from "./types";

interface UpgradesAppliedPanelProps {
  updated: BackfillReportResult[];
}

// localStorage key for the "Show only reports with headline changes" toggle.
// Persisting it means admins who consistently want the filter on don't have
// to flip it back on every visit. Default for first-time visitors stays
// "off" (any non-"true" value, including missing/unparseable, is treated
// as off).
export const HIDE_SCHEMA_ONLY_STORAGE_KEY = "admin.upgrades.hideSchemaOnly";

function readPersistedHideSchemaOnly(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIDE_SCHEMA_ONLY_STORAGE_KEY) === "true";
  } catch {
    // localStorage can throw in private mode or when disabled by policy.
    // Fall back to the default (off) rather than crashing the panel.
    return false;
  }
}

/**
 * Post-run summary panel that groups every "updated" report by which schema
 * upgrades were applied. Each upgrade code lists its count and a few example
 * companies so admins can spot patterns (e.g. "every legacy report needed
 * the diagnostic added"). Reports that got `force=true`-reprocessed without
 * any schema-level diff are surfaced in their own bucket so they don't look
 * like a missing case.
 */
export function UpgradesAppliedPanel({ updated }: UpgradesAppliedPanelProps) {
  const { toast } = useToast();
  const copyIds = async (ids: string[], bucketLabel: string) => {
    const text = ids.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${ids.length} report ID${ids.length === 1 ? "" : "s"} from "${bucketLabel}" copied.`,
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access. Please copy manually.",
        variant: "destructive",
      });
    }
  };

  // Aggregate by upgrade code. One report can contribute to multiple buckets
  // (e.g. a v2.0 → v2.2 migration usually adds the diagnostic AND bumps the
  // schema AND synthesizes Step 6 KO fields).
  const buckets = new Map<
    string,
    { label: string; reports: BackfillReportResult[] }
  >();
  // Reports that had NO schema upgrades AND no metric movement — typical
  // for force=true reruns of already-fresh reports. Tracked as a list so
  // admins can expand the bucket and copy the IDs (e.g. to spot-check
  // which reports were touched by a no-op rerun).
  const reprocessedNoChangeReports: BackfillReportResult[] = [];
  // Reports that had at least one schema upgrade applied but where every
  // headline number stayed the same — surfaced separately so admins can
  // immediately ignore them ("the schema bumped but the bottom line did
  // not move, no need to re-read the report"). Tracked as a list so the
  // bucket can be expanded and its IDs copied.
  const schemaOnlyReports: BackfillReportResult[] = [];
  // Reports that had NO schema upgrades but whose headline numbers still
  // moved — typically a force=true rerun where the post-processor's
  // calculation logic shifted since the report was last persisted. These
  // are the most surprising case (no schema diff would suggest "nothing
  // changed") so we surface them in their own bucket with full delta
  // chips, not buried inside the generic "Reprocessed (no schema
  // changes)" count.
  const reprocessedWithMetricChange: BackfillReportResult[] = [];

  for (const r of updated) {
    const upgrades = r.upgrades ?? [];
    if (upgrades.length === 0) {
      if (r.metricDeltas && r.metricDeltas.length > 0) {
        reprocessedWithMetricChange.push(r);
      } else {
        reprocessedNoChangeReports.push(r);
      }
      continue;
    }
    if (!r.metricDeltas || r.metricDeltas.length === 0) {
      schemaOnlyReports.push(r);
    }
    for (const u of upgrades) {
      const existing = buckets.get(u.code);
      if (existing) {
        existing.reports.push(r);
      } else {
        buckets.set(u.code, { label: u.label, reports: [r] });
      }
    }
  }

  // Sort by frequency desc so the most common upgrade is at the top — that's
  // the "pattern" the admin most likely wants to see first.
  const sorted = Array.from(buckets.entries())
    .map(([code, value]) => ({ code, ...value }))
    .sort((a, b) => b.reports.length - a.reports.length);

  // Track which buckets are expanded. Buckets are collapsed by default so the
  // panel stays compact; admins can click the header to drill into the full
  // list of reports in that bucket without leaving the page.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // When on, hide reports inside each upgrade bucket whose `metricDeltas`
  // is empty (the "schema-only" rows already labeled inline) so admins can
  // focus on the reports that actually moved a headline number. The state
  // lives on the panel itself so it survives expanding/collapsing buckets,
  // and is persisted to localStorage so it also survives navigating away
  // and back to the Admin page.
  const [hideSchemaOnly, setHideSchemaOnly] = useState<boolean>(
    readPersistedHideSchemaOnly,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        HIDE_SCHEMA_ONLY_STORAGE_KEY,
        hideSchemaOnly ? "true" : "false",
      );
    } catch {
      // Swallow storage errors (private mode, quota, disabled by policy);
      // the in-memory state still works for the current session.
    }
  }, [hideSchemaOnly]);

  const filterReports = (reports: BackfillReportResult[]) =>
    hideSchemaOnly
      ? reports.filter((r) => r.metricDeltas && r.metricDeltas.length > 0)
      : reports;

  if (
    sorted.length === 0 &&
    reprocessedNoChangeReports.length === 0 &&
    reprocessedWithMetricChange.length === 0
  )
    return null;

  return (
    <div
      className="rounded-lg border border-slate-200 overflow-hidden"
      data-testid="panel-upgrades-applied"
    >
      <div className="bg-slate-50 px-4 py-2 flex items-center gap-2 border-b border-slate-200">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-medium text-slate-700">
          Upgrades applied
        </span>
        <span className="text-xs text-slate-500">
          (grouped by change, most common first — click a row to see every
          report)
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Switch
            id="toggle-hide-schema-only-upgrades"
            checked={hideSchemaOnly}
            onCheckedChange={setHideSchemaOnly}
            data-testid="switch-hide-schema-only-upgrades"
          />
          <Label
            htmlFor="toggle-hide-schema-only-upgrades"
            className="text-xs text-slate-600 cursor-pointer"
            data-testid="label-hide-schema-only-upgrades"
          >
            Show only reports with headline changes
          </Label>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {sorted.map((bucket) => {
          const visibleReports = filterReports(bucket.reports);
          const examples = visibleReports.slice(0, 3);
          const remaining = visibleReports.length - examples.length;
          const isOpen = expanded.has(bucket.code);
          return (
            <li
              key={bucket.code}
              data-testid={`row-upgrade-bucket-${bucket.code}`}
            >
              <button
                type="button"
                onClick={() => toggle(bucket.code)}
                aria-expanded={isOpen}
                className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-inset"
                data-testid={`button-toggle-upgrade-${bucket.code}`}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                )}
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700 font-medium tabular-nums shrink-0"
                  data-testid={`count-upgrade-${bucket.code}`}
                >
                  {hideSchemaOnly
                    ? `${visibleReports.length} of ${bucket.reports.length}`
                    : bucket.reports.length}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium text-slate-900"
                    data-testid={`label-upgrade-${bucket.code}`}
                  >
                    {bucket.label}
                  </div>
                  <div
                    className="text-xs text-slate-500 mt-0.5 truncate"
                    data-testid={`examples-upgrade-${bucket.code}`}
                  >
                    {examples.length === 0
                      ? hideSchemaOnly
                        ? "No reports moved a headline number"
                        : ""
                      : examples.map((r) => r.companyName).join(", ")}
                    {remaining > 0 && ` and ${remaining} more`}
                  </div>
                </div>
              </button>
              {isOpen && (
                <div
                  className="px-4 pb-3 pl-11"
                  data-testid={`details-upgrade-${bucket.code}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500">
                      {hideSchemaOnly
                        ? `${visibleReports.length} of ${bucket.reports.length} report${bucket.reports.length === 1 ? "" : "s"} moved a headline number`
                        : `${bucket.reports.length} report${bucket.reports.length === 1 ? "" : "s"} in this bucket`}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() =>
                        copyIds(
                          visibleReports.map((r) => r.id),
                          bucket.label,
                        )
                      }
                      disabled={visibleReports.length === 0}
                      data-testid={`button-copy-ids-upgrade-${bucket.code}`}
                    >
                      <Copy className="h-3 w-3" />
                      Copy IDs
                    </Button>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white max-h-64 overflow-auto">
                    <table className="w-full text-xs font-mono">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">
                            Company
                          </th>
                          <th className="text-left px-3 py-1.5 font-medium">
                            Report ID
                          </th>
                          <th className="text-left px-3 py-1.5 font-medium">
                            What-if
                          </th>
                          <th className="text-left px-3 py-1.5 font-medium">
                            Headline changes
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleReports.length === 0 && (
                          <tr
                            data-testid={`row-upgrade-empty-${bucket.code}`}
                          >
                            <td
                              colSpan={4}
                              className="px-3 py-3 text-center text-slate-400 italic"
                            >
                              All {bucket.reports.length} report
                              {bucket.reports.length === 1 ? "" : "s"} in this
                              bucket were schema-only — toggle off the filter
                              above to see them.
                            </td>
                          </tr>
                        )}
                        {visibleReports.map((r) => (
                          <tr
                            key={r.id}
                            className="hover:bg-slate-50 align-top"
                            data-testid={`row-upgrade-report-${bucket.code}-${r.id}`}
                          >
                            <td
                              className="px-3 py-1.5 text-slate-700 select-text"
                              data-testid={`text-upgrade-company-${bucket.code}-${r.id}`}
                            >
                              {r.companyName}
                            </td>
                            <td
                              className="px-3 py-1.5 text-slate-600 select-all"
                              data-testid={`text-upgrade-report-id-${bucket.code}-${r.id}`}
                            >
                              <a
                                href={
                                  r.isWhatIf
                                    ? `/whatif/${r.id}`
                                    : `/reports/${r.id}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                                title={
                                  r.isWhatIf
                                    ? "Open what-if report in new tab"
                                    : "Open report in new tab"
                                }
                                onClick={(e) => {
                                  const sel = window.getSelection();
                                  if (!sel || sel.toString().length === 0) {
                                    return;
                                  }
                                  const link = e.currentTarget;
                                  const inAnchor =
                                    sel.anchorNode &&
                                    link.contains(sel.anchorNode);
                                  const inFocus =
                                    sel.focusNode &&
                                    link.contains(sel.focusNode);
                                  if (inAnchor || inFocus) {
                                    e.preventDefault();
                                  }
                                }}
                                data-testid={`link-upgrade-report-${bucket.code}-${r.id}`}
                              >
                                {r.id}
                              </a>
                            </td>
                            <td
                              className="px-3 py-1.5 text-slate-500"
                              data-testid={`text-upgrade-whatif-${bucket.code}-${r.id}`}
                            >
                              {r.isWhatIf ? "yes" : "no"}
                            </td>
                            <td
                              className="px-3 py-1.5"
                              data-testid={`text-upgrade-deltas-${bucket.code}-${r.id}`}
                            >
                              {r.metricDeltas && r.metricDeltas.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {r.metricDeltas.map((d) => (
                                    <MetricDeltaChip
                                      key={`${r.id}-${d.code}`}
                                      delta={d}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <span
                                  className="text-slate-400 italic"
                                  data-testid={`text-upgrade-deltas-empty-${bucket.code}-${r.id}`}
                                >
                                  schema-only
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {reprocessedWithMetricChange.length > 0 && (
          <li
            data-testid="row-upgrade-bucket-metric-only"
          >
            <button
              type="button"
              onClick={() => toggle("__metric_only__")}
              aria-expanded={expanded.has("__metric_only__")}
              className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-inset"
              data-testid="button-toggle-upgrade-metric-only"
            >
              {expanded.has("__metric_only__") ? (
                <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              )}
              <Badge
                variant="outline"
                className="border-sky-200 bg-sky-50 text-sky-700 font-medium tabular-nums shrink-0"
                data-testid="count-upgrade-metric-only"
              >
                {reprocessedWithMetricChange.length}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900">
                  Reprocessed — headline numbers moved (no schema change)
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  No schema/diagnostic shape changed, but the post-processor
                  produced different totals or counts on rerun — usually means
                  a calculation rule shifted since this report was last
                  persisted. Worth a closer look.
                </div>
              </div>
            </button>
            {expanded.has("__metric_only__") && (
              <div
                className="px-4 pb-3 pl-11"
                data-testid="details-upgrade-metric-only"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">
                    {reprocessedWithMetricChange.length} report
                    {reprocessedWithMetricChange.length === 1 ? "" : "s"} in
                    this bucket
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() =>
                      copyIds(
                        reprocessedWithMetricChange.map((r) => r.id),
                        "Reprocessed — headline numbers moved (no schema change)",
                      )
                    }
                    data-testid="button-copy-ids-upgrade-metric-only"
                  >
                    <Copy className="h-3 w-3" />
                    Copy IDs
                  </Button>
                </div>
                <div className="rounded-md border border-slate-200 bg-white max-h-64 overflow-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium">
                          Company
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium">
                          Report ID
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium">
                          Headline changes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reprocessedWithMetricChange.map((r) => (
                        <tr
                          key={r.id}
                          className="hover:bg-slate-50 align-top"
                          data-testid={`row-upgrade-metric-only-${r.id}`}
                        >
                          <td
                            className="px-3 py-1.5 text-slate-700 select-text"
                            data-testid={`text-upgrade-metric-only-company-${r.id}`}
                          >
                            {r.companyName}
                          </td>
                          <td
                            className="px-3 py-1.5 text-slate-600 select-all"
                            data-testid={`text-upgrade-metric-only-report-id-${r.id}`}
                          >
                            {r.id}
                          </td>
                          <td
                            className="px-3 py-1.5"
                            data-testid={`text-upgrade-metric-only-deltas-${r.id}`}
                          >
                            <div className="flex flex-wrap gap-1">
                              {(r.metricDeltas ?? []).map((d) => (
                                <MetricDeltaChip
                                  key={`${r.id}-${d.code}`}
                                  delta={d}
                                />
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </li>
        )}
        {schemaOnlyReports.length > 0 && (
          <li data-testid="row-upgrade-bucket-schema-only">
            <button
              type="button"
              onClick={() => toggle("__schema_only__")}
              aria-expanded={expanded.has("__schema_only__")}
              className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-inset"
              data-testid="button-toggle-upgrade-schema-only"
            >
              {expanded.has("__schema_only__") ? (
                <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              )}
              <Badge
                variant="outline"
                className="border-slate-200 bg-slate-50 text-slate-600 font-medium tabular-nums shrink-0"
                data-testid="count-upgrade-schema-only"
              >
                {schemaOnlyReports.length}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700">
                  Schema-only (no headline numbers moved)
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  The schema/diagnostic shape changed but the executive
                  dashboard totals and portfolio counts stayed the same — safe
                  to ignore unless you specifically want to audit the new
                  shape. (Counted across the upgrade buckets above.)
                </div>
              </div>
            </button>
            {expanded.has("__schema_only__") && (
              <div
                className="px-4 pb-3 pl-11"
                data-testid="details-upgrade-schema-only"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">
                    {schemaOnlyReports.length} report
                    {schemaOnlyReports.length === 1 ? "" : "s"} in this bucket
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() =>
                      copyIds(
                        schemaOnlyReports.map((r) => r.id),
                        "Schema-only (no headline numbers moved)",
                      )
                    }
                    data-testid="button-copy-ids-upgrade-schema-only"
                  >
                    <Copy className="h-3 w-3" />
                    Copy IDs
                  </Button>
                </div>
                <div className="rounded-md border border-slate-200 bg-white max-h-64 overflow-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium">
                          Company
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium">
                          Report ID
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium">
                          What-if
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {schemaOnlyReports.map((r) => (
                        <tr
                          key={r.id}
                          className="hover:bg-slate-50 align-top"
                          data-testid={`row-upgrade-schema-only-${r.id}`}
                        >
                          <td
                            className="px-3 py-1.5 text-slate-700 select-text"
                            data-testid={`text-upgrade-schema-only-company-${r.id}`}
                          >
                            {r.companyName}
                          </td>
                          <td
                            className="px-3 py-1.5 text-slate-600 select-all"
                            data-testid={`text-upgrade-schema-only-report-id-${r.id}`}
                          >
                            {r.id}
                          </td>
                          <td
                            className="px-3 py-1.5 text-slate-500"
                            data-testid={`text-upgrade-schema-only-whatif-${r.id}`}
                          >
                            {r.isWhatIf ? "yes" : "no"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </li>
        )}
        {reprocessedNoChangeReports.length > 0 && (
          <li data-testid="row-upgrade-bucket-no-change">
            <button
              type="button"
              onClick={() => toggle("__no_change__")}
              aria-expanded={expanded.has("__no_change__")}
              className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-inset"
              data-testid="button-toggle-upgrade-no-change"
            >
              {expanded.has("__no_change__") ? (
                <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              )}
              <Badge
                variant="outline"
                className="border-slate-200 bg-slate-50 text-slate-600 font-medium tabular-nums shrink-0"
                data-testid="count-upgrade-no-change"
              >
                {reprocessedNoChangeReports.length}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700">
                  Reprocessed (no schema changes)
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Re-ran the post-processor without changing the staleness
                  signals — typical for forced reruns of already-fresh reports.
                </div>
              </div>
            </button>
            {expanded.has("__no_change__") && (
              <div
                className="px-4 pb-3 pl-11"
                data-testid="details-upgrade-no-change"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">
                    {reprocessedNoChangeReports.length} report
                    {reprocessedNoChangeReports.length === 1 ? "" : "s"} in
                    this bucket
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() =>
                      copyIds(
                        reprocessedNoChangeReports.map((r) => r.id),
                        "Reprocessed (no schema changes)",
                      )
                    }
                    data-testid="button-copy-ids-upgrade-no-change"
                  >
                    <Copy className="h-3 w-3" />
                    Copy IDs
                  </Button>
                </div>
                <div className="rounded-md border border-slate-200 bg-white max-h-64 overflow-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium">
                          Company
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium">
                          Report ID
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium">
                          What-if
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reprocessedNoChangeReports.map((r) => (
                        <tr
                          key={r.id}
                          className="hover:bg-slate-50 align-top"
                          data-testid={`row-upgrade-no-change-${r.id}`}
                        >
                          <td
                            className="px-3 py-1.5 text-slate-700 select-text"
                            data-testid={`text-upgrade-no-change-company-${r.id}`}
                          >
                            {r.companyName}
                          </td>
                          <td
                            className="px-3 py-1.5 text-slate-600 select-all"
                            data-testid={`text-upgrade-no-change-report-id-${r.id}`}
                          >
                            {r.id}
                          </td>
                          <td
                            className="px-3 py-1.5 text-slate-500"
                            data-testid={`text-upgrade-no-change-whatif-${r.id}`}
                          >
                            {r.isWhatIf ? "yes" : "no"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
