/**
 * BlueAlly Brand System
 * Comprehensive design tokens and brand assets
 */

export const brand = {
  name: 'BlueAlly',
  fullName: 'BlueAlly AI Consulting',
  tagline: 'Enterprise AI Transformation',
  description: 'Strategic AI consulting for Fortune 500 enterprises',
  
  logos: {
    dark: '/assets/logos/blueally-logo-dark.png',
    white: '/assets/logos/blueally-logo-white.svg',
    blue: '/assets/logos/blueally-logo-blue.svg',
    iconDark: '/assets/logos/blueally-icon-dark.svg',
    iconWhite: '/assets/logos/blueally-icon-white.svg',
    iconBlue: '/assets/logos/blueally-icon-blue.svg',
  },

  colors: {
    primary: {
      navy: '#003366',
      blue: '#0066CC',
      sky: '#00A3E0',
    },
    
    palette: {
      navy: {
        50: '#E6EDF5',
        100: '#CCDAEA',
        200: '#99B5D5',
        300: '#6690C0',
        400: '#336BAB',
        500: '#003366',
        600: '#002952',
        700: '#001F3D',
        800: '#001429',
        900: '#000A14',
      },
      blue: {
        50: '#E6F2FF',
        100: '#CCE5FF',
        200: '#99CCFF',
        300: '#66B2FF',
        400: '#3399FF',
        500: '#0066CC',
        600: '#0052A3',
        700: '#003D7A',
        800: '#002952',
        900: '#001429',
      },
      sky: {
        50: '#E6F7FC',
        100: '#CCEFF9',
        200: '#99DFF3',
        300: '#66CFED',
        400: '#33BFE7',
        500: '#00A3E0',
        600: '#0082B3',
        700: '#006286',
        800: '#00415A',
        900: '#00212D',
      },
    },
    
    semantic: {
      success: '#059669',
      warning: '#D97706',
      error: '#DC2626',
      info: '#0284C7',
    },
    
    neutral: {
      white: '#FFFFFF',
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5E1',
      400: '#94A3B8',
      500: '#64748B',
      600: '#475569',
      700: '#334155',
      800: '#1E293B',
      900: '#0F172A',
      black: '#020617',
    },
    
    background: {
      primary: '#FFFFFF',
      secondary: '#F8FAFC',
      tertiary: '#F1F5F9',
      inverse: '#0F172A',
    },
    
    text: {
      primary: '#0F172A',
      secondary: '#334155',
      tertiary: '#64748B',
      muted: '#94A3B8',
      inverse: '#FFFFFF',
      link: '#0066CC',
      linkHover: '#003366',
    },
    
    border: {
      light: '#E2E8F0',
      default: '#CBD5E1',
      strong: '#94A3B8',
    },
  },

  gradients: {
    primary: 'linear-gradient(135deg, #003366 0%, #0066CC 100%)',
    subtle: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
    card: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
    hero: 'linear-gradient(135deg, #003366 0%, #0066CC 50%, #00A3E0 100%)',
    dark: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
  },

  shadows: {
    xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    brand: '0 4px 14px 0 rgb(0 51 102 / 0.15)',
    brandLg: '0 10px 30px 0 rgb(0 51 102 / 0.2)',
  },

  radius: {
    none: '0',
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    '3xl': '1.5rem',
    full: '9999px',
  },

  animation: {
    duration: {
      fast: '150ms',
      normal: '200ms',
      slow: '300ms',
      slower: '500ms',
    },
    easing: {
      default: 'cubic-bezier(0.4, 0, 0.2, 1)',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      out: 'cubic-bezier(0, 0, 0.2, 1)',
      inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    },
  },
};

export type BrandColors = typeof brand.colors;
export type BrandLogos = typeof brand.logos;
