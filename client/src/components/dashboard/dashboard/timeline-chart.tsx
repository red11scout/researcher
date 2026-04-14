import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  ResponsiveContainer,
  Tooltip,
  Cell,
  CartesianGrid,
} from 'recharts';
import { chartColors, chartConfig } from './chart-config';
import { format } from '@/lib/formatters';

interface UseCase {
  useCase?: string;
  name?: string;
  tier?: string;
  priority?: string;
  timeToValue?: number;
  timeToValueMonths?: number;
  annualValue?: number;
  totalAnnualImpact?: number;
}

interface TimelineChartProps {
  useCases: UseCase[];
}

export function TimelineChart({ useCases }: TimelineChartProps) {
  const phases = [
    { name: 'Quick Wins (0-3 mo)', min: 0, max: 3 },
    { name: 'Short-term (3-6 mo)', min: 3, max: 6 },
    { name: 'Medium-term (6-12 mo)', min: 6, max: 12 },
    { name: 'Long-term (12+ mo)', min: 12, max: Infinity },
  ];

  const phaseData = phases.map(phase => {
    const phaseUseCases = useCases.filter(uc => {
      const ttv = uc.timeToValue || uc.timeToValueMonths || 6;
      return ttv >= phase.min && ttv < phase.max;
    });
    
    const totalValue = phaseUseCases.reduce((sum, uc) => {
      return sum + (uc.annualValue || uc.totalAnnualImpact || 0);
    }, 0);

    return {
      name: phase.name,
      count: phaseUseCases.length,
      value: totalValue,
      color: chartColors.primary[phases.indexOf(phase) % chartColors.primary.length],
    };
  }).filter(d => d.count > 0);

  if (phaseData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500">
        No timeline data available
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={phaseData}>
          <CartesianGrid 
            strokeDasharray={chartConfig.grid.strokeDasharray} 
            stroke={chartConfig.grid.stroke}
            vertical={false}
          />
          <XAxis 
            dataKey="name" 
            tick={{ fontSize: 10, fill: chartConfig.axis.labelFill }}
            axisLine={{ stroke: chartConfig.axis.stroke }}
            tickLine={false}
            interval={0}
            angle={-15}
            textAnchor="end"
            height={60}
          />
          <YAxis 
            tick={{ fontSize: chartConfig.fontSize.tick, fill: chartConfig.axis.labelFill }}
            axisLine={{ stroke: chartConfig.axis.stroke }}
            tickLine={false}
            tickFormatter={(value) => format.currencyAuto(value)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: chartConfig.tooltip.backgroundColor,
              border: 'none',
              borderRadius: chartConfig.tooltip.borderRadius,
              color: chartConfig.tooltip.textColor,
              fontSize: chartConfig.fontSize.label,
            }}
            formatter={(value: number, name: string) => {
              if (name === 'value') return [format.currencyAuto(value), 'Value'];
              return [value, name];
            }}
          />
          <Bar 
            dataKey="value" 
            animationDuration={chartConfig.animation.duration}
            radius={[4, 4, 0, 0]}
          >
            {phaseData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
