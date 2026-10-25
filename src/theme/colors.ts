// Two token sets with an identical shape: `light` reproduces the original
// palette exactly, `dark` re-points every token at the same *role* on a dark
// page. Because the shapes match, a themed style block reads the same in both
// schemes — `colors.gray[200]` is "hairline border" either way.
//
// The gray ramp is role-ordered, not lightness-ordered: 50 is the quietest
// fill against the page, 900 is primary text. Dark mode runs that ramp the
// other way round so existing call sites keep their meaning.

// Brand hues. These are the same in both schemes: they are used as fills with
// white text on top, and a Hack Club red that shifted with the system theme
// would stop being Hack Club red. Foreground uses of a brand hue go through
// `text.accent` / `status.*`, which do adapt.
const brand = {
  red: '#EC3750',
  redOnDark: '#FF667D',
  orange: '#FF8C37',
  yellow: '#F1C40F',
  green: '#33D6A6',
  blue: '#338EDA',
  purple: '#A633D6',
  teal: '#14B8A6',

  white: '#FFFFFF',
  black: '#1F2D3D',
} as const;

export const lightColors = {
  ...brand,

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

  // The page itself, and the card material that sits on it.
  background: '#F8FAFC',
  surface: '#FFFFFF',
  // One step above `surface`, for a card nested inside another card.
  surfaceRaised: '#FFFFFF',

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
    // Red used as type or an icon rather than as a fill.
    accent: '#EC3750',
  },

  // Signal colors as foreground. Tuned per scheme so they stay legible
  // against the page; the matching fills come from the brand hues above.
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

export type ThemeColors = {
  -readonly [K in keyof typeof lightColors]: typeof lightColors[K] extends object
    ? { -readonly [P in keyof typeof lightColors[K]]: string }
    : string;
};

export const darkColors: ThemeColors = {
  ...brand,

  // The light ramp read backwards by role: quiet fills at the bottom,
  // primary text at the top. Values are hand-picked rather than mirrored so
  // each step keeps roughly the contrast its light counterpart had.
  gray: {
    50: '#131C2A',
    100: '#1A2435',
    200: '#27344A',
    300: '#374763',
    400: '#8A9AB3',
    500: '#9FAFC6',
    600: '#B4C1D4',
    700: '#CBD5E3',
    800: '#E2E8F1',
    900: '#F2F6FB',
  },

  background: '#0B1220',
  surface: '#151E2E',
  surfaceRaised: '#1C2739',

  glass: {
    light: 'rgba(21, 30, 46, 0.72)',
    medium: 'rgba(21, 30, 46, 0.85)',
    dark: 'rgba(21, 30, 46, 0.95)',
    // A faint light ring, which is what gives a dark card its edge once the
    // shadow is gone.
    border: 'rgba(255, 255, 255, 0.10)',
    shadow: 'rgba(0, 0, 0, 0.50)',
  },

  text: {
    primary: '#F2F6FB',
    secondary: '#B4C1D4',
    muted: '#8A9AB3',
    // On dark, an "inverse" surface is a light one, so its text goes dark.
    inverse: '#0B1220',
    accent: '#FF667D',
  },

  status: {
    success: '#45E0B4',
    warning: '#FFA259',
    error: '#FF667D',
    info: '#5BA8F5',
  },

  alert: {
    anaphylaxis: '#EC3750',
    highSupport: '#FF8C37',
    medical: '#F1C40F',
  },
};

// The scanner and kiosk are a camera-overlay world that stays dark whatever
// the system is set to (DESIGN.md), so they keep importing this fixed set.
export const colors = lightColors;

export type ColorName = keyof typeof lightColors;
