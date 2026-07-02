import { Badge } from "@/components/ui/badge";
import type { ReportMetricDelta } from "./types";

/**
 * Compact pill summarizing one headline-number movement applied during the
 * backfill (e.g. "Total value $1.2M → $1.4M (+$200K)" or "Lead Champions 0
 * → 1 (+1)"). Tinted blue for a positive delta and amber for a negative one
 * so admins can spot regressions at a glance — a "bumped schema" upgrade
 * that DROPS Champion count from 3 to 1 is a story they want to see.
 */
export function MetricDeltaChip({ delta }: { delta: ReportMetricDelta }) {
  const tone =
    delta.delta > 0
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <Badge
      variant="outline"
      className={`text-[10px] py-0 px-1.5 font-normal ${tone}`}
      data-testid={`chip-metric-delta-${delta.code}`}
    >
      {delta.label}
    </Badge>
  );
}
