import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The system navigation bar's height on Android, which draws edge to edge, so
 * a pushed screen's scroll content can clear it. 0 on iOS, where the scroll
 * views adjust their own insets (contentInsetAdjustmentBehavior="automatic").
 */
export function useAndroidBottomInset(): number {
  const { bottom } = useSafeAreaInsets();
  return Platform.OS === 'android' ? bottom : 0;
}

/** `style` with `inset` added to its bottom padding. */
export function withBottomInset(style: StyleProp<ViewStyle>, inset: number): StyleProp<ViewStyle> {
  if (!inset) return style;
  const flat = StyleSheet.flatten(style) ?? {};
  const base = flat.paddingBottom ?? flat.paddingVertical ?? flat.padding ?? 0;
  return [style, { paddingBottom: (typeof base === 'number' ? base : 0) + inset }];
}
