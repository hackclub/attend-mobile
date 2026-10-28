import type { ImageColorsResult } from 'react-native-image-colors';

// The colour Attend's Apple Wallet pass is printed in (Passkit::EventTicket's
// background_color), so a pass without a banner or a usable logo colour still
// looks like the one in the attendee's Wallet.
export const WALLET_PASS_RED = '#B23444';

export interface PassColors {
  background: string;
  // Type and icons on the pass: white on a dark fill, near-black on a light one.
  foreground: string;
  // Field labels, a step quieter than the values beneath them.
  label: string;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHsl([r, g, b]: [number, number, number]): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

// WCAG relative luminance.
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// Candidates in order of how much they stand for the logo as a whole. On iOS
// `background` is the most common colour; Android's `dominant` is the same idea.
function candidatesFrom(result: ImageColorsResult): string[] {
  switch (result.platform) {
    case 'ios':
      return [result.background, result.primary, result.secondary, result.detail];
    case 'android':
      return [result.dominant, result.vibrant, result.darkVibrant, result.muted, result.average];
    default:
      return [result.dominant, result.vibrant, result.darkVibrant, result.muted];
  }
}

/**
 * The logo's main colour, fit to fill a pass. Logos usually sit on white or
 * transparent, so the most common colour is often the paper behind the mark:
 * prefer the first candidate with some colour in it, then any that isn't
 * near-white, and fall back to the Wallet pass red.
 */
export function pickLogoColor(result: ImageColorsResult | null | undefined): string {
  if (!result) return WALLET_PASS_RED;
  const parsed = candidatesFrom(result)
    .map((hex) => ({ hex, rgb: parseHex(hex ?? '') }))
    .filter((c): c is { hex: string; rgb: [number, number, number] } => c.rgb !== null)
    .map((c) => ({ ...c, hsl: toHsl(c.rgb) }));

  const colourful = parsed.find((c) => c.hsl.s >= 0.25 && c.hsl.l >= 0.12 && c.hsl.l <= 0.85);
  if (colourful) return colourful.hex.toUpperCase();
  const notPaper = parsed.find((c) => c.hsl.l < 0.85);
  if (notPaper) return notPaper.hex.toUpperCase();
  return WALLET_PASS_RED;
}

export function passColorsFor(background: string): PassColors {
  const rgb = parseHex(background);
  // Above this the fill is light enough that white type stops reading.
  const isLight = rgb ? luminance(rgb) > 0.45 : false;
  return isLight
    ? { background, foreground: '#0F172A', label: 'rgba(15, 23, 42, 0.62)' }
    : { background, foreground: '#FFFFFF', label: 'rgba(255, 255, 255, 0.72)' };
}
