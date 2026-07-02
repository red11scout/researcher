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
}

interface QuadrantBubbleChartProps {
  data: MatrixDataPoint[];
  onBubbleClick?: (point: MatrixDataPoint) => void;
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

export function QuadrantBubbleChart({ data, onBubbleClick }: QuadrantBubbleChartProps) {
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

  // Dynamic axis domains based on actual data, with padding
  const { xDomain, yDomain, midXValue, midYValue } = useMemo(() => {
    if (data.length === 0) {
      return { xDomain: [1, 10] as [number, number], yDomain: [1, 10] as [number, number], midXValue: 5.5, midYValue: 5.5 };
    }

    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);

    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    // Compute the data midpoint for the quadrant divider
    const xMid = (xMin + xMax) / 2;
    const yMid = (yMin + yMax) / 2;

    // Add padding around the data range (at least 1 unit on each side)
    const xPad = Math.max(1, (xMax - xMin) * 0.3);
    const yPad = Math.max(1, (yMax - yMin) * 0.3);

    // Ensure minimum range of 4 units so chart isn't too zoomed
    let xLow = Math.floor(xMin - xPad);
    let xHigh = Math.ceil(xMax + xPad);
    if (xHigh - xLow < 4) {
      const center = (xLow + xHigh) / 2;
      xLow = center - 2;
      xHigh = center + 2;
    }

    let yLow = Math.floor(yMin - yPad);
    let yHigh = Math.ceil(yMax + yPad);
    if (yHigh - yLow < 4) {
      const center = (yLow + yHigh) / 2;
      yLow = center - 2;
      yHigh = center + 2;
    }

    // Clamp to reasonable bounds (0-11 to allow slight overflow)
    xLow = Math.max(0, xLow);
    xHigh = Math.min(11, xHigh);
    yLow = Math.max(0, yLow);
    yHigh = Math.min(11, yHigh);

    return {
      xDomain: [xLow, xHigh] as [number, number],
      yDomain: [yLow, yHigh] as [number, number],
      midXValue: xMid,
      midYValue: yMid,
    };
  }, [data]);

  // D3 scales with dynamic domains
  const xScale = useMemo(
    () => scaleLinear().domain(xDomain).range([MARGIN.left, width - MARGIN.right]),
    [width, xDomain]
  );
  const yScale = useMemo(
    () => scaleLinear().domain(yDomain).range([height - MARGIN.bottom, MARGIN.top]),
    [height, yDomain]
  );

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
          fill={QUADRANT_COLORS.champion} opacity={0.85}
        />
        <rect
          x={MARGIN.left} y={MARGIN.top}
          width={midX - MARGIN.left} height={midY - MARGIN.top}
          fill={QUADRANT_COLORS.strategicBet} opacity={0.85}
        />
        <rect
          x={midX} y={midY}
          width={width - MARGIN.right - midX} height={height - MARGIN.bottom - midY}
          fill={QUADRANT_COLORS.quickWin} opacity={0.85}
        />
        <rect
          x={MARGIN.left} y={midY}
          width={midX - MARGIN.left} height={height - MARGIN.bottom - midY}
          fill={QUADRANT_COLORS.foundation} opacity={0.85}
        />

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

        {/* Midpoint divider lines */}
        <line
          x1={midX} y1={MARGIN.top} x2={midX} y2={height - MARGIN.bottom}
          stroke="#475569" strokeDasharray="6 4" strokeWidth={1.5} opacity={0.6}
        />
        <line
          x1={MARGIN.left} y1={midY} x2={width - MARGIN.right} y2={midY}
          stroke="#475569" strokeDasharray="6 4" strokeWidth={1.5} opacity={0.6}
        />

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
          Normalized Annual Value
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
          const fillColor = point.priorityTier
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
              stroke="rgba(255,255,255,0.8)"
              initial={{ r: 0, opacity: 0 }}
              animate={{
                r,
                opacity: isDimmed ? 0.25 : 0.85,
                strokeWidth: isHovered ? 2.5 : 1,
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
              {hoveredPoint.description && (
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed line-clamp-2">
                  {hoveredPoint.description}
                </p>
              )}
              <p className="text-[10px] text-slate-300 mt-2 italic">Click for details</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tier legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-3 text-[11px]">
        {(['Champions', 'Quick Wins', 'Strategic', 'Foundations'] as const).map(tier => (
          <div key={tier} className="flex items-center gap-1.5 text-slate-400">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getTierColorValue(tier) }}
            />
            {tier}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-slate-400 ml-2">
          <svg width="16" height="12" className="text-slate-400">
            <circle cx="4" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1" />
            <circle cx="11" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          Faster TTV = Larger
        </div>
      </div>
    </div>
  );
}
