import { CHROME_MAX_FONT_SCALE } from './fontScale';

// UISegmentedControl gives every segment the same width and truncates a
// label that doesn't fit, so the font steps down until the longest label
// fits its share. Widths are estimated from the character count: there is no
// text measurement API, and a little slack is cheaper than an ellipsis.
const IOS_FONT_SIZES = [13, 12, 11] as const;
const IOS_CHAR_WIDTH = 0.6; // of the font size, for SF Pro at semibold
const IOS_SEGMENT_PADDING = 20;

/**
 * `fontScale` is the user's text size (PixelRatio.getFontScale()): the native
 * control takes a fixed point size, so Dynamic Type is applied here, capped
 * like other chrome, before stepping down.
 */
export function iosSegmentFontSize(labels: readonly string[], width: number, fontScale = 1): number {
  const scale = Math.min(Math.max(fontScale, 1), CHROME_MAX_FONT_SCALE);
  const sizes = IOS_FONT_SIZES.map((size) => Math.round(size * scale));
  if (width <= 0 || labels.length === 0) return sizes[0];
  const share = width / labels.length;
  const longest = Math.max(...labels.map((label) => label.length));
  return (
    sizes.find((size) => longest * size * IOS_CHAR_WIDTH + IOS_SEGMENT_PADDING <= share)
    ?? sizes[sizes.length - 1]
  );
}

// Material 3 segmented buttons: a 14sp label with 12dp padding either side,
// and an 18dp tick 8dp before the label on the selected one.
const ANDROID_FONT_SIZE = 14;
const ANDROID_CHAR_WIDTH = 0.48; // of the font size, for Roboto Medium
const ANDROID_SEGMENT_PADDING = 24;
const ANDROID_TICK = 26;

/**
 * Whether the longest label needs a second line in its segment (Android),
 * allowing for the selected tick on every segment, so the answer doesn't
 * change with the selection. Material's row lets a segment that wraps grow
 * taller than the others, so when one wraps they all take two lines.
 */
export function androidSegmentWraps(labels: readonly string[], width: number, fontScale = 1): boolean {
  if (width <= 0 || labels.length === 0) return false;
  const share = width / labels.length - ANDROID_SEGMENT_PADDING - ANDROID_TICK;
  const longest = Math.max(...labels.map((label) => label.length));
  return longest * ANDROID_FONT_SIZE * fontScale * ANDROID_CHAR_WIDTH > share;
}
