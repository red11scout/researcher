export const chartColors = {
  primary: [
    '#003366',
    '#0066CC',
    '#00A3E0',
    '#4BA3C7',
    '#7CBBD4',
  ],
  
  categorical: [
    '#003366',
    '#059669',
    '#D97706',
    '#DC2626',
    '#7C3AED',
  ],
  
  priority: {
    critical: '#DC2626',
    high: '#D97706',
    medium: '#0066CC',
    low: '#64748B',
  },
  
  benefits: {
    revenue: '#003366',
    cost: '#059669',
    cash: '#0066CC',
    risk: '#7C3AED',
  },
  
  sequential: [
    '#E0F2FE',
    '#7DD3FC',
    '#38BDF8',
    '#0284C7',
    '#0369A1',
  ],

  // Tier colors for consulting-grade bubble chart (colorblind-safe navy/blue/slate)
  tier: {
    critical: '#0F172A',
    high: '#0339AF',
    medium: '#4C73E9',
    low: '#94A3B8',
  },

  // Quadrant background fills (pastel, applied directly without opacity)
  quadrant: {
    champion: '#DCFCE7',
    strategicBet: '#DBEAFE',
    quickWin: '#CCFBF1',
    foundation: '#F1F5F9',
  },

  // Quadrant label colors (darker for text contrast)
  quadrantLabel: {
    champion: '#166534',
    strategicBet: '#1E40AF',
    quickWin: '#115E59',
    foundation: '#475569',
  },
};

export const chartConfig = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: {
    title: 14,
    label: 12,
    tick: 11,
    legend: 12,
  },
  
  axis: {
    stroke: '#E2E8F0',
    tickStroke: '#94A3B8',
    labelFill: '#64748B',
  },
  
  grid: {
    stroke: '#F1F5F9',
    strokeDasharray: '4 4',
  },
  
  tooltip: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    textColor: '#FFFFFF',
  },
  
  animation: {
    duration: 500,
    easing: 'ease-out',
  },
};
