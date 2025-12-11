import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

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

export function PriorityBadge({ priority }: { priority: string }) {
  const normalizedPriority = priority.toLowerCase();
  const colorClass = priorityColors[normalizedPriority] || 'bg-gray-100 text-gray-700 border-gray-200';
  
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>
      {priority}
    </span>
  );
}

export function ValueCell({ value, prefix = '$' }: { value: number | string; prefix?: string }) {
  const formattedValue = typeof value === 'number'
    ? value >= 1000000
      ? `${prefix}${(value / 1000000).toFixed(1)}M`
      : value >= 1000
      ? `${prefix}${(value / 1000).toFixed(0)}K`
      : `${prefix}${value.toFixed(0)}`
    : value;

  return (
    <span className="font-semibold text-blueally-navy">{formattedValue}</span>
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
