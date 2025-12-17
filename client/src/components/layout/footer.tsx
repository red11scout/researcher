import { Logo } from '@/components/brand/logo';
import { brand } from '@/lib/brand';
import { cn } from '@/lib/utils';

interface FooterProps {
  variant?: 'light' | 'dark';
  minimal?: boolean;
  className?: string;
}

export function Footer({ variant = 'light', minimal = false, className }: FooterProps) {
  const variants = {
    light: 'bg-slate-50 border-t border-slate-200 text-slate-600',
    dark: 'bg-brand-navy text-white/70',
  };

  const logoVariant = variant === 'dark' ? 'white' : 'dark';
  const currentYear = new Date().getFullYear();
  const legal = `© ${currentYear} BlueAlly AI Consulting. All rights reserved.`;

  if (minimal) {
    return (
      <footer className={cn('py-4', variants[variant], className)} data-testid="footer-minimal">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm">
          <span>{legal}</span>
          <Logo variant={logoVariant} size="xs" showText={false} />
        </div>
      </footer>
    );
  }

  return (
    <footer className={cn('py-12', variants[variant], className)} data-testid="footer">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div>
            <Logo variant={logoVariant} size="md" className="mb-3" />
            <p className="text-sm max-w-xs">
              {brand.description}
            </p>
          </div>
          
          <div className="text-sm">
            <p>{legal}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
