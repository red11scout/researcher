import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Delaunay } from 'd3-delaunay';
import { format } from '@/lib/formatters';
import { chartColors } from './chart-config';

interface MatrixDataPoint {
  name: string;
  x: number;  // Readiness Score (1-10)
  y: number;  // Normalized Annual Value (1-10)
  z: number;  // TTV bubble score (0-1)
  type: string;
  color: string;
  timeToValue?: number;
  priorityTier?: string;
  priorityScore?: number;
  annualValue?: number;
  readinessScore?: number;
  normalizedValue?: number;
  organizationalCapacity?: number;
  dataAvailabilityQuality?: number;
  technicalInfrastructure?: number;
  governance?: number;
  dataReadiness?: number;
  integrationComplexity?: number;
  changeMgmt?: number;
  monthlyTokens?: number;
  description?: string;
  // VRM v2.0 fields
  quadrantV2?: string;
  quadrantLayer?: number;
  quadrantRationale?: string;
  floorFailureReasons?: string[];
  conditionalChampionMeta?: {
    gaps: Array<{ component: string; current: number; required: number }>;
    proposedSprintWeeks: number;
    reclassificationCriteria: string;
  };
  wave?: string;
  hasNamedSponsor?: boolean | null;
  dataAvailableForEngagement?: boolean | null;
  timeToPilotWeeks?: number | null;
  subComponents?: Record<string, Record<string, number>>;
  // VRM v2.2 fields
  quadrantV22?: string;
  tierV22?: string;
  isConditionalV22?: boolean;
}

// VRM v2.2 — semantic palette + thresholds
const QUADRANT_CUT_V22 = 5.5;
const LEAD_TIER_CUT_V22 = 7.5;
const QUADRANT_PALETTE_V22: Record<string, string> = {
  champion:   '#10b981', // emerald
  quick_win:  '#06b6d4', // cyan
  strategic:  '#6366f1', // indigo
  foundation: '#64748b', // slate
};
const QUADRANT_LABELS_V22: Record<string, string> = {
  champion:   'Champions',
  quick_win:  'Quick Wins',
  strategic:  'Strategic',
  foundation: 'Foundation',
};

function classifyQuadrantV22(value: number, readiness: number): string {
  if (value >= QUADRANT_CUT_V22 && readiness >= QUADRANT_CUT_V22) return 'champion';
  if (value < QUADRANT_CUT_V22 && readiness >= QUADRANT_CUT_V22) return 'quick_win';
  if (value >= QUADRANT_CUT_V22 && readiness < QUADRANT_CUT_V22) return 'strategic';
  return 'foundation';
}

function getQuadrantOfPoint(p: MatrixDataPoint): string {
  const q = (p.quadrantV22 ?? p.quadrantV2 ?? '').toLowerCase();
  if (q === 'champion' || q === 'quick_win' || q === 'strategic' || q === 'foundation') return q;
  if (q === 'conditional_champion') {
    // place at actual coords; semantic color is the natural quadrant
    return classifyQuadrantV22(p.y, p.x);
  }
  return classifyQuadrantV22(p.y, p.x);
}

function getQuadrantColorV22(p: MatrixDataPoint): string {
  return QUADRANT_PALETTE_V22[getQuadrantOfPoint(p)] ?? QUADRANT_PALETTE_V22.foundation;
}

/** Bucket TTV (weeks) → bubble radius. Smaller bubble = faster TTV (v2.2 spec). */
function ttvBubbleRadiusV22(weeks?: number): number {
  if (weeks == null || !Number.isFinite(weeks)) return 16;
  if (weeks <= 4)  return 8;
  if (weeks <= 8)  return 12;
  if (weeks <= 12) return 16;
  if (weeks <= 16) return 20;
  return 24;
}

interface QuadrantBubbleChartProps {
  data: MatrixDataPoint[];
  onBubbleClick?: (point: MatrixDataPoint) => void;
  // VRM v2.1 — engagement config used to render the hard-floor band visually
  vrmConfig?: {
    valueFloorBand?: { minNormalizedScore: number; minAbsoluteAnnualValue: number };
    championMin?: number;
    quickStrategicMin?: number;
  };
}

