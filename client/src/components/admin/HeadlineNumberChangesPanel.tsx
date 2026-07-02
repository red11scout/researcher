import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MetricDeltaChip } from "./MetricDeltaChip";
import type { BackfillReportResult, ReportMetricDelta } from "./types";

// Display labels for each headline-metric code, mirrored from the `name`
// column in `computeMetricDeltas` in server/report-backfill.ts. Kept here
// (rather than read off the per-report delta labels, which embed numbers
// like "Total value $1.2M → $1.4M") so the cross-run bucket header reads
// as a clean metric name even before any row is expanded.
const METRIC_LABELS: Record<ReportMetricDelta["code"], string> = {
  "total-annual-value": "Total value",
  "prototyping-candidates": "Prototyping candidates",
  "lead-champion-count": "Lead Champions",
  "champion-count": "Champions",
  "conditional-champion-count": "Conditional Champions",
  "quick-win-count": "Quick Wins",
  "strategic-count": "Strategic",
  "foundation-count": "Foundation",
  "total-use-cases": "Total use cases",
};

// Stable display order for headline-metric buckets when two metrics moved
// on exactly the same number of reports. Mirrors the field order used by
// `computeMetricDeltas` (money first, then portfolio counts in roughly
// "most useful" order) so the cross-run panel and the per-report chip row
// stay visually aligned.
const METRIC_ORDER: ReportMetricDelta["code"][] = [
  "total-annual-value",
  "prototyping-candidates",
  "lead-champion-count",
  "champion-count",
  "conditional-champion-count",
  "quick-win-count",
  "strategic-count",
  "foundation-count",
  "total-use-cases",
];

interface HeadlineNumberChangesPanelProps {
  updated: BackfillReportResult[];
}

/**
 * Cross-run summary panel that buckets every "updated" report by *which
 * headline number moved* — the orthogonal view to `UpgradesAppliedPanel`,
 * which buckets by which schema upgrade was applied. Answers "across this
 * whole run, how many reports had Total value move? how many lost Lead
 * Champions?" without requiring the admin to expand every schema bucket
 * and scan the per-report delta chips by hand.
 *
 * Buckets are sorted by frequency desc, then by the canonical
 * `METRIC_ORDER` for deterministic ties. A report can contribute to
 * multiple buckets when more than one headline number moved (a v2.0
 * → v2.2 migration that synthesizes the diagnostic block usually moves
 * Total value AND a portfolio count).
 *
 * Empty state: when no updated report had any headline number move (every
 * upgrade was schema-only), we render a single info row instead of
 * hiding — the *absence* of bottom-line movement is itself useful info
 * for the admin reviewing the run.
 */
