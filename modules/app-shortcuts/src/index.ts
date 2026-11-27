import { Platform } from 'react-native';

// iOS home screen quick actions. Android launcher shortcuts need no JS: they
// launch MainActivity with an attend:// VIEW intent, which React Native's
// Linking already delivers (getInitialURL on a cold start, 'url' when warm).

interface Subscription {
  remove(): void;
}

interface AppShortcutsModule {
  consumePendingURL(): string | null;
  addListener(event: 'onShortcut', listener: () => void): Subscription;
}

const AppShortcuts: AppShortcutsModule | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo-modules-core');
    return requireOptionalNativeModule('AppShortcuts');
  } catch {
    return null;
  }
})();

/** The deep link of a quick action JS has not handled yet (returned once). */
export function consumePendingShortcutURL(): string | null {
  return AppShortcuts?.consumePendingURL() ?? null;
}

/** Calls `listener` when a quick action is chosen while the app is running. */
export function addShortcutListener(listener: () => void): Subscription {
  return AppShortcuts?.addListener('onShortcut', listener) ?? { remove() {} };
}
