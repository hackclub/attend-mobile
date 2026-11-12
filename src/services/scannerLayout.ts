/**
 * The scanner's frame, a square: about 70% of a phone's width, so a code
 * fills it from a comfortable distance. A tablet (regular width) gets half
 * its shorter side, capped, rather than a frame wider than a hand. Either
 * way it leaves room above and below for the header, result card and dock.
 */
export function scanFrameSize(width: number, height: number, isRegular: boolean): number {
  const size = isRegular
    ? Math.min(Math.min(width, height) * 0.5, 460)
    : Math.min(width * 0.7, height * 0.45);
  return Math.max(0, Math.round(size));
}
