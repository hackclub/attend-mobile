import { Platform, type PressableAndroidRippleConfig, type StyleProp, type ViewStyle } from 'react-native';
import { withAlpha } from '../../theme/alpha';

// Native press feedback: Android gets the platform ripple, iOS dims the
// control while it is held. Components pass `ripple(...)` to
// `android_ripple` and `pressedStyle(pressed)` into their style function.
//
// The ripple is a Material state layer: the colour of the content it sits
// under (text, icon) at low opacity, drawn under that content. Pass the
// content colour with `alpha` rather than an opaque "pressed" fill, which
// would paint over the label.

export const isAndroid = Platform.OS === 'android';

export const IOS_PRESSED_OPACITY = 0.55;

/** State-layer opacity for buttons, tiles and other controls. */
export const STATE_LAYER_ALPHA = 0.12;
/** State-layer opacity for list rows. */
export const ROW_STATE_LAYER_ALPHA = 0.1;

export function ripple(
  color: string,
  options: { alpha?: number; borderless?: boolean; foreground?: boolean; radius?: number } = {},
): PressableAndroidRippleConfig | undefined {
  if (!isAndroid) return undefined;
  return {
    color: options.alpha == null ? color : withAlpha(color, options.alpha),
    borderless: options.borderless ?? false,
    foreground: options.foreground ?? false,
    radius: options.radius,
  };
}

export function pressedStyle(pressed: boolean, opacity = IOS_PRESSED_OPACITY): StyleProp<ViewStyle> {
  return !isAndroid && pressed ? { opacity } : null;
}
