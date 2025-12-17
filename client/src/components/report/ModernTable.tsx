import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  ChevronUp, 
  ChevronDown, 
  ChevronsUpDown,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle
} from 'lucide-react';
import { format } from '@/lib/formatters';

export interface TableColumn<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: T, index: number) => React.ReactNode;
}

export interface ModernTableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  title?: string;
  emptyMessage?: string;
  striped?: boolean;
  hoverable?: boolean;
  compact?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

const priorityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

const severityConfig: Record<string, { 
  icon: React.ElementType; 
  colors: string;
  iconColor: string;
}> = {
  critical: {
    icon: AlertTriangle,
    colors: 'bg-red-100 text-red-700 border-red-200',
    iconColor: 'text-red-600',
  },
  high: {
    icon: AlertCircle,
    colors: 'bg-orange-100 text-orange-700 border-orange-200',
    iconColor: 'text-orange-600',
  },
  medium: {
    icon: Info,
    colors: 'bg-blue-100 text-blue-700 border-blue-200',
    iconColor: 'text-blue-600',
  },
  low: {
    icon: CheckCircle,
    colors: 'bg-green-100 text-green-700 border-green-200',
    iconColor: 'text-green-600',
  },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const normalizedPriority = (priority || 'unknown').toLowerCase();
  const colorClass = priorityColors[normalizedPriority] || 'bg-gray-100 text-gray-700 border-gray-200';
  
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>
      {priority || 'Unknown'}
    </span>
  );
}

export interface SeverityBadgeProps {
  severity: string;
  showIcon?: boolean;
  showLabel?: boolean;
}

export function SeverityBadge({ severity, showIcon = true, showLabel = true }: SeverityBadgeProps) {
  const normalizedSeverity = (severity || 'unknown').toLowerCase();
  const config = severityConfig[normalizedSeverity] || {
    icon: Info,
    colors: 'bg-gray-100 text-gray-700 border-gray-200',
    iconColor: 'text-gray-500',
  };
  
  const Icon = config.icon;
  
  return (
    <span 
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.colors}`}
      data-testid={`severity-badge-${normalizedSeverity}`}
    >
      {showIcon && <Icon className={`w-3.5 h-3.5 ${config.iconColor}`} />}
      {showLabel && <span>{severity}</span>}
    </span>
  );
}

export interface ValueCellProps {
  value: number | string;
  prefix?: string;
  suffix?: string;
  align?: 'left' | 'right';
  highlight?: boolean;
}

export function ValueCell({ 
  value, 
  prefix = '$', 
  suffix = '',
  align = 'right',
  highlight = false 
}: ValueCellProps) {
  let formattedValue: string;
  if (typeof value === 'number') {
    // Use centralized formatter, but handle custom prefix/suffix
    if (prefix === '$' && suffix === '') {
      formattedValue = format.currencyAuto(value);
    } else {
      // Custom prefix/suffix handling
      const absValue = Math.abs(value);
      if (absValue >= 1000000) {
        formattedValue = `${prefix}${(absValue / 1000000).toFixed(1)}M${suffix}`;
      } else if (absValue >= 1000) {
        formattedValue = `${prefix}${(absValue / 1000).toFixed(0)}K${suffix}`;
      } else {
        formattedValue = `${prefix}${absValue.toLocaleString()}${suffix}`;
      }
    }
  } else {
    formattedValue = value == null ? '—' : String(value);
  }

  return (
    <span 
      className={`font-semibold tabular-nums ${highlight ? 'text-blueally-green' : 'text-blueally-navy'} ${align === 'right' ? 'text-right block' : ''}`}
    >
      {formattedValue}
    </span>
  );
}

export function NumberCell({ value, decimals = 0 }: { value: number | null | undefined; decimals?: number }) {
  if (value == null || !isFinite(value)) {
    return (
      <span className="font-medium tabular-nums text-right block text-blueally-slate">
        —
      </span>
    );
  }
  
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  
  return (
    <span className="font-medium tabular-nums text-right block text-blueally-slate">
      {formatted}
    </span>
  );
}

export function PercentCell({ value, showSign = false }: { value: number | null | undefined; showSign?: boolean }) {
  if (value == null || !isFinite(value)) {
    return (
      <span className="font-medium tabular-nums text-right block text-slate-400">
        —
      </span>
    );
  }
  
  const formatted = format.percent(value, { showSign });
  const isPositive = value >= 0;
  
  return (
    <span className={`font-medium tabular-nums text-right block ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {formatted}
    </span>
  );
}

export function ModernTable<T extends Record<string, any>>({
  data,
  columns,
  title,
  emptyMessage = 'No data available',
  striped = true,
  hoverable = true,
  compact = false,
}: ModernTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (column: TableColumn<T>) => {
    if (!column.sortable) return;

    const key = String(column.key);
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortKey(null);
        setSortDirection(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortKey, sortDirection]);

  const getSortIcon = (column: TableColumn<T>) => {
    if (!column.sortable) return null;

    const key = String(column.key);
    if (sortKey !== key) {
      return <ChevronsUpDown className="w-4 h-4 text-gray-400" />;
    }
    return sortDirection === 'asc' 
      ? <ChevronUp className="w-4 h-4 text-blueally-navy" />
      : <ChevronDown className="w-4 h-4 text-blueally-navy" />;
  };

  const getValue = (row: T, key: string): any => {
    if (key.includes('.')) {
      return key.split('.').reduce((obj, k) => obj?.[k], row);
    }
    return row[key];
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden"
      data-testid="modern-table"
    >
      {title && (
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-blueally-slate">{title}</h3>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-gray-200">
              {columns.map((column, index) => (
                <th
                  key={index}
                  className={`
                    ${compact ? 'px-4 py-2' : 'px-6 py-3'}
                    text-${column.align || 'left'}
                    text-xs font-semibold text-gray-600 uppercase tracking-wider
                    ${column.sortable ? 'cursor-pointer hover:bg-slate-100 transition-colors' : ''}
                  `}
                  style={{ width: column.width }}
                  onClick={() => handleSort(column)}
                >
                  <div className={`flex items-center gap-2 ${column.align === 'right' ? 'justify-end' : column.align === 'center' ? 'justify-center' : ''}`}>
                    {column.header}
                    {getSortIcon(column)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`
                    border-b border-gray-100 last:border-0
                    ${striped && rowIndex % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}
                    ${hoverable ? 'hover:bg-blue-50/50 transition-colors' : ''}
                  `}
                  data-testid={`table-row-${rowIndex}`}
                >
                  {columns.map((column, colIndex) => {
                    const value = getValue(row, String(column.key));
                    return (
                      <td
                        key={colIndex}
                        className={`
                          ${compact ? 'px-4 py-2' : 'px-6 py-4'}
                          text-${column.align || 'left'}
                          text-sm text-gray-700
                        `}
                      >
                        {column.render 
                          ? column.render(value, row, rowIndex)
                          : value}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

export default ModernTable;
