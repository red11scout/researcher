import React from 'react';
import { TrendingUp, PiggyBank, Coins, Shield, LucideIcon } from 'lucide-react';

export type DriverType = 'revenue' | 'cost' | 'cashflow' | 'risk';

export interface DriverBadgeProps {
  driver: DriverType | string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  variant?: 'default' | 'filled' | 'outline';
}

interface DriverConfig {
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}

const driverConfigs: Record<string, DriverConfig> = {
  revenue: {
    icon: TrendingUp,
    color: '#059669',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    label: 'Revenue Growth',
  },
  'revenue growth': {
    icon: TrendingUp,
    color: '#059669',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    label: 'Revenue Growth',
  },
  cost: {
    icon: PiggyBank,
    color: '#0339AF',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    label: 'Cost Reduction',
  },
  'cost reduction': {
    icon: PiggyBank,
    color: '#0339AF',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    label: 'Cost Reduction',
  },
  cashflow: {
    icon: Coins,
    color: '#4C73E9',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    label: 'Cash Flow',
  },
  'cash flow': {
    icon: Coins,
    color: '#4C73E9',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    label: 'Cash Flow',
  },
  risk: {
    icon: Shield,
    color: '#D97706',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    label: 'Risk Mitigation',
  },
  'risk mitigation': {
    icon: Shield,
    color: '#D97706',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    label: 'Risk Mitigation',
  },
};

const sizeStyles = {
  sm: {
    container: 'px-2 py-0.5 gap-1',
    icon: 'w-3 h-3',
    text: 'text-xs',
  },
  md: {
    container: 'px-2.5 py-1 gap-1.5',
    icon: 'w-4 h-4',
    text: 'text-sm',
  },
  lg: {
    container: 'px-3 py-1.5 gap-2',
    icon: 'w-5 h-5',
    text: 'text-base',
  },
};

export function DriverBadge({
  driver,
  size = 'md',
  showLabel = true,
  variant = 'default',
}: DriverBadgeProps) {
  const normalizedDriver = (driver || 'unknown').toLowerCase();
  const config = driverConfigs[normalizedDriver] || {
    icon: TrendingUp,
    color: '#64748B',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    label: driver || 'Unknown',
  };

  const Icon = config.icon;
  const styles = sizeStyles[size];

  const variantStyles = {
    default: `${config.bgColor} ${config.borderColor} border`,
    filled: 'text-white',
    outline: `${config.borderColor} border-2 bg-transparent`,
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${styles.container} ${variantStyles[variant]}`}
      style={variant === 'filled' ? { backgroundColor: config.color } : undefined}
      data-testid={`driver-badge-${normalizedDriver}`}
    >
      <Icon 
        className={styles.icon} 
        style={{ color: variant === 'filled' ? 'white' : config.color }} 
      />
      {showLabel && (
        <span 
          className={styles.text}
          style={{ color: variant === 'filled' ? 'white' : config.color }}
        >
          {config.label}
        </span>
      )}
    </span>
  );
}

export function getDriverIcon(driver: string): LucideIcon {
  const normalizedDriver = (driver || 'unknown').toLowerCase();
  return driverConfigs[normalizedDriver]?.icon || TrendingUp;
}

export function getDriverColor(driver: string): string {
  const normalizedDriver = (driver || 'unknown').toLowerCase();
  return driverConfigs[normalizedDriver]?.color || '#64748B';
}

export default DriverBadge;
