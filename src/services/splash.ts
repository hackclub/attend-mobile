import * as SplashScreen from 'expo-splash-screen';

// If the app never reports ready (a locked keychain on a background launch,
// a hung read), the splash still goes after this long.
export const SPLASH_TIMEOUT_MS = 4_000;

let hidden = false;
let timeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Keeps the native splash up until hideSplash() (or the timeout). Called once
 * at module scope, before the first render.
 */
export function holdSplash(): void {
  SplashScreen.preventAutoHideAsync().catch(() => {});
  timeout ??= setTimeout(hideSplash, SPLASH_TIMEOUT_MS);
}

/** Hides the splash once; later calls do nothing. */
export function hideSplash(): void {
  if (hidden) return;
  hidden = true;
  if (timeout) clearTimeout(timeout);
  timeout = null;
  SplashScreen.hideAsync().catch(() => {});
}

/**
 * The first screen is worth showing once auth has restored (which brings the
 * cached event and roster with it) and the navigator has mounted it.
 */
export function isAppReady({ authLoading, navigationReady }: {
  authLoading: boolean;
  navigationReady: boolean;
}): boolean {
  return !authLoading && navigationReady;
}
