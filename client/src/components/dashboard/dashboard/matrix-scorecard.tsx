import { useState, useMemo } from 'react';
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

interface MatrixScorecardProps {
  data: MatrixDataPoint[];
  onRowClick?: (point: MatrixDataPoint) => void;
}

type SortKey = 'name' | 'y' | 'x' | 'timeToValue' | 'z' | 'priorityScore' | 'priorityTier';
type SortDir = 'asc' | 'desc';

const TIER_COLORS = chartColors.tier;

function getScoreIntensity(value: number, max: number): string {
  const ratio = max > 0 ? value / max : 0;
  if (ratio >= 0.8) return 'bg-blue-700/20 text-blue-200';
  if (ratio >= 0.6) return 'bg-blue-600/15 text-blue-300';
  if (ratio >= 0.4) return 'bg-blue-500/10 text-blue-300';
  if (ratio >= 0.2) return 'bg-blue-400/5 text-slate-400';
  return 'text-slate-500';
}

function getTierBadge(tier?: string): string {
  if (!tier) return 'bg-slate-500/50 text-white';
  if (tier.includes('Champion')) return 'bg-emerald-700/80 text-white';
  if (tier.includes('Quick Win')) return 'bg-teal-600/80 text-white';
  if (tier.includes('Strategic')) return 'bg-blue-700/80 text-white';
  if (tier.includes('Foundation')) return 'bg-slate-500/50 text-white';
  // Legacy
  switch (tier) {
    case 'Critical': return 'bg-slate-800 text-white';
    case 'High': return 'bg-blue-700/80 text-white';
    case 'Medium': return 'bg-blue-500/60 text-white';
    case 'Low': return 'bg-slate-500/50 text-white';
    default: return 'bg-slate-500/50 text-white';
  }
}

export function MatrixScorecard({ data, onRowClick }: MatrixScorecardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('priorityScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;

      switch (sortKey) {
        case 'name': av = a.name; bv = b.name; break;
        case 'y': av = a.y; bv = b.y; break;
        case 'x': av = a.x; bv = b.x; break;
        case 'timeToValue': av = a.timeToValue || 6; bv = b.timeToValue || 6; break;
        case 'z': av = a.z; bv = b.z; break;
        case 'priorityScore': av = a.priorityScore || 0; bv = b.priorityScore || 0; break;
        case 'priorityTier': av = a.priorityTier || ''; bv = b.priorityTier || ''; break;
      }

      if (typeof av === 'string') {
        const cmp = av.localeCompare(bv as string);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="text-slate-600 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400">
        No scorecard data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700/50">
            <th
              className="text-left py-2 px-3 text-slate-400 font-semibold cursor-pointer hover:text-slate-200 transition-colors"
              onClick={() => toggleSort('name')}
            >
              Use Case <SortIcon col="name" />
            </th>
            <th
              className="text-center py-2 px-2 text-slate-400 font-semibold cursor-pointer hover:text-slate-200 transition-colors"
              onClick={() => toggleSort('y')}
            >
              Value <SortIcon col="y" />
            </th>
            <th
              className="text-center py-2 px-2 text-slate-400 font-semibold cursor-pointer hover:text-slate-200 transition-colors"
              onClick={() => toggleSort('x')}
            >
              Readiness <SortIcon col="x" />
            </th>
            <th
              className="text-center py-2 px-2 text-slate-400 font-semibold cursor-pointer hover:text-slate-200 transition-colors"
              onClick={() => toggleSort('timeToValue')}
            >
              TTV <SortIcon col="timeToValue" />
            </th>
            <th
              className="text-center py-2 px-2 text-slate-400 font-semibold cursor-pointer hover:text-slate-200 transition-colors"
              onClick={() => toggleSort('z')}
            >
              TTV Score <SortIcon col="z" />
            </th>
            <th
              className="text-center py-2 px-2 text-slate-400 font-semibold cursor-pointer hover:text-slate-200 transition-colors"
              onClick={() => toggleSort('priorityScore')}
            >
              Priority <SortIcon col="priorityScore" />
            </th>
            <th
              className="text-center py-2 px-2 text-slate-400 font-semibold cursor-pointer hover:text-slate-200 transition-colors"
              onClick={() => toggleSort('priorityTier')}
            >
              Tier <SortIcon col="priorityTier" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((point, i) => (
            <tr
              key={point.name}
              className="border-b border-slate-700/30 hover:bg-white/5 cursor-pointer transition-colors"
              onClick={() => onRowClick?.(point)}
            >
              <td className="py-2.5 px-3 text-slate-200 font-medium max-w-[200px] truncate">
                {point.name}
              </td>
              <td className={`py-2.5 px-2 text-center font-mono tabular-nums rounded ${getScoreIntensity(point.y, 10)}`}>
                {point.annualValue ? format.currencyAuto(point.annualValue) : `${Math.round(point.y * 10) / 10}/10`}
              </td>
              <td className={`py-2.5 px-2 text-center font-mono tabular-nums rounded ${getScoreIntensity(point.x, 10)}`}>
                {Math.round(point.x * 10) / 10}/10
              </td>
              <td className={`py-2.5 px-2 text-center font-mono tabular-nums rounded ${getScoreIntensity(100 - (point.timeToValue || 6) * 4, 100)}`}>
                {point.timeToValue ? `${point.timeToValue}mo` : '—'}
              </td>
              <td className={`py-2.5 px-2 text-center font-mono tabular-nums rounded ${getScoreIntensity(point.z * 100, 100)}`}>
                {Math.round(point.z * 100) / 100}
              </td>
              <td className={`py-2.5 px-2 text-center font-mono tabular-nums rounded ${getScoreIntensity(point.priorityScore || 0, 10)}`}>
                {point.priorityScore ? `${Math.round(point.priorityScore * 10) / 10}/10` : '—'}
              </td>
              <td className="py-2.5 px-2 text-center">
                <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${getTierBadge(point.priorityTier)}`}>
                  {point.priorityTier || point.type}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
