import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Legend,
  Tooltip,
} from 'recharts';
import { chartColors, chartConfig } from './chart-config';
import { format } from '@/lib/formatters';

interface BenefitsChartProps {
  data: {
    revenue: number;
    cost: number;
    cash: number;
    risk: number;
  };
}

export function BenefitsChart({ data }: BenefitsChartProps) {
  const chartData = [
    { name: 'Revenue', value: data.revenue, color: chartColors.benefits.revenue },
    { name: 'Cost Savings', value: data.cost, color: chartColors.benefits.cost },
    { name: 'Cash Flow', value: data.cash, color: chartColors.benefits.cash },
    { name: 'Risk Mitigation', value: data.risk, color: chartColors.benefits.risk },
  ].filter(d => d.value > 0);

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  if (chartData.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-slate-500">
        No benefit data available
      </div>
    );
  }

  return (
    <div className="h-80 relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            animationDuration={chartConfig.animation.duration}
          >
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => format.currencyAuto(value)}
            contentStyle={{
              backgroundColor: chartConfig.tooltip.backgroundColor,
              border: 'none',
              borderRadius: chartConfig.tooltip.borderRadius,
              color: chartConfig.tooltip.textColor,
              fontSize: chartConfig.fontSize.label,
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => (
              <span style={{ fontSize: chartConfig.fontSize.legend, color: '#64748B' }}>
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: '36px' }}>
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-900" data-testid="text-total-benefits">
            {format.currencyAuto(total)}
          </p>
          <p className="text-sm text-slate-500">Total</p>
        </div>
      </div>
    </div>
  );
}
