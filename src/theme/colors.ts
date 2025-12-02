export const colors = {
  red: '#EC3750',
  orange: '#FF8C37',
  yellow: '#F1C40F',
  green: '#33D6A6',
  blue: '#338EDA',
  purple: '#A633D6',

  white: '#FFFFFF',
  black: '#1F2D3D',
  
  gray: {
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
  },

  background: '#F8FAFC',
  backgroundDark: '#1E293B',
  surface: '#FFFFFF',
  surfaceDark: '#334155',
  
  // Glass effect colors
  glass: {
    light: 'rgba(255, 255, 255, 0.72)',
    medium: 'rgba(255, 255, 255, 0.85)',
    dark: 'rgba(255, 255, 255, 0.95)',
    border: 'rgba(255, 255, 255, 0.18)',
    shadow: 'rgba(0, 0, 0, 0.08)',
  },
  
  text: {
    primary: '#0F172A',
    secondary: '#475569',
    muted: '#94A3B8',
    inverse: '#FFFFFF',
  },

  status: {
    success: '#33D6A6',
    warning: '#FF8C37',
    error: '#EC3750',
    info: '#338EDA',
  },

  alert: {
    anaphylaxis: '#EC3750',
    highSupport: '#FF8C37',
    medical: '#F1C40F',
  },
} as const;

export type ColorName = keyof typeof colors;
