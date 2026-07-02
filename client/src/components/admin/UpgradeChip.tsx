import { Badge } from "@/components/ui/badge";
import type { ReportUpgrade } from "./types";

/**
 * Compact pill summarizing one schema-level upgrade applied during backfill
 * (e.g. "Bumped schema 2.0 → 2.2"). Used both in the live recent-reports feed
 * and in the post-run grouping panel.
 */
export function UpgradeChip({ upgrade }: { upgrade: ReportUpgrade }) {
  return (
    <Badge
      variant="outline"
      className="text-[10px] py-0 px-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 font-normal"
      data-testid={`chip-upgrade-${upgrade.code}`}
    >
      {upgrade.label}
    </Badge>
  );
}