const MARGIN = { top: 30, right: 30, bottom: 50, left: 55 };

const TIER_COLORS = chartColors.tier;
const QUADRANT_COLORS = chartColors.quadrant;
const QUADRANT_LABEL_COLORS = chartColors.quadrantLabel;

function getTierColorValue(tier?: string): string {
  if (!tier) return TIER_COLORS.medium;
  // New tier names
  if (tier.includes('Champion')) return TIER_COLORS.critical;
  if (tier.includes('Quick Win')) return TIER_COLORS.high;
  if (tier.includes('Strategic')) return TIER_COLORS.medium;
  if (tier.includes('Foundation')) return TIER_COLORS.low;
  // Legacy tier names
  switch (tier) {
    case 'Critical': return TIER_COLORS.critical;
    case 'High': return TIER_COLORS.high;
    case 'Medium': return TIER_COLORS.medium;
    case 'Low': return TIER_COLORS.low;
    default: return TIER_COLORS.medium;
  }
}

function getTierBadgeClasses(tier?: string): string {
  if (!tier) return 'bg-slate-400 text-white';
  if (tier.includes('Champion')) return 'bg-emerald-700 text-white';
  if (tier.includes('Quick Win')) return 'bg-teal-600 text-white';
  if (tier.includes('Strategic')) return 'bg-blue-700 text-white';
  if (tier.includes('Foundation')) return 'bg-slate-500 text-white';
  // Legacy
  switch (tier) {
    case 'Critical': return 'bg-slate-900 text-white';
    case 'High': return 'bg-blue-700 text-white';
    case 'Medium': return 'bg-blue-400 text-white';
    case 'Low': return 'bg-slate-400 text-white';
    default: return 'bg-slate-400 text-white';
  }
}

/** Generate nice tick values for an axis given a domain */
function generateTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  const start = Math.floor(min);
  const end = Math.ceil(max);
  for (let v = start; v <= end; v++) {
    ticks.push(v);
  }
  return ticks;
}

