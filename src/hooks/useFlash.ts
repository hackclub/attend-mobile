import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlashbarType } from '../components/ui';
import { haptics } from '../services/haptics';

export interface FlashMessage {
  type: FlashbarType;
  message: string;
}

// Long enough to read (or for a screen reader to announce) without a tap.
const FLASH_MS = 6000;

/**
 * A transient inline Flashbar for the outcome of an action ("Badge written",
 * the server's notice): replaces a success Alert, which blocks the screen and
 * needs a tap to clear. `show` plays the matching haptic unless `silent`.
 * Render `flash` with a Flashbar and pass `dismiss` as its onDismiss.
 */
export function useFlash(durationMs = FLASH_MS) {
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setFlash(null);
  }, []);

  const show = useCallback(
    (type: FlashbarType, message: string, options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        if (type === 'error') haptics.error();
        else if (type === 'warning') haptics.warning();
        else haptics.success();
      }
      if (timer.current) clearTimeout(timer.current);
      setFlash({ type, message });
      timer.current = setTimeout(() => {
        timer.current = null;
        setFlash(null);
      }, durationMs);
    },
    [durationMs]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { flash, show, dismiss };
}
