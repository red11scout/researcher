import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { scaleLinear, scaleSqrt, scaleOrdinal } from 'd3-scale';
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
}

interface QuadrantBubbleChartProps {
  data: MatrixDataPoint[];
  onBubbleClick?: (point: MatrixDataPoint) => void;
  // VRM v2.1 — engagement config used to render the hard-floor band visually
  vrmConfig?: {
    valueFloorBand?: { minNormalized: number; minAbsoluteAnnual: number };
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

  // VRM v2.1 — Quadrant thresholds anchored at 7.5 on both axes.
  // Use a PIECEWISE scale so the threshold sits at the visual center of the chart,
  // producing four equally-sized quadrants regardless of the [1, 10] domain.
  const { xDomain, yDomain, midXValue, midYValue } = useMemo(() => {
    return {
      xDomain: [1, 10] as [number, number],
      yDomain: [1, 10] as [number, number],
      midXValue: 7.5,
      midYValue: 7.5,
    };
  }, [data]);

  // Piecewise X scale: domain [1, 7.5] maps to left half, [7.5, 10] maps to right half.
  const xScale = useMemo(() => {
    const left = MARGIN.left;
    const right = width - MARGIN.right;
    const mid = (left + right) / 2;
    const fn = (v: number) => {
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
    const fn = (v: number) => {
      if (v <= midYValue) {
        // Lower domain values render in the bottom half (between mid and bottom)
        return bottom - ((v - yDomain[0]) / (midYValue - yDomain[0])) * (bottom - mid);
      }
      // Upper domain values render in the top half (between top and mid)
      return mid - ((v - midYValue) / (yDomain[1] - midYValue)) * (mid - top);
    };
    return Object.assign(fn, { invert: (px: number) => px });
  }, [height, yDomain, midYValue]);

  // TTV bubble sizing: z is TTV score (0-1), where 1 = fastest time-to-value = largest bubble
  // Minimum visible radius for TTV=0 cases
  const MIN_BUBBLE_RADIUS = 4;
  const MAX_BUBBLE_RADIUS = Math.min(36, width / 25);
  const sizeScale = useMemo(() => {
    return scaleSqrt()
      .domain([0, 1])
      .range([MIN_BUBBLE_RADIUS, MAX_BUBBLE_RADIUS])
      .clamp(true);
  }, [width]);

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
    const bubbleRadius = sizeScale(data[idx].z || 0.5);

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

  // VRM v2.1 — diagnose which quadrants are populated to render ghost-zone treatment
  const championCount = data.filter(d => (d.quadrantV2 ?? '').toLowerCase() === 'champion' || (d.priorityTier ?? '').includes('Champion') && !(d.priorityTier ?? '').includes('Conditional')).length;
  const quickWinCount = data.filter(d => (d.quadrantV2 ?? '').toLowerCase() === 'quick_win' || (d.priorityTier ?? '').includes('Quick Win')).length;
  const strategicCount = data.filter(d => (d.quadrantV2 ?? '').toLowerCase() === 'strategic' || (d.priorityTier ?? '').includes('Strategic')).length;
  const conditionalChampionCount = data.filter(d => (d.quadrantV2 ?? '').toLowerCase() === 'conditional_champion' || (d.priorityTier ?? '').includes('Conditional Champion')).length;
  const hasAnyChampion = championCount > 0 || conditionalChampionCount > 0;
  const hasAnyQuickWin = quickWinCount > 0;
  const hasAnyStrategic = strategicCount > 0;
  // Layer 3 dashed CC overlay: shown when CC bubbles exist (those are placed in the upper-right by definition)
  const showCCOverlay = conditionalChampionCount > 0;
  // VRM v2.1 hard floor uses normalized value < 4.0 (vs. v2.0 single-line at 6.0)
  const hardFloorY = vrmConfig?.valueFloorBand?.minNormalized ?? 4.0;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Quadrant background fills — distinct pastel colors */}
        <rect
          x={midX} y={MARGIN.top}
          width={width - MARGIN.right - midX} height={midY - MARGIN.top}
          fill={QUADRANT_COLORS.champion} opacity={hasAnyChampion ? 0.85 : 0.35}
        />
        <rect
          x={MARGIN.left} y={MARGIN.top}
          width={midX - MARGIN.left} height={midY - MARGIN.top}
          fill={QUADRANT_COLORS.strategicBet} opacity={hasAnyStrategic ? 0.85 : 0.35}
        />
        <rect
          x={midX} y={midY}
          width={width - MARGIN.right - midX} height={height - MARGIN.bottom - midY}
          fill={QUADRANT_COLORS.quickWin} opacity={hasAnyQuickWin ? 0.85 : 0.35}
        />
        {/* VRM v2.1 — Foundation is sub-segmented:
            - Upper part (V≥hardFloorY): "soft Foundation" — lighter grey
            - Lower part (V<hardFloorY): "hard Foundation / blocked" — darker grey */}
        <rect
          x={MARGIN.left} y={midY}
          width={midX - MARGIN.left} height={yScale(hardFloorY) - midY}
          fill={QUADRANT_COLORS.foundation} opacity={0.55}
        />
        <rect
          x={MARGIN.left} y={yScale(hardFloorY)}
          width={midX - MARGIN.left} height={height - MARGIN.bottom - yScale(hardFloorY)}
          fill="#475569" opacity={0.35}
        />
        <text
          x={MARGIN.left + (midX - MARGIN.left) / 2}
          y={yScale(hardFloorY) + 14}
          textAnchor="middle"
          fontSize={9}
          fill="#1e293b"
          fontStyle="italic"
          opacity={0.7}
        >
          Hard floor V&lt;{hardFloorY}
        </text>

        {/* VRM v2.1 — Ghost zones overlay diagonal stripes for empty default quadrants */}
        <defs>
          <pattern id="ghost-stripes" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="1" opacity="0.35" />
          </pattern>
        </defs>
        {!hasAnyChampion && (
          <rect
            x={midX} y={MARGIN.top}
            width={width - MARGIN.right - midX} height={midY - MARGIN.top}
            fill="url(#ghost-stripes)"
          />
        )}
        {!hasAnyStrategic && (
          <rect
            x={MARGIN.left} y={MARGIN.top}
            width={midX - MARGIN.left} height={midY - MARGIN.top}
            fill="url(#ghost-stripes)"
          />
        )}
        {!hasAnyQuickWin && (
          <rect
            x={midX} y={midY}
            width={width - MARGIN.right - midX} height={height - MARGIN.bottom - midY}
            fill="url(#ghost-stripes)"
          />
        )}

        {/* VRM v2.1 — Conditional Champion overlay: dashed border in the Champion zone (upper-right) */}
        {showCCOverlay && (
          <g>
            <rect
              x={midX + 4} y={MARGIN.top + 4}
              width={width - MARGIN.right - midX - 8} height={midY - MARGIN.top - 8}
              fill="none"
              stroke="#b45309"
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={0.8}
              rx={6}
            />
            <text
              x={midX + 10}
              y={MARGIN.top + 18}
              fontSize={10}
              fontWeight={700}
              fill="#92400e"
              opacity={0.85}
              data-testid="text-cc-overlay-label"
            >
              Conditional Champion zone
            </text>
          </g>
        )}

        {/* Quadrant labels */}
        <text
          x={midX + (width - MARGIN.right - midX) / 2}
          y={MARGIN.top + 18}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill={QUADRANT_LABEL_COLORS.champion}
          opacity={0.9}
        >
          Champions
        </text>
        <text
          x={MARGIN.left + (midX - MARGIN.left) / 2}
          y={MARGIN.top + 18}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill={QUADRANT_LABEL_COLORS.strategicBet}
          opacity={0.9}
        >
          Strategic
        </text>
        <text
          x={midX + (width - MARGIN.right - midX) / 2}
          y={height - MARGIN.bottom - 8}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill={QUADRANT_LABEL_COLORS.quickWin}
          opacity={0.9}
        >
          Quick Wins
        </text>
        <text
          x={MARGIN.left + (midX - MARGIN.left) / 2}
          y={height - MARGIN.bottom - 8}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill={QUADRANT_LABEL_COLORS.foundation}
          opacity={0.9}
        >
          Foundation
        </text>

        {/* Champion threshold dividers at 7.5 */}
        <line
          x1={midX} y1={MARGIN.top} x2={midX} y2={height - MARGIN.bottom}
          stroke="#475569" strokeDasharray="6 4" strokeWidth={1.5} opacity={0.6}
        />
        <line
          x1={MARGIN.left} y1={midY} x2={width - MARGIN.right} y2={midY}
          stroke="#475569" strokeDasharray="6 4" strokeWidth={1.5} opacity={0.6}
        />
        {/* VRM v2.1 — hard value floor at normalized 4.0 (replaces v2.0 6.0 line) */}
        <line
          x1={MARGIN.left} y1={yScale(4)} x2={width - MARGIN.right} y2={yScale(4)}
          stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} opacity={0.7}
        />
        <rect
          x={MARGIN.left} y={yScale(4)}
          width={width - MARGIN.right - MARGIN.left}
          height={height - MARGIN.bottom - yScale(4)}
          fill="#f1f5f9" opacity={0.5}
        />
        <text
          x={MARGIN.left + 8}
          y={yScale(4) + 14}
          fontSize={9}
          fill="#475569"
          opacity={0.75}
          fontStyle="italic"
        >
          Hard value floor (norm. 4.0)
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

