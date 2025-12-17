import { AnimatedNumber } from './animated-number';
import { format } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

interface MetricCardProps {
  label: string;
  value: number;
  previousValue?: number;
  formatter?: (value: number) => string;
  description?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'highlight' | 'muted';
}

export function MetricCard({
  label,
  value,
  formatter = format.currency,
  description,
  icon,
  trend,
  trendValue,
  size = 'md',
  variant = 'default',
}: MetricCardProps) {
  const sizeClasses = {
    sm: { card: 'p-4', label: 'text-xs', value: 'text-xl', trend: 'text-xs' },
    md: { card: 'p-6', label: 'text-sm', value: 'text-3xl', trend: 'text-sm' },
    lg: { card: 'p-8', label: 'text-base', value: 'text-4xl', trend: 'text-base' },
  };

  const variantClasses = {
    default: 'bg-white border-slate-200',
    highlight: 'bg-gradient-to-br from-brand-navy to-brand-blue text-white border-transparent',
    muted: 'bg-slate-50 border-slate-100',
  };

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-400';

  return (
    <div className={cn(
      'rounded-xl border shadow-sm transition-all hover:shadow-md',
      sizeClasses[size].card,
      variantClasses[variant],
    )}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-slate-400">{icon}</span>}
          <span className={cn(
            'font-medium uppercase tracking-wide',
            sizeClasses[size].label,
            variant === 'highlight' ? 'text-white/80' : 'text-slate-500',
          )}>
            {label}
          </span>
        </div>
        {description && (
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-4 h-4 text-slate-300 hover:text-slate-500 transition-colors" />
            </TooltipTrigger>
            <TooltipContent>{description}</TooltipContent>
          </Tooltip>
        )}
      </div>
      
      <div className={cn(
        'font-semibold tracking-tight',
        sizeClasses[size].value,
        variant === 'highlight' ? 'text-white' : 'text-slate-900',
      )}>
        <AnimatedNumber value={value} formatter={formatter} />
      </div>
      
      {(trend || trendValue !== undefined) && (
        <div className={cn('flex items-center gap-1 mt-2', sizeClasses[size].trend, trendColor)}>
          <TrendIcon className="w-4 h-4" />
          {trendValue !== undefined && (
            <span>{format.percent(trendValue, { showSign: true })}</span>
          )}
        </div>
      )}
    </div>
  );
}
