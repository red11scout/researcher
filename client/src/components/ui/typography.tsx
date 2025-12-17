import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const textVariants = cva('', {
  variants: {
    variant: {
      'display-2xl': 'text-display-2xl text-slate-900',
      'display-xl': 'text-display-xl text-slate-900',
      'display-lg': 'text-display-lg text-slate-900',
      'display': 'text-display text-slate-900',
      'heading-xl': 'text-heading-xl text-slate-800',
      'heading-lg': 'text-heading-lg text-slate-800',
      'heading': 'text-heading text-slate-700',
      'heading-sm': 'text-heading-sm text-slate-700',
      'body-lg': 'text-body-lg text-slate-600',
      'body': 'text-body text-slate-600',
      'body-sm': 'text-body-sm text-slate-500',
      'label': 'text-label text-slate-600',
      'label-sm': 'text-label-sm text-slate-500',
      'caption': 'text-caption text-slate-500 uppercase',
      'overline': 'text-overline text-slate-400 uppercase',
    },
    color: {
      default: '',
      muted: 'text-slate-500',
      accent: 'text-brand-blue',
      success: 'text-emerald-600',
      warning: 'text-amber-600',
      error: 'text-red-600',
      white: 'text-white',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    },
  },
  defaultVariants: {
    variant: 'body',
    color: 'default',
    align: 'left',
  },
});

type TextElement = 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'label';

interface TextProps extends VariantProps<typeof textVariants> {
  as?: TextElement;
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export const Text = forwardRef<HTMLElement, TextProps>(
  ({ as: Component = 'p', variant, color, weight, align, className, children, ...props }, ref) => {
    return (
      <Component
        ref={ref as any}
        className={cn(textVariants({ variant, color, weight, align }), className)}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Text.displayName = 'Text';

export const Display = ({ children, className, ...props }: Omit<TextProps, 'variant' | 'as'>) => (
  <Text as="h1" variant="display" className={cn('text-balance', className)} {...props}>
    {children}
  </Text>
);

export const PageTitle = ({ children, className, ...props }: Omit<TextProps, 'variant' | 'as'>) => (
  <Text as="h1" variant="heading-xl" className={cn('text-balance', className)} {...props}>
    {children}
  </Text>
);

export const SectionTitle = ({ children, className, ...props }: Omit<TextProps, 'variant' | 'as'>) => (
  <Text as="h2" variant="heading-lg" className={className} {...props}>
    {children}
  </Text>
);

export const Subtitle = ({ children, className, ...props }: Omit<TextProps, 'variant' | 'as'>) => (
  <Text as="h3" variant="heading" className={className} {...props}>
    {children}
  </Text>
);

export const Label = ({ children, className, ...props }: Omit<TextProps, 'variant' | 'as'>) => (
  <Text as="label" variant="label" className={className} {...props}>
    {children}
  </Text>
);

export const Caption = ({ children, className, ...props }: Omit<TextProps, 'variant' | 'as'>) => (
  <Text as="span" variant="caption" className={className} {...props}>
    {children}
  </Text>
);

export const Overline = ({ children, className, ...props }: Omit<TextProps, 'variant' | 'as'>) => (
  <Text as="span" variant="overline" className={className} {...props}>
    {children}
  </Text>
);

interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  from?: string;
  to?: string;
}

export const GradientText = ({ 
  children, 
  className,
  from = 'from-brand-navy',
  to = 'to-brand-blue',
}: GradientTextProps) => (
  <span className={cn(
    'bg-gradient-to-r bg-clip-text text-transparent',
    from,
    to,
    className
  )}>
    {children}
  </span>
);
