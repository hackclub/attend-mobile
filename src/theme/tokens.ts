// Design tokens for the redesign. Light values are the Attend web admin's
// console design system (console.css `--cs-*` variables); dark values are
// Attend's own dark theme (themes.css), so the app and the admin read as one
// product. Both sets have an identical shape; a component
// picks a token by role (`textH`, `div2`, `tint.amber.bg`) and gets the right
// value for the active scheme.

export interface Tint {
  bg: string;
  fg: string;
}

export type TintName = 'red' | 'indigo' | 'sky' | 'teal' | 'amber' | 'purple' | 'green' | 'grey';

export interface ThemeTokens {
  /** Page and container background. */
  bg: string;
  /** Recessed surface: grouped page background, hover, quiet fills. */
  shaded: string;
  /** Headings and the most prominent text. */
  textH: string;
  /** Body text. */
  text: string;
  /** Secondary text: descriptions, sub-labels. */
  text2: string;
  /** Muted text: placeholders, meta, trailing values. */
  muted: string;
  /** Text and icons on a disabled control. */
  disabled: string;
  /** Strong divider. */
  div: string;
  /** Hairline divider between rows; progress track. */
  div2: string;
  /** Container border. */
  box: string;
  /** Input and segmented-control border. */
  input: string;
  /** Disabled input / primary button fill. */
  inputDisabled: string;
  /** Interactive colour: links, buttons, selection. */
  accent: string;
  /** Text and icons on an accent fill. */
  accentOn: string;
  /** Accent while pressed. */
  accentActive: string;
  /** Hack Club red. The same in both schemes; for brand fills only. */
  brand: string;
  /** Selected row or segment background. */
  selected: string;
  /** Pressed background for outline buttons and rows. */
  pressed: string;
  /** Inactive status (pending, stopped). */
  inactive: string;

  success: string;
  successBg: string;
  error: string;
  errorBg: string;
  warning: string;
  warningBg: string;
  /** Yellow fill for warning badges and banners; pair with `onWarningFill`. */
  warningFill: string;
  onWarningFill: string;
  info: string;
  infoBg: string;
  /** Text and icons on a solid success, error or info fill (flashbars). */
  onStatusFill: string;

  badgeGrey: string;
  badgeGreen: string;
  badgeBlue: string;
  badgeRed: string;
  /** Text on the grey, green, blue and red badge fills. */
  badgeOn: string;

  /** Soft tint pairs for icon chips and avatars. */
  tint: Record<TintName, Tint>;

  /** Scrim behind sheets and dialogs. */
  overlay: string;
}

export const lightTokens: ThemeTokens = {
  bg: '#ffffff',
  shaded: '#f6f6f9',
  textH: '#0f141a',
  text: '#0f141a',
  text2: '#424650',
  muted: '#656871',
  disabled: '#8c8c94',
  div: '#c6c6cd',
  div2: '#ebebf0',
  box: '#c6c6cd',
  input: '#8c8c94',
  inputDisabled: '#ebebf0',
  accent: '#c8283f',
  accentOn: '#ffffff',
  accentActive: '#7a0f20',
  brand: '#ec3750',
  selected: '#fff5f6',
  pressed: '#ffe5e9',
  inactive: '#656871',

  success: '#00802f',
  successBg: '#effff1',
  error: '#db0000',
  errorBg: '#fff5f5',
  warning: '#855900',
  warningBg: '#fffef0',
  warningFill: '#ffe347',
  onWarningFill: '#0f141a',
  info: '#006ce0',
  infoBg: '#f0fbff',
  onStatusFill: '#ffffff',

  badgeGrey: '#424650',
  badgeGreen: '#00802f',
  badgeBlue: '#006ce0',
  badgeRed: '#db0000',
  badgeOn: '#f9f9fa',

  tint: {
    red: { bg: '#ffe5e9', fg: '#c8283f' },
    indigo: { bg: '#e0e7ff', fg: '#4338ca' },
    sky: { bg: '#e0f2fe', fg: '#0369a1' },
    teal: { bg: '#ccfbf1', fg: '#0f766e' },
    amber: { bg: '#fef3c7', fg: '#b45309' },
    purple: { bg: '#f3e8ff', fg: '#7e22ce' },
    green: { bg: '#d1fae5', fg: '#047857' },
    grey: { bg: '#ebebf0', fg: '#424650' },
  },

  overlay: 'rgba(15, 20, 26, 0.4)',
};

