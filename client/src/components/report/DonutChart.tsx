import React from 'react';
import { motion } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { format } from '@/lib/formatters';

export interface DonutChartItem {
  name: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: DonutChartItem[];
  total?: number | string;
  totalLabel?: string;
  title?: string;
  height?: number;
  formatValue?: (value: number) => string;
}

const defaultColors = [
  '#0339AF', // Navy
  '#4C73E9', // Royal
  '#7A8B51', // Green
  '#D97706', // Orange
  '#00B4D8', // Cyan
  '#A3C585', // Light Green
];

export function DonutChart({
  data,
  total,
  totalLabel = 'Total Value',
  title,
  height = 320,
  formatValue = (v: number) => format.currencyAuto(v),
}: DonutChartProps) {
  const chartData = data.map((item, index) => ({
    ...item,
    color: item.color || defaultColors[index % defaultColors.length],
  }));

  const calculatedTotal = total ?? data.reduce((sum, item) => sum + item.value, 0);
  const displayTotal = typeof calculatedTotal === 'number' 
    ? formatValue(calculatedTotal) 
    : calculatedTotal;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const percentage = ((item.value / (typeof calculatedTotal === 'number' ? calculatedTotal : 0)) * 100).toFixed(1);
      return (
        <div className="bg-white px-4 py-3 rounded-lg shadow-lg border border-gray-100">
          <p className="font-semibold text-blueally-slate">{item.name}</p>
          <p className="text-lg font-bold" style={{ color: item.color }}>
            {formatValue(item.value)}
          </p>
          <p className="text-sm text-gray-500">{percentage}% of total</p>
        </div>
      );
    }
    return null;
  };

  const renderCustomizedLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
  }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.05) return null;

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const renderLegend = ({ payload }: any) => (
    <div className="flex flex-wrap justify-center gap-4 mt-4">
      {payload.map((entry: any, index: number) => (
        <div key={`legend-${index}`} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm text-gray-600 font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-white rounded-xl p-6 shadow-card border border-gray-100"
      data-testid="donut-chart"
    >
      {title && (
        <h3 className="text-lg font-semibold text-blueally-slate mb-4">{title}</h3>
      )}

      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="45%"
              innerRadius={70}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              labelLine={false}
              label={renderCustomizedLabel}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} />
          </PieChart>
        </ResponsiveContainer>

        <div className="absolute top-[38%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">{totalLabel}</p>
          <p className="text-2xl font-bold text-blueally-navy">{displayTotal}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default DonutChart;
