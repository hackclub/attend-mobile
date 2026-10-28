import { useEffect, useState } from 'react';
import ImageColors from 'react-native-image-colors';
import { asyncStorage } from '../services/storage';
import { pickLogoColor, WALLET_PASS_RED } from '../services/eventPassColors';

const STORAGE_PREFIX = 'event_pass_color:';

// Colours already worked out this session, so a pass re-rendering in the
// stack or flying into the event home never flashes the fallback.
const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

async function resolveLogoColor(logoUrl: string): Promise<string> {
  const remembered = memory.get(logoUrl);
  if (remembered) return remembered;

  const inFlight = pending.get(logoUrl);
  if (inFlight) return inFlight;

  const work = (async () => {
    const stored = await asyncStorage.get<string>(STORAGE_PREFIX + logoUrl).catch(() => null);
    if (stored) return stored;
    const result = await ImageColors.getColors(logoUrl, {
      fallback: WALLET_PASS_RED,
      quality: 'low',
      cache: true,
      key: logoUrl.slice(-200),
    });
    const color = pickLogoColor(result);
    void asyncStorage.set(STORAGE_PREFIX + logoUrl, color).catch(() => {});
    return color;
  })()
    .catch(() => WALLET_PASS_RED)
    .then((color) => {
      memory.set(logoUrl, color);
      pending.delete(logoUrl);
      return color;
    });

  pending.set(logoUrl, work);
  return work;
}

/**
 * The fill for an event's pass when it has no banner: the logo's main colour,
 * or the Wallet pass red when there's no logo or its colours can't be read.
 * Returns null while a logo is still being looked at.
 */
export function useEventPassColor(logoUrl?: string | null, enabled = true): string | null {
  const [color, setColor] = useState<string | null>(() =>
    !logoUrl ? WALLET_PASS_RED : memory.get(logoUrl) ?? null
  );

  useEffect(() => {
    if (!enabled) return;
    if (!logoUrl) {
      setColor(WALLET_PASS_RED);
      return;
    }
    const known = memory.get(logoUrl);
    if (known) {
      setColor(known);
      return;
    }
    let cancelled = false;
    setColor(null);
    void resolveLogoColor(logoUrl).then((resolved) => {
      if (!cancelled) setColor(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl, enabled]);

  return color;
}
