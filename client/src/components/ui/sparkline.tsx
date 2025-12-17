import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  color?: string;
  fillOpacity?: number;
  className?: string;
  showDots?: boolean;
}

export function Sparkline({
  data,
  width = 100,
  height = 24,
  strokeWidth = 2,
  color = '#0066CC',
  fillOpacity = 0.1,
  className,
  showDots = false,
}: SparklineProps) {
  const pathD = useMemo(() => {
    if (data.length < 2) return '';
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    const points = data.map((value, i) => ({
      x: (i / (data.length - 1)) * width,
      y: height - ((value - min) / range) * height,
    }));
    
    // Create smooth curve using bezier
    const line = points.map((point, i) => {
      if (i === 0) return `M ${point.x},${point.y}`;
      
      const prev = points[i - 1];
      const cpX = (prev.x + point.x) / 2;
      return `C ${cpX},${prev.y} ${cpX},${point.y} ${point.x},${point.y}`;
    }).join(' ');
    
    return line;
  }, [data, width, height]);

  const fillPath = useMemo(() => {
    if (!pathD) return '';
    return `${pathD} L ${width},${height} L 0,${height} Z`;
  }, [pathD, width, height]);

  const lastPoint = useMemo(() => {
    if (data.length < 1) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    return {
      x: width,
      y: height - ((data[data.length - 1] - min) / range) * height,
    };
  }, [data, width, height]);

  if (data.length < 2) {
    return null;
  }

  return (
    <svg 
      width={width} 
      height={height} 
      className={cn('overflow-visible', className)}
      viewBox={`0 0 ${width} ${height}`}
    >
      {/* Fill area */}
      <path
        d={fillPath}
        fill={color}
        fillOpacity={fillOpacity}
      />
      
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* End dot */}
      {showDots && lastPoint && (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={strokeWidth * 1.5}
          fill={color}
        />
      )}
    </svg>
  );
}