        {/* Bubbles */}
        {data.map((point, i) => {
          const cx = xScale(point.x);
          const cy = yScale(point.y);
          const r = sizeScale(point.z);  // z = TTV bubble score (0-1)
          const isConditional = point.quadrantV2 === 'conditional_champion'
            || (point.priorityTier ?? '').includes('Conditional Champion');
          const fillColor = isConditional
            ? '#fbbf24'
            : point.priorityTier
              ? getTierColorValue(point.priorityTier)
              : point.color;
          const isHovered = hoveredIndex === i;
          const isDimmed = hoveredIndex !== null && hoveredIndex !== i;

          return (
            <motion.circle
              key={point.name}
              cx={cx}
              cy={cy}
              fill={fillColor}
              stroke={isConditional ? '#b45309' : 'rgba(255,255,255,0.8)'}
              strokeDasharray={isConditional ? '4 3' : undefined}
              initial={{ r: 0, opacity: 0 }}
              animate={{
                r,
                opacity: isDimmed ? 0.25 : 0.85,
                strokeWidth: isConditional ? 2 : (isHovered ? 2.5 : 1),
              }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              style={{ cursor: 'pointer' }}
              onClick={() => onBubbleClick?.(point)}
            />
          );
        })}

        {/* Direct bubble labels (for ≤12 use cases) */}
        {data.length <= 12 && data.map((point, i) => {
          const cx = xScale(point.x);
          const cy = yScale(point.y);
          const r = sizeScale(point.z);
          const isDimmed = hoveredIndex !== null && hoveredIndex !== i;
          const labelText = point.name.length > 22
            ? point.name.slice(0, 20) + '...'
            : point.name;

          return (
            <motion.text
              key={`label-${point.name}`}
              x={cx}
              y={cy - r - 5}
              textAnchor="middle"
              fontSize={9}
              fontWeight={500}
              fill="#334155"
              className="pointer-events-none select-none"
              animate={{ opacity: isDimmed ? 0.15 : 0.8 }}
              transition={{ duration: 0.2 }}
            >
              {labelText}
            </motion.text>
          );
        })}
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

      {/* Tier legend — VRM v2.0 with Conditional Champion */}
      <div className="flex flex-wrap justify-center gap-4 mt-3 text-[11px]">
        {(['Champion', 'Quick Win', 'Strategic', 'Foundation'] as const).map(tier => (
          <div key={tier} className="flex items-center gap-1.5 text-slate-400">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getTierColorValue(tier) }}
            />
            {tier}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-slate-400">
          <div
            className="w-2.5 h-2.5 rounded-full border-2 border-amber-700"
            style={{ backgroundColor: '#fbbf24', borderStyle: 'dashed' }}
          />
          Conditional Champion
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 ml-2">
          <svg width="16" height="12" className="text-slate-400">
            <circle cx="4" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1" />
            <circle cx="11" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          Smaller bubble = Faster TTV
        </div>
      </div>
    </div>
  );
}
