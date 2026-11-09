// UISegmentedControl gives every segment the same width and truncates a
// label that doesn't fit, so the font steps down until the longest label
// fits its share. Widths are estimated from the character count: there is no
// text measurement API, and a little slack is cheaper than an ellipsis.
const IOS_FONT_SIZES = [13, 12, 11] as const;
const IOS_CHAR_WIDTH = 0.6; // of the font size, for SF Pro at semibold
const IOS_SEGMENT_PADDING = 20;

export function iosSegmentFontSize(labels: readonly string[], width: number): number {
  if (width <= 0 || labels.length === 0) return IOS_FONT_SIZES[0];
  const share = width / labels.length;
  const longest = Math.max(...labels.map((label) => label.length));
  return (
    IOS_FONT_SIZES.find((size) => longest * size * IOS_CHAR_WIDTH + IOS_SEGMENT_PADDING <= share)
    ?? IOS_FONT_SIZES[IOS_FONT_SIZES.length - 1]
  );
}
