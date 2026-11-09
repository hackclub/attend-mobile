// Colour helpers for translucent overlays (ripples, state layers).

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Returns `color` with its opacity multiplied by `alpha`, as rgba(). Accepts
 * #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(). Anything else (named
 * colours, 'transparent') is returned unchanged.
 */
export function withAlpha(color: string, alpha: number): string {
  const a = clamp01(alpha);
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = digits.split('').map(d => d + d).join('');
    const r = parseInt(digits.slice(0, 2), 16);
    const g = parseInt(digits.slice(2, 4), 16);
    const b = parseInt(digits.slice(4, 6), 16);
    const base = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return `rgba(${r},${g},${b},${round(base * a)})`;
  }
  const fn = /^rgba?\(([^)]*)\)$/i.exec(color.trim());
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const [r, g, b] = parts.map(Number);
      let base = 1;
      if (parts[3] != null) {
        base = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : Number(parts[3]);
      }
      if ([r, g, b, base].every(Number.isFinite)) {
        return `rgba(${r},${g},${b},${round(clamp01(base) * a)})`;
      }
    }
  }
  return color;
}
