import { brand } from '@/lib/brand';
import { cn } from '@/lib/utils';

export type LogoVariant = 'dark' | 'white' | 'blue';
export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  showIcon?: boolean;
  showText?: boolean;
  className?: string;
}

const sizeClasses: Record<LogoSize, { logo: string; icon: string; text: string }> = {
  xs: { logo: 'h-5', icon: 'h-5 w-5', text: 'text-sm' },
  sm: { logo: 'h-6', icon: 'h-6 w-6', text: 'text-base' },
  md: { logo: 'h-8', icon: 'h-8 w-8', text: 'text-lg' },
  lg: { logo: 'h-10', icon: 'h-10 w-10', text: 'text-xl' },
  xl: { logo: 'h-12', icon: 'h-12 w-12', text: 'text-2xl' },
};

export function Logo({
  variant = 'dark',
  size = 'md',
  showIcon = true,
  showText = true,
  className,
}: LogoProps) {
  const logoSrc = brand.logos[variant];
  const iconSrc = brand.logos[`icon${variant.charAt(0).toUpperCase() + variant.slice(1)}` as keyof typeof brand.logos];
  const sizes = sizeClasses[size];
  
  const textColorClass = {
    dark: 'text-brand-navy',
    white: 'text-white',
    blue: 'text-brand-blue',
  }[variant];

  if (showText && showIcon) {
    return (
      <img 
        src={logoSrc} 
        alt={brand.name}
        className={cn(sizes.logo, 'w-auto', className)}
        data-testid="logo-full"
      />
    );
  }

  if (showIcon && !showText) {
    return (
      <img 
        src={iconSrc} 
        alt={brand.name}
        className={cn(sizes.icon, className)}
        data-testid="logo-icon"
      />
    );
  }

  return (
    <span className={cn('font-semibold tracking-tight', sizes.text, textColorClass, className)} data-testid="logo-text">
      {brand.name}
    </span>
  );
}

export function LogoCompact({ variant = 'dark', className }: Pick<LogoProps, 'variant' | 'className'>) {
  return <Logo variant={variant} size="sm" showText={false} className={className} />;
}

export function LogoFull({ variant = 'dark', className }: Pick<LogoProps, 'variant' | 'className'>) {
  const textColorClass = variant === 'white' ? 'text-white/70' : 'text-slate-500';
  
  return (
    <div className={cn('flex flex-col', className)} data-testid="logo-with-tagline">
      <Logo variant={variant} size="lg" />
      <span className={cn('text-xs font-medium tracking-wide mt-1', textColorClass)}>
        {brand.tagline}
      </span>
    </div>
  );
}