export function HeadlineNumberChangesPanel({
  updated,
}: HeadlineNumberChangesPanelProps) {
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
        description:
          "Your browser blocked clipboard access. Please copy manually.",
        variant: "destructive",
      });
    }
  };

  // Aggregate by metric code across every updated report. We keep the
  // full delta (not just the report) so the expanded table can render the
  // before/after columns and the colored chip without a second lookup.
  const buckets = new Map<
    ReportMetricDelta["code"],
    { label: string; entries: Array<{ report: BackfillReportResult; delta: ReportMetricDelta }> }
  >();
  for (const r of updated) {
    for (const d of r.metricDeltas ?? []) {
      // Defensive: a delta with `delta === 0` should never reach the UI
      // (the server filters those out in `computeMetricDeltas`), but
      // double-check here so a future server bug can't silently inflate
      // the bucket counts.
      if (d.delta === 0) continue;
      const existing = buckets.get(d.code);
      if (existing) {
        existing.entries.push({ report: r, delta: d });
      } else {
        buckets.set(d.code, {
          label: METRIC_LABELS[d.code] ?? d.code,
          entries: [{ report: r, delta: d }],
        });
      }
    }
  }

  const sorted = Array.from(buckets.entries())
    .map(([code, value]) => ({ code, ...value }))
    .sort((a, b) => {
      if (b.entries.length !== a.entries.length) {
        return b.entries.length - a.entries.length;
      }
      return METRIC_ORDER.indexOf(a.code) - METRIC_ORDER.indexOf(b.code);
    });

  // "Regressions only" toggle: when on, hide every bucket whose downCount
  // is 0 so an admin reviewing a "bumped schema" backfill can immediately
  // see only the buckets where the run made a metric move *down* on at
  // least one report. Intentionally not persisted — each new run starts
  // showing the full picture.
  const [regressionsOnly, setRegressionsOnly] = useState(false);
  // Reset the filter whenever a new backfill run replaces the `updated`
  // array — admins typically want to see the full picture first when a
  // fresh run lands, then opt back into the regressions-only view.
  useEffect(() => {
    setRegressionsOnly(false);
  }, [updated]);
  const visible = regressionsOnly
    ? sorted.filter((bucket) =>
        bucket.entries.some((e) => e.delta.delta < 0),
      )
    : sorted;

  // Run-wide roll-up: total upward / downward metric movements across
  // every bucket, plus the number of distinct reports that contributed
  // at least one movement. Computed from `sorted` (the unfiltered set)
  // so the summary always describes the *whole run* — toggling
  // "Regressions only" hides buckets but doesn't change the verdict
  // line. A single report can contribute multiple movements (one per
  // metric that moved), so totalUp + totalDown >= reportsContributing.
  let totalUp = 0;
  let totalDown = 0;
  const contributingReportIds = new Set<string>();
  for (const bucket of sorted) {
    for (const e of bucket.entries) {
      if (e.delta.delta > 0) totalUp += 1;
      else if (e.delta.delta < 0) totalDown += 1;
      contributingReportIds.add(e.report.id);
    }
  }
  const reportsContributing = contributingReportIds.size;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <div
      className="rounded-lg border border-slate-200 overflow-hidden"
      data-testid="panel-headline-changes"
    >
      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-sky-600" />
          <span className="text-sm font-medium text-slate-700">
            Headline number changes
          </span>
          <span className="text-xs text-slate-500">
            (grouped by which metric moved, most common first — click a row to
            see every report)
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Switch
              id="toggle-headline-regressions-only"
              checked={regressionsOnly}
              onCheckedChange={setRegressionsOnly}
              data-testid="switch-headline-regressions-only"
            />
            <Label
              htmlFor="toggle-headline-regressions-only"
              className="text-xs text-slate-600 cursor-pointer"
              data-testid="label-headline-regressions-only"
            >
              Regressions only
            </Label>
          </div>
        </div>
        {sorted.length > 0 && (
          <div
            className="mt-1.5 flex items-center gap-2 text-xs text-slate-600 tabular-nums"
            data-testid="summary-headline-runwide"
          >
            <span
              className="inline-flex items-center gap-0.5 font-medium text-sky-700"
              data-testid="summary-headline-up"
            >
              <ArrowUp className="h-3 w-3" aria-hidden="true" />
              {totalUp} metric movement{totalUp === 1 ? "" : "s"} up
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span
              className="inline-flex items-center gap-0.5 font-medium text-amber-700"
              data-testid="summary-headline-down"
            >
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
              {totalDown} down
            </span>
            <span
              data-testid="summary-headline-reports"
            >
              across {reportsContributing} report
              {reportsContributing === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>
      {sorted.length === 0 ? (
        <div
          className="px-4 py-3 text-sm text-slate-600"
          data-testid="text-headline-changes-empty"
        >
          No headline numbers moved across this run — every upgrade was
          schema-only.
        </div>
      ) : visible.length === 0 ? (
        <div
          className="px-4 py-3 text-sm text-slate-600"
          data-testid="text-headline-no-regressions"
        >
          No regressions in this run.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visible.map((bucket) => {
            const exampleCompanies = Array.from(
              new Set(bucket.entries.map((e) => e.report.companyName)),
            ).slice(0, 3);
            const totalCompanies = new Set(
              bucket.entries.map((e) => e.report.companyName),
            ).size;
            const remaining = totalCompanies - exampleCompanies.length;
            const isOpen = expanded.has(bucket.code);
            // Direction split: how many reports moved this metric upward vs.
            // downward. Surfaced inline in the bucket header so admins can
            // spot regressions (e.g. a "bumped schema" upgrade that DROPS
            // Total value across 5 reports) without expanding the row to
            // scan the colored chips. Each side collapses when zero so a
            // run with strictly-positive movement reads as a single up
            // counter rather than a misleading "+12 / -0".
            const upCount = bucket.entries.filter(
              (e) => e.delta.delta > 0,
            ).length;
            const downCount = bucket.entries.filter(
              (e) => e.delta.delta < 0,
            ).length;
            return (
              <li
                key={bucket.code}
                data-testid={`row-headline-bucket-${bucket.code}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(bucket.code)}
                  aria-expanded={isOpen}
                  className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-inset"
                  data-testid={`button-toggle-headline-${bucket.code}`}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  )}
                  <Badge
                    variant="outline"
                    className="border-sky-200 bg-sky-50 text-sky-700 font-medium tabular-nums shrink-0"
                    data-testid={`count-headline-${bucket.code}`}
                  >
                    {bucket.entries.length}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium text-slate-900"
                      data-testid={`label-headline-${bucket.code}`}
                    >
                      {bucket.label}
                    </div>
                    <div
                      className="text-xs text-slate-500 mt-0.5 truncate"
                      data-testid={`examples-headline-${bucket.code}`}
                    >
                      {exampleCompanies.join(", ")}
                      {remaining > 0 && ` and ${remaining} more`}
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1.5 shrink-0 mt-0.5"
                    data-testid={`split-headline-${bucket.code}`}
                  >
                    {upCount > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-sky-700 tabular-nums"
                        title={`${upCount} report${upCount === 1 ? "" : "s"} moved up`}
                        data-testid={`count-headline-up-${bucket.code}`}
                      >
                        <ArrowUp
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        {upCount}
                      </span>
                    )}
                    {downCount > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-700 tabular-nums"
                        title={`${downCount} report${downCount === 1 ? "" : "s"} moved down`}
                        data-testid={`count-headline-down-${bucket.code}`}
                      >
                        <ArrowDown
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        {downCount}
                      </span>
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div
                    className="px-4 pb-3 pl-11"
                    data-testid={`details-headline-${bucket.code}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-500">
                        {bucket.entries.length} report
                        {bucket.entries.length === 1 ? "" : "s"} in this
                        bucket
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() =>
                          copyIds(
                            bucket.entries.map((e) => e.report.id),
                            bucket.label,
                          )
                        }
                        data-testid={`button-copy-ids-headline-${bucket.code}`}
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
                            <th className="text-right px-3 py-1.5 font-medium">
                              Before
                            </th>
                            <th className="text-right px-3 py-1.5 font-medium">
                              After
                            </th>
                            <th className="text-left px-3 py-1.5 font-medium">
                              Delta
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {bucket.entries.map(({ report: r, delta: d }) => (
                            <tr
                              key={`${bucket.code}-${r.id}`}
                              className="hover:bg-slate-50 align-top"
                              data-testid={`row-headline-report-${bucket.code}-${r.id}`}
                            >
                              <td
                                className="px-3 py-1.5 text-slate-700 select-text"
                                data-testid={`text-headline-company-${bucket.code}-${r.id}`}
                              >
                                {r.companyName}
                              </td>
                              <td
                                className="px-3 py-1.5 text-slate-600 select-all"
                                data-testid={`text-headline-report-id-${bucket.code}-${r.id}`}
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
                                  data-testid={`link-headline-report-${bucket.code}-${r.id}`}
                                >
                                  {r.id}
                                </a>
                              </td>
                              <td
                                className="px-3 py-1.5 text-right text-slate-600 tabular-nums"
                                data-testid={`text-headline-before-${bucket.code}-${r.id}`}
                              >
                                {formatMetricValue(d.before, d.unit)}
                              </td>
                              <td
                                className="px-3 py-1.5 text-right text-slate-700 tabular-nums"
                                data-testid={`text-headline-after-${bucket.code}-${r.id}`}
                              >
                                {formatMetricValue(d.after, d.unit)}
                              </td>
                              <td
                                className="px-3 py-1.5"
                                data-testid={`text-headline-delta-${bucket.code}-${r.id}`}
                              >
                                <MetricDeltaChip delta={d} />
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
        </ul>
      )}
    </div>
  );
}

// Render a single before/after value for the headline-changes table, using
// the same compact $K/$M/$B convention as `MetricDeltaChip` for money and
// a plain integer for counts. Kept local to this file because it only
// renders a single magnitude (no sign) — the colored chip in the next
// column already carries the directional information.
function formatMetricValue(value: number, unit: ReportMetricDelta["unit"]): string {
  if (unit === "money") {
    const abs = Math.abs(Math.round(value));
    if (abs >= 1_000_000_000) {
      const b = abs / 1_000_000_000;
      const formatted =
        b === Math.floor(b) ? `$${Math.floor(b)}B` : `$${b.toFixed(1)}B`;
      return value < 0 ? `-${formatted}` : formatted;
    }
    if (abs >= 1_000_000) {
      const m = abs / 1_000_000;
      const formatted =
        m === Math.floor(m) ? `$${Math.floor(m)}M` : `$${m.toFixed(1)}M`;
      return value < 0 ? `-${formatted}` : formatted;
    }
    if (abs >= 1_000) {
      const k = `$${Math.round(abs / 1_000)}K`;
      return value < 0 ? `-${k}` : k;
    }
    return value < 0 ? `-$${abs}` : `$${abs}`;
  }
  return `${value}`;
}
