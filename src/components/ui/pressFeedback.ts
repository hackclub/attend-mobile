import { Platform, type PressableAndroidRippleConfig, type StyleProp, type ViewStyle } from 'react-native';

// Native press feedback: Android gets the platform ripple, iOS dims the
// control while it is held. Components pass `ripple(...)` to
// `android_ripple` and `pressedStyle(pressed)` into their style function.

export const isAndroid = Platform.OS === 'android';

export const IOS_PRESSED_OPACITY = 0.55;

export function ripple(
  color: string,
  options: { borderless?: boolean; foreground?: boolean; radius?: number } = {},
): PressableAndroidRippleConfig | undefined {
  if (!isAndroid) return undefined;
  return { color, borderless: options.borderless ?? false, foreground: options.foreground, radius: options.radius };
}

export function pressedStyle(pressed: boolean, opacity = IOS_PRESSED_OPACITY): StyleProp<ViewStyle> {
  return !isAndroid && pressed ? { opacity } : null;
}
