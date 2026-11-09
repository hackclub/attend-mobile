// Legacy colour API, kept so screens that predate the redesign still compile
// and run. Every role here is now aliased onto the console tokens in
// ./tokens.ts, so old screens pick up the new palette; new code should read
// `theme.tokens` (see ThemeProvider) instead of these names.
//
// Two token sets with an identical shape: a themed style block reads the same
// in both schemes — `colors.gray[200]` is "hairline border" either way.
//
// The gray ramp is role-ordered, not lightness-ordered: 50 is the quietest
// fill against the page, 900 is primary text. Dark mode runs that ramp the
// other way round so existing call sites keep their meaning.

import { darkTokens as dk, lightTokens as lt } from './tokens';

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
    50: lt.shaded,
    100: lt.shaded,
    200: lt.div2,
    300: lt.div,
    400: lt.disabled,
    500: lt.muted,
    600: lt.text2,
    700: lt.text2,
    800: lt.text,
    900: lt.textH,
  },

  // The page itself, and the card material that sits on it.
  background: lt.shaded,
  surface: lt.bg,
  // One step above `surface`, for a card nested inside another card.
  surfaceRaised: lt.bg,

  glass: {
    light: 'rgba(255, 255, 255, 0.72)',
    medium: 'rgba(255, 255, 255, 0.85)',
    dark: 'rgba(255, 255, 255, 0.95)',
    border: 'rgba(255, 255, 255, 0.18)',
    shadow: 'rgba(0, 0, 0, 0.08)',
  },

  text: {
    primary: lt.textH,
    secondary: lt.text2,
    muted: lt.muted,
    inverse: '#FFFFFF',
    // Red used as type or an icon rather than as a fill.
    accent: lt.accent,
  },

  // Signal colors as foreground, legible against the page.
  status: {
    success: lt.success,
    warning: lt.warning,
    error: lt.error,
    info: lt.info,
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
  // primary text at the top.
  gray: {
    50: dk.shaded,
    100: dk.shaded,
    200: dk.div2,
    300: dk.div,
    400: dk.disabled,
    500: dk.muted,
    600: dk.text2,
    700: dk.text2,
    800: dk.text,
    900: dk.textH,
  },

  background: dk.bg,
  surface: dk.shaded,
  surfaceRaised: dk.div2,

  glass: {
    light: 'rgba(27, 35, 45, 0.72)',
    medium: 'rgba(27, 35, 45, 0.85)',
    dark: 'rgba(27, 35, 45, 0.95)',
    // A faint light ring, which is what gives a dark card its edge once the
    // shadow is gone.
    border: 'rgba(255, 255, 255, 0.10)',
    shadow: 'rgba(0, 0, 0, 0.50)',
  },

  text: {
    primary: dk.textH,
    secondary: dk.text2,
    muted: dk.muted,
    // On dark, an "inverse" surface is a light one, so its text goes dark.
    inverse: dk.bg,
    accent: dk.accent,
  },

  status: {
    success: dk.success,
    warning: dk.warning,
    error: dk.error,
    info: dk.info,
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
