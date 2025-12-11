import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, AlertCircle, Info, XCircle } from 'lucide-react';

export type AlertSeverity = 'critical' | 'warning' | 'info' | 'error';

export interface CriticalAlertProps {
  children: React.ReactNode;
  title?: string;
  severity?: AlertSeverity;
  dismissible?: boolean;
  onDismiss?: () => void;
}

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    container: 'bg-red-50 border border-red-200',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    titleColor: 'text-red-800',
    textColor: 'text-red-700',
    borderAccent: 'border-l-4 border-l-red-500',
  },
  warning: {
    icon: AlertTriangle,
    container: 'bg-amber-50 border border-amber-200',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-800',
    textColor: 'text-amber-700',
    borderAccent: 'border-l-4 border-l-amber-500',
  },
  info: {
    icon: Info,
    container: 'bg-blue-50 border border-blue-200',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-800',
    textColor: 'text-blue-700',
    borderAccent: 'border-l-4 border-l-blue-500',
  },
  error: {
    icon: XCircle,
    container: 'bg-rose-50 border border-rose-200',
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
    titleColor: 'text-rose-800',
    textColor: 'text-rose-700',
    borderAccent: 'border-l-4 border-l-rose-500',
  },
};

export function CriticalAlert({
  children,
  title,
  severity = 'warning',
  dismissible = false,
  onDismiss,
}: CriticalAlertProps) {
  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3 }}
      className={`rounded-lg p-4 ${config.container} ${config.borderAccent}`}
      role="alert"
      data-testid={`critical-alert-${severity}`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded-full ${config.iconBg}`}>
          <Icon className={`w-5 h-5 ${config.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={`font-semibold text-sm mb-1 ${config.titleColor}`}>
              {title}
            </h4>
          )}
          <div className={`text-sm leading-relaxed ${config.textColor}`}>
            {children}
          </div>
        </div>
        {dismissible && onDismiss && (
          <button
            onClick={onDismiss}
            className={`p-1 rounded-full hover:bg-black/5 transition-colors ${config.iconColor}`}
            aria-label="Dismiss alert"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default CriticalAlert;
