import { withAlpha } from './alpha';

export interface FadeOptions {
  /** Opacity at `start`. */
  from: number;
  /** Opacity at `end`. */
  to: number;
  /** Where the fade starts, from the top of the box, in `unit`. */
  start: number;
  /** Where it ends, in `unit`. */
  end: number;
  /** React Native's gradients can't mix units in one stop (no calc()). */
  unit?: 'px' | '%';
  /** Stops along the fade; enough that it reads as a curve, not bands. */
  steps?: number;
}

/**
 * Colour stops easing `color` from one opacity to another along a cosine
 * curve, so a fade has no visible edge where it starts or ends. It fades the
 * colour itself to no opacity rather than to `transparent`, which would pass
 * through grey. Join the stops of one or more fades with `linearGradient`.
 */
export function easedFade(
  color: string,
  { from, to, start, end, unit = 'px', steps = 16 }: FadeOptions,
): string[] {
  const stops: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const eased = (1 - Math.cos(Math.PI * t)) / 2;
    const alpha = from + (to - from) * eased;
    stops.push(`${withAlpha(color, alpha)} ${(start + (end - start) * t).toFixed(2)}${unit}`);
  }
  return stops;
}

/** A top-to-bottom CSS gradient for a `backgroundImage` style. */
export function linearGradient(stops: string[]): string {
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}
