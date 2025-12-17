/**
 * PDF Configuration - Enterprise Report Styling
 */

export const pdfConfig = {
  page: {
    size: 'A4' as const,
    orientation: 'portrait' as const,
    margins: {
      top: 72,
      bottom: 72,
      left: 54,
      right: 54,
    },
  },

  fonts: {
    family: 'Helvetica',
    sizes: {
      displayXl: 36,
      display: 28,
      h1: 22,
      h2: 18,
      h3: 14,
      h4: 12,
      body: 11,
      bodySm: 10,
      caption: 9,
      tiny: 8,
    },
    weights: {
      normal: 'normal' as const,
      medium: 'normal' as const,
      semibold: 'bold' as const,
      bold: 'bold' as const,
    },
    lineHeights: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.7,
    },
  },

  colors: {
    brandNavy: '#003366',
    brandBlue: '#0066CC',
    brandSky: '#00A3E0',
    
    textPrimary: '#0F172A',
    textSecondary: '#334155',
    textTertiary: '#64748B',
    textMuted: '#94A3B8',
    
    white: '#FFFFFF',
    bgLight: '#F8FAFC',
    bgSubtle: '#F1F5F9',
    
    borderLight: '#E2E8F0',
    borderDefault: '#CBD5E1',
    
    success: '#059669',
    warning: '#D97706',
    error: '#DC2626',
    
    tableHeader: '#F1F5F9',
    tableRowAlt: '#FAFAFA',
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    section: 40,
  },
};
