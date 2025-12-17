import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

interface HeaderProps {
  variant?: 'light' | 'dark' | 'transparent';
  sticky?: boolean;
  actions?: React.ReactNode;
  className?: string;
}

export function Header({ 
  variant = 'light', 
  sticky = true,
  actions,
  className,
}: HeaderProps) {
  const variants = {
    light: 'bg-white border-b border-slate-200',
    dark: 'bg-brand-navy border-b border-brand-navy-600',
    transparent: 'bg-transparent',
  };

  const logoVariant = variant === 'dark' ? 'white' : 'dark';

  return (
    <header 
      className={cn(
        'w-full z-50 transition-all duration-200',
        sticky && 'sticky top-0',
        variants[variant],
        className,
      )}
      data-testid="header"
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo variant={logoVariant} size="md" />
        
        {actions && (
          <div className="flex items-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
