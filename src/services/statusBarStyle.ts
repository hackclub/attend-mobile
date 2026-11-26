import { StatusBar } from 'react-native';

export type BarStyle = 'light' | 'dark';

/** A status bar style set from code, as one entry in React Native's StatusBar stack. */
export interface StatusBarStyleEntry {
  /** Shows `style`: on top of the stack if this entry wasn't in it, else where it is. */
  set(style: BarStyle): void;
  /** Takes the entry out, so whatever is under it shows again. */
  clear(): void;
}

/**
 * The styles the app sets from code (the banner's, the switcher's) go in
 * the same stack as the <StatusBar> components (the app's default, the
 * scanner's, the enlarged QR code's), so the latest one wins and they're
 * applied in order. Set straight on the native status bar instead
 * (expo-status-bar's setStatusBarStyle) they raced the stack, which
 * applies once a frame: leaving the scanner turned the banner's light
 * status bar dark again a frame later, and on iOS, where the stack skips
 * a style matching the last one it set, a component's style could be
 * skipped altogether.
 */
export function statusBarStyleEntry(): StatusBarStyleEntry {
  let entry: ReturnType<typeof StatusBar.pushStackEntry> | null = null;
  let shown: BarStyle | null = null;
  return {
    set(style) {
      if (entry && shown === style) return;
      const props = { barStyle: style === 'light' ? 'light-content' : 'dark-content' } as const;
      entry = entry ? StatusBar.replaceStackEntry(entry, props) : StatusBar.pushStackEntry(props);
      shown = style;
    },
    clear() {
      if (!entry) return;
      StatusBar.popStackEntry(entry);
      entry = null;
      shown = null;
    },
  };
}
