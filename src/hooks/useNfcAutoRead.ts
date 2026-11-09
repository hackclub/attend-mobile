import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { badgeTokenFromResult, nfcService } from '../services/nfc';

// A badge that bounces in and out of the field is reported more than once.
const SAME_TOKEN_SUPPRESS_MS = 1500;

/**
 * Android: while `enabled`, listens for badge taps continuously and calls
 * `onToken` for each one, without a "hold near reader" sheet. The token is
 * read with the same NDEF rules as `nfcService.readTag`: the
 * `hackclub.com:attend` external record (the badge token), or else the badge's
 * URI/text record (an attend://checkin/… link, which `parseQRCode` handles).
 *
 * `active` is true only while listening is registered and NFC is switched on.
 * Taps are ignored while a one-shot read/write (e.g. writing a badge) runs.
 * iOS has no background tag reading for apps, so this is a no-op there.
 */
export function useNfcAutoRead(opts: {
  enabled: boolean;
  onToken: (token: string) => void;
}): { active: boolean } {
  const { enabled } = opts;
  const onTokenRef = useRef(opts.onToken);
  useEffect(() => {
    onTokenRef.current = opts.onToken;
  }, [opts.onToken]);
  const isAndroid = Platform.OS === 'android';
  const registered = useSyncExternalStore(
    subscribeToNfc,
    () => nfcService.getSnapshot().autoReadActive
  );

  useEffect(() => {
    if (!isAndroid || !enabled) return;

    let last: { token: string; at: number } | null = null;
    const stop = nfcService.startAutoRead(result => {
      const token = badgeTokenFromResult(result);
      if (!token) return;
      const now = Date.now();
      if (last && last.token === token && now - last.at < SAME_TOKEN_SUPPRESS_MS) return;
      last = { token, at: now };
      onTokenRef.current(token);
    });

    // NFC can be toggled from quick settings while we are in the background.
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void nfcService.isEnabled();
    });

    return () => {
      appState.remove();
      stop();
    };
  }, [enabled, isAndroid]);

  return { active: isAndroid && enabled && registered };
}

function subscribeToNfc(onChange: () => void): () => void {
  return nfcService.subscribe(onChange);
}