export const darkTokens: ThemeTokens = {
  // Attend's own dark theme (themes.css `[data-theme="dark"]`): neutral
  // greys and the brand red, not the console beta's pink accent.
  bg: '#0f1115',
  shaded: '#161922',
  textH: '#f3f4f8',
  text: '#d6dae5',
  text2: '#aab1c1',
  muted: '#8089a0',
  disabled: '#5b6377',
  div: '#3a4159',
  div2: '#2a3043',
  box: '#2a3043',
  input: '#5b6377',
  inputDisabled: '#242938',
  accent: '#ec3750',
  accentOn: '#ffffff',
  accentActive: '#d42f46',
  brand: '#ec3750',
  // --accent-soft (16% and 26% brand red) flattened onto the page.
  selected: '#32171e',
  pressed: '#481b24',
  inactive: '#8089a0',

  success: '#4ee2b4',
  successBg: '#142d29',
  error: '#ff5670',
  errorBg: '#311b22',
  warning: '#ffa55c',
  warningBg: '#31221a',
  warningFill: '#ff8c37',
  onWarningFill: '#0f1115',
  info: '#5aa4e6',
  infoBg: '#142231',
  onStatusFill: '#ffffff',

  badgeGrey: '#3a4159',
  badgeGreen: '#00802f',
  badgeBlue: '#006ce0',
  badgeRed: '#d42f46',
  badgeOn: '#f3f4f8',

  tint: {
    red: { bg: '#32171e', fg: '#ff5670' },
    indigo: { bg: '#1e1b4b', fg: '#a5b4fc' },
    sky: { bg: '#0c2a45', fg: '#7dd3fc' },
    teal: { bg: '#042f2e', fg: '#5eead4' },
    amber: { bg: '#3b2305', fg: '#fcd34d' },
    purple: { bg: '#2e1065', fg: '#d8b4fe' },
    green: { bg: '#052e16', fg: '#6ee7b7' },
    grey: { bg: '#242938', fg: '#aab1c1' },
  },

  overlay: 'rgba(0, 0, 0, 0.6)',
};

/**
 * Fixed colours for controls over a photo, a brand banner or the live camera.
 * Those surfaces are dark whatever the appearance, so these don't change
 * with the scheme.
 */
export const overlayTokens = {
  /** Text and icons over imagery. */
  on: '#ffffff',
  onMuted: '#c6c6cd',
  /** Round control over a photo or a brand banner. */
  imageControl: 'rgba(15, 20, 26, 0.35)',
  /** Control over the live camera: denser, so it reads on any scene. */
  cameraControl: 'rgba(15, 20, 26, 0.82)',
  /** A control that is on, like the torch, and its icon. */
  active: '#fbd332',
  onActive: '#0f141a',
  /** Scan frame corners. */
  scanFrame: '#2bb534',
  /** The kiosk's larger, softer frame inside its camera tile. */
  kioskFrame: '#5be0b5',
  /** Behind the camera preview before it starts. */
  cameraStage: '#0b0b0f',
  /** Dark base for scrims and shadows over imagery; use with withAlpha(). */
  ink: '#0f141a',
} as const;

/**
 * Hack Club brand hues, the same in both schemes. Data colours (incident
 * levels, the Android notification light), not UI chrome.
 */
export const hackClubColors = {
  red: '#ec3750',
  orange: '#ff8c37',
  green: '#33d6a6',
  blue: '#338eda',
} as const;

/**
 * The message previews imitate Slack and an SMS bubble, so they use those
 * apps' colours rather than ours.
 */
export const previewTokens = {
  slackBg: '#1a1d21',
  slackAvatar: '#d42f46',
  slackText: '#f3f4f6',
  slackMuted: '#9ca3af',
  smsBubble: '#22c55e',
  on: '#ffffff',
} as const;

/** 4pt spacing scale. Containers pad 20 horizontally, pages 16. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  container: 16,
  item: 8,
  badge: 4,
  input: 8,
  /** Flashbars and banners. */
  flash: 12,
  pill: 999,
} as const;

/** Minimum touch target, per both platform guidelines. */
export const hitTarget = 44;

// System font throughout; only size, line height and weight vary.
export const typography = {
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  h2: { fontSize: 18, lineHeight: 22, fontWeight: '700' },
  h3: { fontSize: 16, lineHeight: 20, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  stat: { fontSize: 32, lineHeight: 40, fontWeight: '300', letterSpacing: -0.3 },
  small: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;

export type TypographyVariant = keyof typeof typography;
export type Spacing = typeof spacing;
export type Radii = typeof radii;
export type Typography = typeof typography;
