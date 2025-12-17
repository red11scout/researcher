/**
 * Enterprise Number Formatting System
 * Handles all numeric display with intelligence about context, scale, and user preference
 */

export interface FormatOptions {
  precision?: number;
  compact?: boolean;
  showSign?: boolean;
  locale?: string;
  animate?: boolean;
}

export type NumberFormatter = (value: number | null | undefined, options?: FormatOptions) => string;

// Core formatters with smart defaults
export const format: {
  currency: NumberFormatter;
  currencyAuto: NumberFormatter;
  percent: NumberFormatter;
  number: NumberFormatter;
  tokens: (value: number | null | undefined) => string;
  tokensPerMonth: (value: number | null | undefined) => string;
  multiplier: (value: number | null | undefined) => string;
  duration: (months: number | null | undefined) => string;
  range: (min: number, max: number, formatter?: (n: number) => string) => string;
} = {
  /**
   * Currency formatting with intelligent scaling
   * $1,234 | $1.2M | $1.2B
   */
  currency(value: number | null | undefined, options: FormatOptions = {}): string {
    if (value == null || !isFinite(value)) return '—';
    
    const { compact = false, showSign = false } = options;
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : (showSign && value > 0 ? '+' : '');
    
    if (compact && absValue >= 1_000_000_000) {
      return `${sign}$${(absValue / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    }
    if (compact && absValue >= 1_000_000) {
      return `${sign}$${(absValue / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (compact && absValue >= 10_000) {
      return `${sign}$${(absValue / 1_000).toFixed(0)}K`;
    }
    
    return `${sign}$${Math.round(absValue).toLocaleString('en-US')}`;
  },

  /**
   * Currency formatting with automatic compact mode for large values
   * Always uses compact notation for values >= 1M
   */
  currencyAuto(value: number | null | undefined, options: FormatOptions = {}): string {
    if (value == null || !isFinite(value)) return '—';
    
    const { showSign = false } = options;
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : (showSign && value > 0 ? '+' : '');
    
    if (absValue >= 1_000_000_000) {
      return `${sign}$${(absValue / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    }
    if (absValue >= 1_000_000) {
      return `${sign}$${(absValue / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (absValue >= 1_000) {
      return `${sign}$${(absValue / 1_000).toFixed(0)}K`;
    }
    
    return `${sign}$${Math.round(absValue).toLocaleString('en-US')}`;
  },

  /**
   * Percentage with intelligent precision
   * Shows 1 decimal only when value is < 10
   */
  percent(value: number | null | undefined, options: FormatOptions = {}): string {
    if (value == null || !isFinite(value)) return '—';
    
    const { showSign = false } = options;
    const sign = value < 0 ? '-' : (showSign && value > 0 ? '+' : '');
    const absValue = Math.abs(value);
    
    // Smart precision: show decimal for small percentages
    const formatted = absValue < 10 && absValue !== Math.floor(absValue)
      ? absValue.toFixed(1)
      : Math.round(absValue).toString();
    
    return `${sign}${formatted}%`;
  },

  /**
   * Large numbers with appropriate scale
   */
  number(value: number | null | undefined, options: FormatOptions = {}): string {
    if (value == null || !isFinite(value)) return '—';
    
    const { compact = false, precision = 0 } = options;
    const absValue = Math.abs(value);
    
    if (compact) {
      if (absValue >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
      if (absValue >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (absValue >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    }
    
    return precision > 0 
      ? value.toFixed(precision).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      : Math.round(value).toLocaleString('en-US');
  },

  /**
   * Token counts - always integers, comma-separated
   */
  tokens(value: number | null | undefined): string {
    if (value == null || !isFinite(value)) return '—';
    return Math.round(value).toLocaleString('en-US');
  },

  /**
   * Token counts with monthly suffix for usage displays
   */
  tokensPerMonth(value: number | null | undefined): string {
    if (value == null || !isFinite(value)) return '—';
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M / mo`;
    } else if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K / mo`;
    }
    return `${Math.round(value)} / mo`;
  },

  /**
   * ROI multiplier display (e.g., "3.2x")
   */
  multiplier(value: number | null | undefined): string {
    if (value == null || !isFinite(value)) return '—';
    return `${value.toFixed(1)}x`;
  },

  /**
   * Time duration (months, years)
   */
  duration(months: number | null | undefined): string {
    if (months == null || !isFinite(months)) return '—';
    if (months < 1) return '< 1 month';
    if (months === 1) return '1 month';
    if (months < 12) return `${Math.round(months)} months`;
    if (months === 12) return '1 year';
    const years = months / 12;
    return years === Math.floor(years) 
      ? `${years} years` 
      : `${years.toFixed(1)} years`;
  },

  /**
   * Range formatting for estimates
   */
  range(min: number, max: number, formatter?: (n: number) => string): string {
    const formatFn = formatter || ((n: number) => format.currency(n));
    if (min === max) return formatFn(min);
    return `${formatFn(min)} – ${formatFn(max)}`;
  },
};

/**
 * Parse a formatted currency/number string back to a number
 * Handles $1.5M, $500K, $1,234, etc.
 */
export function parseFormattedValue(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  const match = String(value).match(/^[\$]?([\d.]+)\s*([KkMmBb])?/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = match[2]?.toUpperCase();
  if (suffix === 'K') return num * 1000;
  if (suffix === 'M') return num * 1000000;
  if (suffix === 'B') return num * 1000000000;
  return num;
}

// Null-safe accessors for nested data
export function safeGet<T>(obj: any, path: string, defaultValue: T): T {
  return path.split('.').reduce((acc, part) => acc?.[part], obj) ?? defaultValue;
}

// Re-export format as default for convenient importing
export default format;
