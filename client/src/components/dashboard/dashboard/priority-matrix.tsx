import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  ResponsiveContainer,
  Tooltip,
  Cell,
} from 'recharts';
import { chartColors, chartConfig } from './chart-config';

interface UseCase {
  useCase?: string;
  name?: string;
  tier?: string;
  priority?: string;
  priorityScore?: number;
}

interface PriorityMatrixProps {
  useCases: UseCase[];
}

export function PriorityMatrix({ useCases }: PriorityMatrixProps) {
  const priorityCounts = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };

  useCases.forEach(uc => {
    const tier = uc.tier || uc.priority || 'Medium';
    if (tier in priorityCounts) {
      priorityCounts[tier as keyof typeof priorityCounts]++;
    }
  });

  const chartData = [
    { name: 'Critical', count: priorityCounts.Critical, color: chartColors.priority.critical },
    { name: 'High', count: priorityCounts.High, color: chartColors.priority.high },
    { name: 'Medium', count: priorityCounts.Medium, color: chartColors.priority.medium },
    { name: 'Low', count: priorityCounts.Low, color: chartColors.priority.low },
  ].filter(d => d.count > 0);

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500">
        No priority data available
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical">
          <XAxis 
            type="number" 
            tick={{ fontSize: chartConfig.fontSize.tick, fill: chartConfig.axis.labelFill }}
            axisLine={{ stroke: chartConfig.axis.stroke }}
          />
          <YAxis 
            type="category" 
            dataKey="name" 
            tick={{ fontSize: chartConfig.fontSize.tick, fill: chartConfig.axis.labelFill }}
            axisLine={{ stroke: chartConfig.axis.stroke }}
            width={70}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: chartConfig.tooltip.backgroundColor,
              border: 'none',
              borderRadius: chartConfig.tooltip.borderRadius,
              color: chartConfig.tooltip.textColor,
              fontSize: chartConfig.fontSize.label,
            }}
            formatter={(value: number) => [`${value} use cases`, 'Count']}
          />
          <Bar 
            dataKey="count" 
            animationDuration={chartConfig.animation.duration}
            radius={[0, 4, 4, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
