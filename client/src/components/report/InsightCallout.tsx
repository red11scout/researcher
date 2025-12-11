import React from 'react';
import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';

export interface InsightCalloutProps {
  children: React.ReactNode;
  title?: string;
  variant?: 'default' | 'highlight' | 'subtle';
}

export function InsightCallout({ 
  children, 
  title = 'Insight',
  variant = 'default' 
}: InsightCalloutProps) {
  const variantStyles = {
    default: {
      container: 'bg-[#f0f7ff] border-l-4 border-l-[#4C73E9]',
      title: 'text-[#4C73E9]',
      icon: 'text-[#4C73E9]',
    },
    highlight: {
      container: 'bg-gradient-to-r from-[#f0f7ff] to-white border-l-4 border-l-[#0339AF] shadow-sm',
      title: 'text-[#0339AF]',
      icon: 'text-[#0339AF]',
    },
    subtle: {
      container: 'bg-slate-50 border-l-4 border-l-slate-300',
      title: 'text-slate-600',
      icon: 'text-slate-500',
    },
  };

  const styles = variantStyles[variant];

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={`rounded-r-lg p-4 ${styles.container}`}
      data-testid="insight-callout"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${styles.icon}`}>
          <Lightbulb className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className={`font-semibold text-sm mb-1 ${styles.title}`}>
            {title}:
          </p>
          <div className="text-gray-700 text-sm italic leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default InsightCallout;
