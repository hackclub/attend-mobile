import { useEffect } from 'react';
import { Linking } from 'react-native';
import {
  addShortcutListener,
  consumePendingShortcutURL,
} from '../../modules/app-shortcuts/src';

/**
 * Routes iOS home screen quick actions (Scan, Search people, My tickets) to
 * their attend:// deep link, including the one that cold-started the app.
 * The URL is re-opened through Linking so the navigation linking config
 * handles it like any other deep link. Android launcher shortcuts are plain
 * VIEW intents and need nothing here; the hook is a no-op there.
 *
 * Mount once, inside the tree that renders the NavigationContainer (so its
 * linking listener is already subscribed), e.g. in the App component body.
 * Pass `ready: false` until the container is ready if links must wait for it
 * (e.g. until auth has loaded); a pending action is kept until then.
 */
export function useAppShortcutLaunch(ready = true): void {
  useEffect(() => {
    if (!ready) return;
    const open = () => {
      const url = consumePendingShortcutURL();
      if (url) void Linking.openURL(url).catch(() => undefined);
    };
    open();
    const subscription = addShortcutListener(open);
    return () => subscription.remove();
  }, [ready]);
}
