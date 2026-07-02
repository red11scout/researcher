import { cn } from '@/lib/utils';
import { LucideIcon, FileQuestion, Inbox, Search, Database } from 'lucide-react';
import { Button } from './button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'default' | 'compact' | 'card';
  className?: string;
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  variant = 'default',
  className,
}: EmptyStateProps) {
  const variants = {
    default: 'py-16',
    compact: 'py-8',
    card: 'py-12 px-6 bg-slate-50 rounded-xl border border-dashed border-slate-200',
  };

  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      variants[variant],
      className
    )}>
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
      
      <h3 className="text-heading-sm text-slate-700 mb-1">{title}</h3>
      
      {description && (
        <p className="text-body-sm text-slate-500 max-w-sm mb-4">{description}</p>
      )}
      
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
