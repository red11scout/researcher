import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

export interface ValueBreakdownItem {
  name: string;
  value: number;
  color?: string;
}

export interface ValueBreakdownChartProps {
  data: ValueBreakdownItem[];
  title?: string;
  height?: number;
  formatValue?: (value: number) => string;
}

const defaultColors = {
  Revenue: '#7A8B51',
  Cost: '#0339AF',
  'Cash Flow': '#4C73E9',
  Risk: '#D97706',
};

const defaultFormatValue = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
};

export function ValueBreakdownChart({
  data,
  title,
  height = 300,
  formatValue = defaultFormatValue,
}: ValueBreakdownChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    color: item.color || defaultColors[item.name as keyof typeof defaultColors] || '#4C73E9',
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-white px-4 py-3 rounded-lg shadow-lg border border-gray-100">
          <p className="font-semibold text-blueally-slate">{item.name}</p>
          <p className="text-lg font-bold" style={{ color: item.color }}>
            {formatValue(item.value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white rounded-xl p-6 shadow-card border border-gray-100"
      data-testid="value-breakdown-chart"
    >
      {title && (
        <h3 className="text-lg font-semibold text-blueally-slate mb-4">{title}</h3>
      )}
      
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 80, left: 20, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
          <XAxis
            type="number"
            stroke="#64748B"
            fontSize={12}
            tickFormatter={(value) => formatValue(value)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#64748B"
            fontSize={13}
            fontWeight={500}
            width={100}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar
            dataKey="value"
            radius={[0, 6, 6, 0]}
            barSize={32}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(value: number) => formatValue(value)}
              style={{ 
                fill: '#1E293B', 
                fontSize: 13, 
                fontWeight: 600 
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export default ValueBreakdownChart;
