// Slow motion for recording animations on a slow device (the emulator only
// renders a few frames a second): a build with EXPO_PUBLIC_SLOWMO=4 plays
// these animations 4x slower, and the recording is sped back up. 1 normally.

const parsed = Number(process.env.EXPO_PUBLIC_SLOWMO);
export const SLOWMO = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

/** A duration or delay (ms), stretched by SLOWMO. */
export function slow(ms: number): number {
  'worklet';
  return ms * SLOWMO;
}

/**
 * A spring config, slowed by SLOWMO with the same shape: stiffness scales
 * with 1/k² and damping with 1/k.
 */
export function slowSpring<T extends { stiffness?: number; damping?: number }>(config: T): T {
  'worklet';
  if (SLOWMO === 1) return config;
  return {
    ...config,
    ...(config.stiffness !== undefined ? { stiffness: config.stiffness / (SLOWMO * SLOWMO) } : {}),
    ...(config.damping !== undefined ? { damping: config.damping / SLOWMO } : {}),
  };
}
