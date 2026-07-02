import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

export interface ValidationSummaryData {
  useCasesCapped?: number;
  parametersClamped?: number;
  portfolioScaleFactor?: number;
  originalTotal?: number;
  validatedTotal?: number;
  details?: string[];
}

export interface ValidationSummaryPanelProps {
  summary: ValidationSummaryData;
  benefitsCapped?: boolean;
  totalUseCases?: number;
}

const REVENUE_CAP_RE = /^(\S+) revenue uplift capped from (\d+)% to (\d+)%$/;
const RISK_CAP_RE = /^(\S+) risk reduction capped from (\d+)% to (\d+)%$/;

export interface CapBreakdown {
  ids: string[];
  count: number;
}

export function summarizeCapWarnings(details: string[] | undefined): {
  revenue: CapBreakdown;
  risk: CapBreakdown;
} {
  const revenueIds = new Set<string>();
  const riskIds = new Set<string>();
  for (const line of details ?? []) {
    const rev = REVENUE_CAP_RE.exec(line);
    if (rev) {
      revenueIds.add(rev[1]);
      continue;
    }
    const rk = RISK_CAP_RE.exec(line);
    if (rk) {
      riskIds.add(rk[1]);
    }
  }
  const sortIds = (s: Set<string>) => Array.from(s).sort();
  return {
    revenue: { ids: sortIds(revenueIds), count: revenueIds.size },
    risk: { ids: sortIds(riskIds), count: riskIds.size },
  };
}

export function ValidationSummaryPanel({
  summary,
  benefitsCapped,
  totalUseCases,
}: ValidationSummaryPanelProps) {
  const useCasesCapped = summary.useCasesCapped ?? 0;
  const parametersClamped = summary.parametersClamped ?? 0;
  const scaleFactor = summary.portfolioScaleFactor ?? 1;
  const originalTotal = summary.originalTotal ?? 0;
  const validatedTotal = summary.validatedTotal ?? 0;
  const breakdown = summarizeCapWarnings(summary.details);

  const showValidation =
    benefitsCapped === true ||
    useCasesCapped > 0 ||
    parametersClamped > 0 ||
    breakdown.revenue.count > 0 ||
    breakdown.risk.count > 0;

  const [revenueExpanded, setRevenueExpanded] = useState(false);
  const [riskExpanded, setRiskExpanded] = useState(false);

  if (!showValidation) return null;

  return (
    <Card className="mt-3 border-blue-200 bg-blue-50/50" data-testid="validation-summary">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-blue-600" />
          <h4 className="font-semibold text-sm text-blue-800">Validation Applied</h4>
        </div>
        <div className="space-y-2.5">
          {useCasesCapped > 0 && (
            <p className="text-xs text-blue-700" data-testid="text-use-cases-capped">
              <span className="font-medium">
                {useCasesCapped} use case{useCasesCapped !== 1 ? "s" : ""} capped
              </span>{" "}
              to meet CFO-credible limits
            </p>
          )}
          {breakdown.revenue.count > 0 && (
            <CapWarningRollup
              testId="revenue-uplift-capped"
              label="had revenue uplift capped"
              breakdown={breakdown.revenue}
              totalUseCases={totalUseCases}
              expanded={revenueExpanded}
              onToggle={() => setRevenueExpanded((v) => !v)}
            />
          )}
          {breakdown.risk.count > 0 && (
            <CapWarningRollup
              testId="risk-reduction-capped"
              label="had risk reduction capped"
              breakdown={breakdown.risk}
              totalUseCases={totalUseCases}
              expanded={riskExpanded}
              onToggle={() => setRiskExpanded((v) => !v)}
            />
          )}
          {parametersClamped > 0 && (
            <p className="text-xs text-blue-700" data-testid="text-parameters-clamped">
              <span className="font-medium">
                {parametersClamped} parameter{parametersClamped !== 1 ? "s" : ""} clamped
              </span>{" "}
              to valid ranges
            </p>
          )}
          {scaleFactor < 1 && (
            <p className="text-xs text-blue-700">
              <span className="font-medium">
                Portfolio scaled by {scaleFactor.toFixed(3)}x
              </span>{" "}
              to meet 3% revenue ceiling
            </p>
          )}
          {originalTotal !== validatedTotal && (
            <div className="flex items-center gap-1 text-xs text-blue-700 bg-white/60 rounded px-2 py-1">
              <span>Original:</span>
              <span className="font-medium">${(originalTotal / 1_000_000).toFixed(1)}M</span>
              <span className="text-blue-500">→</span>
              <span>Validated:</span>
              <span className="font-medium">${(validatedTotal / 1_000_000).toFixed(1)}M</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface CapWarningRollupProps {
  testId: string;
  label: string;
  breakdown: CapBreakdown;
  totalUseCases?: number;
  expanded: boolean;
  onToggle: () => void;
}

function CapWarningRollup({
  testId,
  label,
  breakdown,
  totalUseCases,
  expanded,
  onToggle,
}: CapWarningRollupProps) {
  const denominator =
    typeof totalUseCases === "number" && totalUseCases >= breakdown.count
      ? totalUseCases
      : null;
  return (
    <div className="text-xs text-blue-700" data-testid={`rollup-${testId}`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="h-auto p-0 hover:bg-transparent text-xs text-blue-700 font-normal"
        data-testid={`button-toggle-${testId}`}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 mr-1" />
        ) : (
          <ChevronRight className="h-3 w-3 mr-1" />
        )}
        <span className="font-medium" data-testid={`text-${testId}-count`}>
          {breakdown.count}
          {denominator !== null ? ` of ${denominator}` : ""} use case
          {breakdown.count !== 1 ? "s" : ""}
        </span>
        <span className="ml-1">{label}</span>
      </Button>
      {expanded && (
        <ul
          className="mt-1 ml-4 list-disc list-inside font-mono text-[11px] text-blue-800/80 space-y-0.5"
          data-testid={`list-${testId}-ids`}
        >
          {breakdown.ids.map((id) => (
            <li key={id} data-testid={`item-${testId}-${id}`}>
              {id}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
