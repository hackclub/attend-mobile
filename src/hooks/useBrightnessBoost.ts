import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Brightness from 'expo-brightness';

/**
 * Turns the screen up to full while `active` (a QR being shown to a scanner),
 * and puts it back afterwards. iOS keeps an app's brightness after the app
 * leaves, so it's also put back while the app is in the background and raised
 * again on return.
 */
export function useBrightnessBoost(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let original: number | null = null;
    let boosted = false;
    let unmounted = false;
    // One step at a time, so a quick open-and-close can't leave it raised.
    let queue: Promise<void> = Promise.resolve();
    const run = (step: () => Promise<void>) => {
      queue = queue.then(step).catch(() => {});
    };

    const boost = () =>
      run(async () => {
        if (unmounted || boosted) return;
        if (original == null) original = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(1);
        boosted = true;
      });

    const restore = () =>
      run(async () => {
        if (!boosted) return;
        boosted = false;
        if (Platform.OS === 'android') {
          // Hands the window back to the system setting (and auto-brightness).
          await Brightness.restoreSystemBrightnessAsync();
        } else if (original != null) {
          await Brightness.setBrightnessAsync(original);
        }
      });

    boost();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') boost();
      else if (state === 'background') restore();
    });

    return () => {
      unmounted = true;
      subscription.remove();
      restore();
    };
  }, [active]);
}
