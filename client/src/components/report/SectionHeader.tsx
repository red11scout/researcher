import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  accentColor?: 'navy' | 'royal' | 'green' | 'orange';
  align?: 'left' | 'center';
  size?: 'sm' | 'md' | 'lg';
}

const accentColors = {
  navy: 'bg-blueally-navy',
  royal: 'bg-blueally-royal',
  green: 'bg-blueally-green',
  orange: 'bg-blueally-orange',
};

const sizeStyles = {
  sm: {
    title: 'text-xl',
    subtitle: 'text-sm',
    icon: 'w-5 h-5',
    iconContainer: 'p-2',
    underline: 'h-0.5 w-12',
  },
  md: {
    title: 'text-2xl',
    subtitle: 'text-base',
    icon: 'w-6 h-6',
    iconContainer: 'p-2.5',
    underline: 'h-1 w-16',
  },
  lg: {
    title: 'text-3xl',
    subtitle: 'text-lg',
    icon: 'w-7 h-7',
    iconContainer: 'p-3',
    underline: 'h-1 w-20',
  },
};

export function SectionHeader({
  title,
  subtitle,
  icon: Icon,
  accentColor = 'navy',
  align = 'left',
  size = 'md',
}: SectionHeaderProps) {
  const styles = sizeStyles[size];
  const alignClass = align === 'center' ? 'text-center items-center' : 'text-left items-start';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`flex flex-col ${alignClass} mb-6`}
      data-testid={`section-header-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className={`flex items-center gap-3 ${align === 'center' ? 'justify-center' : ''}`}>
        {Icon && (
          <div className={`${styles.iconContainer} rounded-lg bg-blueally-softblue`}>
            <Icon className={`${styles.icon} text-blueally-navy`} />
          </div>
        )}
        <h2 className={`${styles.title} font-heading font-bold text-blueally-slate tracking-tight`}>
          {title}
        </h2>
      </div>

      <div className={`${styles.underline} ${accentColors[accentColor]} rounded-full mt-3 ${align === 'center' ? 'mx-auto' : ''}`} />

      {subtitle && (
        <p className={`${styles.subtitle} text-gray-600 mt-3 max-w-2xl ${align === 'center' ? 'mx-auto' : ''}`}>
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}

export default SectionHeader;
