import { useEffect, useState } from 'react';
import { switcherOverlay } from '../navigation/switcherOverlay';

/**
 * How many of a screen's `total` sections to render: all of them normally,
 * but one more per frame when the screen mounts under the event switcher (a
 * switch landing on it). Mounting a whole page at once takes the UI thread
 * for long enough to stall the switcher's animation; a section a frame keeps
 * each mount small, so the page fills in under the landing card instead of
 * after it.
 */
export function useStagedReveal(total: number): number {
  const [shown, setShown] = useState(() => (switcherOverlay.get().open ? 0 : Number.POSITIVE_INFINITY));
  useEffect(() => {
    if (shown >= total) return;
    const frame = requestAnimationFrame(() => setShown((n) => n + 1));
    return () => cancelAnimationFrame(frame);
  }, [shown, total]);
  return shown;
}
