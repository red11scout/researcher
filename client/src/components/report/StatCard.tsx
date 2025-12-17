import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, LucideIcon } from 'lucide-react';
import { format } from '@/lib/formatters';

export interface StatCardProps {
  value: number | string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  growth?: number;
  color?: 'navy' | 'royal' | 'green' | 'orange' | 'default';
  prefix?: string;
  suffix?: string;
  animate?: boolean;
}

const colorMap = {
  navy: {
    bg: 'bg-gradient-to-br from-blueally-navy to-blueally-royal',
    text: 'text-white',
    accent: 'text-blue-200',
    iconBg: 'bg-white/20',
  },
  royal: {
    bg: 'bg-gradient-to-br from-blueally-royal to-blue-400',
    text: 'text-white',
    accent: 'text-blue-100',
    iconBg: 'bg-white/20',
  },
  green: {
    bg: 'bg-gradient-to-br from-blueally-green to-emerald-500',
    text: 'text-white',
    accent: 'text-green-100',
    iconBg: 'bg-white/20',
  },
  orange: {
    bg: 'bg-gradient-to-br from-blueally-orange to-amber-500',
    text: 'text-white',
    accent: 'text-orange-100',
    iconBg: 'bg-white/20',
  },
  default: {
    bg: 'bg-white border border-gray-100',
    text: 'text-blueally-slate',
    accent: 'text-gray-500',
    iconBg: 'bg-blueally-softblue',
  },
};

function AnimatedNumber({ 
  value, 
  prefix = '', 
  suffix = '',
  animate = true,
  formatter = format.currencyAuto
}: { 
  value: number; 
  prefix?: string; 
  suffix?: string;
  animate?: boolean;
  formatter?: (v: number) => string;
}) {
  const [displayValue, setDisplayValue] = useState(animate ? 0 : value);

  useEffect(() => {
    if (!animate) {
      setDisplayValue(value);
      return;
    }

    let start = 0;
    const end = value;
    const duration = 2000;
    const startTime = Date.now();

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      setDisplayValue(start + (end - start) * easeOut);

      if (progress >= 1) {
        clearInterval(timer);
        setDisplayValue(end);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [value, animate]);

  // Handle null/undefined values with em-dash
  if (value == null || isNaN(value)) {
    return <span className="tabular-nums">—</span>;
  }

  // Use centralized formatter for consistent formatting
  const formattedValue = formatter(displayValue);
  
  // Skip prefix/suffix if formatter already handles them (currency formatters include $)
  const isCurrencyFormatter = formatter === format.currencyAuto || formatter === format.currency;
  const finalPrefix = isCurrencyFormatter ? '' : prefix;
  const finalSuffix = isCurrencyFormatter ? '' : suffix;

  return (
    <span className="tabular-nums">
      {finalPrefix}{formattedValue}{finalSuffix}
    </span>
  );
}

export function StatCard({
  value,
  label,
  description,
  icon: Icon,
  growth,
  color = 'default',
  prefix = '',
  suffix = '',
  animate = true,
}: StatCardProps) {
  const colors = colorMap[color];
  const numericValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
  const isPositiveGrowth = growth !== undefined && growth >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative overflow-hidden rounded-xl p-6 shadow-stat hover:shadow-card-hover transition-all duration-300 ${colors.bg}`}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {Icon && (
        <div className={`absolute top-4 right-4 p-2 rounded-lg ${colors.iconBg}`}>
          <Icon className={`w-5 h-5 ${color === 'default' ? 'text-blueally-navy' : 'text-white/80'}`} />
        </div>
      )}

      <div className="relative z-10">
        <p className={`text-sm font-medium uppercase tracking-wider mb-2 ${colors.accent}`}>
          {label}
        </p>
        
        <div className={`text-4xl font-bold tracking-tight mb-2 tabular-nums ${colors.text}`}>
          {typeof numericValue === 'number' && !isNaN(numericValue) ? (
            <AnimatedNumber value={numericValue} prefix={prefix} suffix={suffix} animate={animate} />
          ) : (
            <span>{prefix}{value}{suffix}</span>
          )}
        </div>

        {growth !== undefined && (
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
            color === 'default' 
              ? isPositiveGrowth ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              : 'bg-white/20 text-white'
          }`}>
            {isPositiveGrowth ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {isPositiveGrowth ? '+' : ''}{growth}%
          </div>
        )}

        {description && (
          <p className={`mt-3 text-sm ${colors.accent}`}>
            {description}
          </p>
        )}
      </div>

      {color !== 'default' && (
        <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/5 rounded-full" />
      )}
    </motion.div>
  );
}

export default StatCard;