export function QuadrantBubbleChart({ data, onBubbleClick, vrmConfig }: QuadrantBubbleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Responsive sizing via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      // Height scales with width but has min/max
      const height = Math.max(300, Math.min(560, width * 0.65));
      setDimensions({ width, height });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const { width, height } = dimensions;

  // VRM v2.2 — Quadrant cut at 5.5 (was 7.5 in v2.1).
  // Use a PIECEWISE scale so the threshold sits at the visual center of the chart,
  // producing four equally-sized quadrants regardless of the [1, 10] domain.
  // championMin (lead-tier 7.5) is preserved as a secondary marker line.
  const quadrantCut = QUADRANT_CUT_V22;
  const leadTierCut = vrmConfig?.championMin ?? LEAD_TIER_CUT_V22;
  const { xDomain, yDomain, midXValue, midYValue } = useMemo(() => {
    return {
      xDomain: [1, 10] as [number, number],
      yDomain: [1, 10] as [number, number],
      midXValue: quadrantCut,
      midYValue: quadrantCut,
    };
  }, [data, quadrantCut]);

  // Clamp helper — guards against malformed/out-of-range data points.
  const clamp = (v: number, lo: number, hi: number) =>
    Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : (lo + hi) / 2;

  // Piecewise X scale: domain [1, 7.5] maps to left half, [7.5, 10] maps to right half.
  // Values outside [1, 10] are clamped so a bad data point can never escape the plot area.
  const xScale = useMemo(() => {
    const left = MARGIN.left;
    const right = width - MARGIN.right;
    const mid = (left + right) / 2;
    const fn = (raw: number) => {
      const v = clamp(raw, xDomain[0], xDomain[1]);
      if (v <= midXValue) {
        return left + ((v - xDomain[0]) / (midXValue - xDomain[0])) * (mid - left);
      }
      return mid + ((v - midXValue) / (xDomain[1] - midXValue)) * (right - mid);
    };
    return Object.assign(fn, { invert: (px: number) => px });
  }, [width, xDomain, midXValue]);

  // Piecewise Y scale: domain [1, 7.5] maps to bottom half, [7.5, 10] maps to top half (inverted SVG y).
  const yScale = useMemo(() => {
    const top = MARGIN.top;
    const bottom = height - MARGIN.bottom;
    const mid = (top + bottom) / 2;
    const fn = (raw: number) => {
      const v = clamp(raw, yDomain[0], yDomain[1]);
      if (v <= midYValue) {
        return bottom - ((v - yDomain[0]) / (midYValue - yDomain[0])) * (bottom - mid);
      }
      return mid - ((v - midYValue) / (yDomain[1] - midYValue)) * (mid - top);
    };
    return Object.assign(fn, { invert: (px: number) => px });
  }, [height, yDomain, midYValue]);

  // VRM v2.2 — bubble radius is bucketed by TTV weeks; smaller = faster.
  // Kept as a named function so existing call sites can simply pass the data point.
  const sizeScale = useCallback((point: MatrixDataPoint | { timeToValue?: number }) => {
    return ttvBubbleRadiusV22(point.timeToValue);
  }, []);

  // Voronoi for hover detection
  const delaunay = useMemo(() => {
    if (data.length === 0) return null;
    const points = data.map(d => [xScale(d.x), yScale(d.y)] as [number, number]);
    return Delaunay.from(points);
  }, [data, xScale, yScale]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!delaunay || data.length === 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const idx = delaunay.find(mx, my);
    // Only highlight if cursor is within reasonable distance of bubble
    const bx = xScale(data[idx].x);
    const by = yScale(data[idx].y);
    const dist = Math.sqrt((mx - bx) ** 2 + (my - by) ** 2);
    const bubbleRadius = sizeScale(data[idx]);

    if (dist < bubbleRadius + 40) {
      setHoveredIndex(idx);
      setTooltipPos({ x: bx, y: by });
    } else {
      setHoveredIndex(null);
    }
  }, [delaunay, data, xScale, yScale, sizeScale]);

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  // Quadrant divider pixel positions from the data midpoint
  const midX = xScale(midXValue);
  const midY = yScale(midYValue);

  // Generate tick values based on dynamic domains
  const xTicks = useMemo(() => generateTicks(xDomain[0], xDomain[1]), [xDomain]);
  const yTicks = useMemo(() => generateTicks(yDomain[0], yDomain[1]), [yDomain]);

  const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : null;

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400">
        No matrix data available
      </div>
    );
  }

  // VRM v2.2 — diagnose which quadrants are populated using the v2.2 fields
  // (with v2.1 / v2.0 string fallbacks for legacy reports that haven't been re-classified).
  const quadrantOf = (d: MatrixDataPoint): string => {
    const q = (d.quadrantV22 ?? d.quadrantV2 ?? '').toLowerCase();
    if (q) return q;
    const tier = (d.priorityTier ?? '').toLowerCase();
    if (tier.includes('champion')) return 'champion';
    if (tier.includes('quick win')) return 'quick_win';
    if (tier.includes('strategic')) return 'strategic';
    return 'foundation';
  };
  const championCount = data.filter(d => quadrantOf(d) === 'champion').length;
  const quickWinCount = data.filter(d => quadrantOf(d) === 'quick_win').length;
  const strategicCount = data.filter(d => quadrantOf(d) === 'strategic').length;
  const conditionalCount = data.filter(d => d.isConditionalV22 === true).length;
  // Empty-quadrant messaging counts conditional bubbles toward their natural quadrant
  // (they render at actual coordinates with a dashed border).
  const hasAnyChampion = championCount > 0;
  const hasAnyQuickWin = quickWinCount > 0;
  const hasAnyStrategic = strategicCount > 0;
  // VRM v2.2 — CC overlay removed (replaced by per-bubble dashed border in same color);
  // hard-floor band visualization removed in favor of the unified Foundation quadrant.
  // conditionalCount is exposed for analytics consumers; the chart itself relies on
  // per-point isConditionalV22 to render dashed borders.
  void conditionalCount;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* VRM v2.2 — semantic palette quadrant fills (20% opacity for clear visual separation
            on dark navy chrome; 8% washed out into a single muddy purple — see UX feedback). */}
        <rect
          x={midX} y={MARGIN.top}
          width={width - MARGIN.right - midX} height={midY - MARGIN.top}
          fill={QUADRANT_PALETTE_V22.champion} opacity={0.20}
          data-testid="rect-quadrant-champion"
        />
        <rect
          x={MARGIN.left} y={MARGIN.top}
          width={midX - MARGIN.left} height={midY - MARGIN.top}
          fill={QUADRANT_PALETTE_V22.strategic} opacity={0.20}
          data-testid="rect-quadrant-strategic"
        />
        <rect
          x={midX} y={midY}
          width={width - MARGIN.right - midX} height={height - MARGIN.bottom - midY}
          fill={QUADRANT_PALETTE_V22.quick_win} opacity={0.20}
          data-testid="rect-quadrant-quick-win"
        />
        <rect
          x={MARGIN.left} y={midY}
          width={midX - MARGIN.left} height={height - MARGIN.bottom - midY}
          fill={QUADRANT_PALETTE_V22.foundation} opacity={0.20}
          data-testid="rect-quadrant-foundation"
        />

        {/* VRM v2.2 — empty-quadrant messaging */}
        {!hasAnyChampion && (
          <text
            x={midX + (width - MARGIN.right - midX) / 2}
            y={MARGIN.top + (midY - MARGIN.top) / 2}
            textAnchor="middle"
            fontSize={11}
            fontStyle="italic"
            fill="#94a3b8"
            opacity={0.7}
            data-testid="text-empty-champion"
          >
            No Champions yet — build readiness or value
          </text>
        )}
        {!hasAnyStrategic && (
          <text
            x={MARGIN.left + (midX - MARGIN.left) / 2}
            y={MARGIN.top + (midY - MARGIN.top) / 2}
            textAnchor="middle"
            fontSize={11}
            fontStyle="italic"
            fill="#94a3b8"
            opacity={0.7}
            data-testid="text-empty-strategic"
          >
            No Strategic bets — invest in readiness
          </text>
        )}
        {!hasAnyQuickWin && (
          <text
            x={midX + (width - MARGIN.right - midX) / 2}
            y={midY + (height - MARGIN.bottom - midY) / 2}
            textAnchor="middle"
            fontSize={11}
            fontStyle="italic"
            fill="#94a3b8"
            opacity={0.7}
            data-testid="text-empty-quick-win"
          >
            No Quick Wins — find lower-value, ready use cases
          </text>
        )}

        {/* VRM v2.2 — quadrant cut dividers at 5.5 (slate, dashed, prominent so the
            four quadrants read as four equal boxes). */}
        <line
          x1={midX} y1={MARGIN.top} x2={midX} y2={height - MARGIN.bottom}
          stroke="#cbd5e1" strokeDasharray="6 4" strokeWidth={2} opacity={0.75}
          data-testid="line-quadrant-cut-x"
        />
        <line
          x1={MARGIN.left} y1={midY} x2={width - MARGIN.right} y2={midY}
          stroke="#cbd5e1" strokeDasharray="6 4" strokeWidth={2} opacity={0.75}
          data-testid="line-quadrant-cut-y"
        />

        {/* VRM v2.2 — Lead-tier marker lines at 7.5 (emerald, dotted 1px @ 18% so
            the lead-tier hint never visually subdivides the four primary quadrants). */}
        <line
          x1={xScale(leadTierCut)} y1={MARGIN.top}
          x2={xScale(leadTierCut)} y2={height - MARGIN.bottom}
          stroke="#10b981" strokeWidth={1} strokeDasharray="2 4" opacity={0.18}
          data-testid="line-lead-tier-x"
        />
        <line
          x1={MARGIN.left} y1={yScale(leadTierCut)}
          x2={width - MARGIN.right} y2={yScale(leadTierCut)}
          stroke="#10b981" strokeWidth={1} strokeDasharray="2 4" opacity={0.18}
          data-testid="line-lead-tier-y"
        />
        <text
          x={xScale(leadTierCut) + 4}
          y={MARGIN.top + 10}
          fontSize={9}
          fill="#059669"
          opacity={0.7}
          fontStyle="italic"
          data-testid="text-lead-tier-label"
        >
          Lead ≥ {leadTierCut}
        </text>

        {/* Quadrant labels — placed in each corner, color-keyed to the quadrant. */}
        <text
          x={width - MARGIN.right - 8}
          y={MARGIN.top + 16}
          textAnchor="end"
          fontSize={11}
          fontWeight={700}
          fill={QUADRANT_PALETTE_V22.champion}
          opacity={0.95}
          data-testid="text-label-champion"
        >
          Champions
        </text>
        <text
          x={width - MARGIN.right - 8}
          y={MARGIN.top + 28}
          textAnchor="end"
          fontSize={9}
          fontWeight={500}
          fill={QUADRANT_PALETTE_V22.champion}
          opacity={0.7}
        >
          Value ≥ {quadrantCut} · Readiness ≥ {quadrantCut}
        </text>
        <text
          x={MARGIN.left + 8}
          y={MARGIN.top + 16}
          textAnchor="start"
          fontSize={11}
          fontWeight={700}
          fill={QUADRANT_PALETTE_V22.strategic}
          opacity={0.95}
          data-testid="text-label-strategic"
        >
          Strategic
        </text>
        <text
          x={MARGIN.left + 8}
          y={MARGIN.top + 28}
          textAnchor="start"
          fontSize={9}
          fontWeight={500}
          fill={QUADRANT_PALETTE_V22.strategic}
          opacity={0.7}
        >
          Value ≥ {quadrantCut} · Readiness &lt; {quadrantCut}
        </text>
        <text
          x={width - MARGIN.right - 8}
          y={height - MARGIN.bottom - 18}
          textAnchor="end"
          fontSize={9}
          fontWeight={500}
          fill={QUADRANT_PALETTE_V22.quick_win}
          opacity={0.7}
        >
          Value &lt; {quadrantCut} · Readiness ≥ {quadrantCut}
        </text>
        <text
          x={width - MARGIN.right - 8}
          y={height - MARGIN.bottom - 6}
          textAnchor="end"
          fontSize={11}
          fontWeight={700}
          fill={QUADRANT_PALETTE_V22.quick_win}
          opacity={0.95}
          data-testid="text-label-quick-win"
        >
          Quick Wins
        </text>
        <text
          x={MARGIN.left + 8}
          y={height - MARGIN.bottom - 18}
          textAnchor="start"
          fontSize={9}
          fontWeight={500}
          fill={QUADRANT_PALETTE_V22.foundation}
          opacity={0.7}
        >
          Value &lt; {quadrantCut} · Readiness &lt; {quadrantCut}
        </text>
        <text
          x={MARGIN.left + 8}
          y={height - MARGIN.bottom - 6}
          textAnchor="start"
          fontSize={11}
          fontWeight={700}
          fill={QUADRANT_PALETTE_V22.foundation}
          opacity={0.95}
          data-testid="text-label-foundation"
        >
          Foundation
        </text>

        {/* X-axis ticks and labels (dynamic) */}
        {xTicks.map(v => (
          <g key={`x-${v}`}>
            <line
              x1={xScale(v)} y1={height - MARGIN.bottom}
              x2={xScale(v)} y2={height - MARGIN.bottom + 5}
              stroke="#94a3b8"
            />
            <text
              x={xScale(v)} y={height - MARGIN.bottom + 18}
              textAnchor="middle"
              fontSize={10}
              fill="#94a3b8"
            >
              {v}
            </text>
          </g>
        ))}
        <text
          x={(MARGIN.left + width - MARGIN.right) / 2}
          y={height - 6}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="#94a3b8"
        >
          Readiness Score
        </text>

        {/* Y-axis ticks and labels (dynamic) */}
        {yTicks.map(v => (
          <g key={`y-${v}`}>
            <line
              x1={MARGIN.left - 5} y1={yScale(v)}
              x2={MARGIN.left} y2={yScale(v)}
              stroke="#94a3b8"
            />
            <text
              x={MARGIN.left - 10} y={yScale(v) + 4}
              textAnchor="end"
              fontSize={10}
              fill="#94a3b8"
            >
              {v}
            </text>
          </g>
        ))}
        <text
          x={14}
          y={(MARGIN.top + height - MARGIN.bottom) / 2}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="#94a3b8"
          transform={`rotate(-90, 14, ${(MARGIN.top + height - MARGIN.bottom) / 2})`}
        >
          Value Score (EV / Friction Cost)
        </text>

        {/* Axis lines */}
        <line
          x1={MARGIN.left} y1={height - MARGIN.bottom}
          x2={width - MARGIN.right} y2={height - MARGIN.bottom}
          stroke="#334155" strokeWidth={1}
        />
        <line
          x1={MARGIN.left} y1={MARGIN.top}
          x2={MARGIN.left} y2={height - MARGIN.bottom}
          stroke="#334155" strokeWidth={1}
        />

        {/* Bubbles — VRM v2.2: smaller = faster TTV; color = quadrant; dashed border = Conditional */}
        {data.map((point, i) => {
          const cx = xScale(point.x);
          const cy = yScale(point.y);
          const r = sizeScale(point);
          const isConditional = point.isConditionalV22 === true
            || point.quadrantV2 === 'conditional_champion'
            || (point.priorityTier ?? '').includes('Conditional');
          const fillColor = getQuadrantColorV22(point);
          const isHovered = hoveredIndex === i;
          const isDimmed = hoveredIndex !== null && hoveredIndex !== i;

          return (
            <motion.circle
              key={point.name}
              cx={cx}
              cy={cy}
              fill={fillColor}
              stroke={isConditional ? fillColor : 'rgba(255,255,255,0.85)'}
              strokeDasharray={isConditional ? '4 2' : undefined}
              initial={{ r: 0, opacity: 0 }}
              animate={{
                r,
                opacity: isDimmed ? 0.25 : 0.90,
                strokeWidth: isConditional ? 2 : (isHovered ? 2.5 : 1),
              }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              style={{ cursor: 'pointer' }}
              onClick={() => onBubbleClick?.(point)}
              data-testid={`bubble-${point.name.replace(/\s+/g, '-').toLowerCase()}`}
            />
          );
        })}

        {/* Direct bubble labels (for ≤12 use cases) — with collision-avoidance.
            For each bubble, place the label above by default; if a previously-placed
            label sits within COLLIDE_PX, flip below the bubble instead. */}
        {data.length <= 12 && (() => {
          const COLLIDE_PX = 28;
          const placed: { x: number; y: number }[] = [];
          return data.map((point, i) => {
            const cx = xScale(point.x);
            const cy = yScale(point.y);
            const r = sizeScale(point);
            const isDimmed = hoveredIndex !== null && hoveredIndex !== i;
            const labelText = point.name.length > 22
              ? point.name.slice(0, 20) + '…'
              : point.name;

            const aboveY = cy - r - 5;
            const belowY = cy + r + 12;
            const collidesAbove = placed.some(p =>
              Math.abs(p.x - cx) < COLLIDE_PX && Math.abs(p.y - aboveY) < 12
            );
            const labelY = collidesAbove ? belowY : aboveY;
            placed.push({ x: cx, y: labelY });

            return (
              <motion.text
                key={`label-${point.name}-${i}`}
                x={cx}
                y={labelY}
                textAnchor="middle"
                fontSize={9}
                fontWeight={500}
                fill="#334155"
                className="pointer-events-none select-none"
                animate={{ opacity: isDimmed ? 0.15 : 0.85 }}
                transition={{ duration: 0.2 }}
                style={{ paintOrder: 'stroke' }}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={2.5}
                strokeLinejoin="round"
              >
                {labelText}
              </motion.text>
            );
          });
        })()}
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {hoveredPoint && hoveredIndex !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 pointer-events-none"
            style={{
              left: tooltipPos.x + (tooltipPos.x > width / 2 ? -260 : 20),
              top: Math.max(10, tooltipPos.y - 100),
            }}
          >
            <div className="bg-white p-4 rounded-xl shadow-2xl border border-slate-200 text-slate-900 w-[240px]">
              <p className="font-bold text-sm mb-1 leading-tight">{hoveredPoint.name}</p>
              {hoveredPoint.priorityTier && (
                <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 ${getTierBadgeClasses(hoveredPoint.priorityTier)}`}>
                  {hoveredPoint.priorityTier}
                </span>
              )}
              <div className="h-px bg-slate-100 my-2" />
              {/* Show actual dollar amount prominently */}
              {hoveredPoint.annualValue != null && hoveredPoint.annualValue > 0 && (
                <div className="mb-2">
                  <span className="text-slate-400 text-[10px] block">Annual Value</span>
                  <span className="font-bold text-slate-900 text-sm">{format.currencyAuto(hoveredPoint.annualValue)}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Value Score</span>
                  <span className="font-semibold text-slate-700">{Math.round(hoveredPoint.y * 10) / 10}/10</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Readiness</span>
                  <span className="font-semibold text-slate-700">{Math.round(hoveredPoint.x * 10) / 10}/10</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Time to Value</span>
                  <span className="font-semibold text-slate-700">
                    {hoveredPoint.timeToValue ? format.duration(hoveredPoint.timeToValue) : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Priority</span>
                  <span className="font-semibold text-slate-700">
                    {hoveredPoint.priorityScore ? `${Math.round(hoveredPoint.priorityScore * 10) / 10}/10` : '—'}
                  </span>
                </div>
              </div>
              {hoveredPoint.quadrantRationale && (
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  <span className="font-semibold text-slate-600">Why: </span>{hoveredPoint.quadrantRationale}
                </p>
              )}
              {hoveredPoint.floorFailureReasons && hoveredPoint.floorFailureReasons.length > 0 && (
                <div className="mt-2 p-2 rounded bg-red-50 border border-red-200">
                  <p className="text-[10px] font-semibold text-red-800 mb-0.5">Floor failures</p>
                  <ul className="text-[10px] text-red-700 list-disc list-inside leading-tight">
                    {hoveredPoint.floorFailureReasons.slice(0, 3).map((r: string, idx: number) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {hoveredPoint.conditionalChampionMeta && (
                <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200">
                  <p className="text-[10px] font-semibold text-amber-800 mb-0.5">{hoveredPoint.conditionalChampionMeta.proposedSprintWeeks}-week readiness sprint</p>
                  <ul className="text-[10px] text-amber-700 list-disc list-inside leading-tight">
                    {hoveredPoint.conditionalChampionMeta.gaps.slice(0, 3).map((g: { component: string; current: number; required: number }, idx: number) => (
                      <li key={idx}>{g.component}: {g.current} → {g.required}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!hoveredPoint.quadrantRationale && hoveredPoint.description && (
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed line-clamp-2">
                  {hoveredPoint.description}
                </p>
              )}
              <p className="text-[10px] text-slate-300 mt-2 italic">Click for details</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend — VRM v2.2: 4-color semantic palette + flipped TTV size + Lead-tier marker */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-3 text-[11px]" data-testid="chart-legend-v22">
        {(['champion', 'quick_win', 'strategic', 'foundation'] as const).map(q => (
          <div key={q} className="flex items-center gap-1.5 text-slate-400">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: QUADRANT_PALETTE_V22[q] }}
            />
            {QUADRANT_LABELS_V22[q]}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-slate-400">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{
              backgroundColor: QUADRANT_PALETTE_V22.champion,
              border: `1.5px dashed ${QUADRANT_PALETTE_V22.champion}`,
              boxSizing: 'content-box',
            }}
          />
          Conditional (dashed)
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <svg width="22" height="10" className="text-emerald-500">
            <line x1="0" y1="5" x2="22" y2="5" stroke="currentColor" strokeWidth="1" opacity="0.6" />
          </svg>
          Lead tier ≥ {leadTierCut}
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 ml-2">
          <svg width="22" height="14" className="text-slate-400">
            <circle cx="5" cy="7" r="3" fill="currentColor" opacity="0.5" />
            <circle cx="16" cy="7" r="6" fill="currentColor" opacity="0.5" />
          </svg>
          Smaller bubble = Faster time-to-value
        </div>
      </div>
    </div>
  );
}
