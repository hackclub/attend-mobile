import { useContext } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from 'react-native-bottom-tabs';
import { resolveTabBarInset, useTopTabBarInset } from './useTabBarInset';

/**
 * The space a full-bleed screen leaves at its edges: the status bar (plus an
 * iPad's top tab bar) at the top; the tab bar, or the home indicator / Android
 * navigation bar where there's no tab bar, at the bottom. Safe outside the tab
 * navigator, where there is no bar height to read.
 */
export function useScreenInsets(): { top: number; bottom: number } {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const topTabInset = useTopTabBarInset();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  return {
    top: insets.top + topTabInset,
    bottom: Math.max(insets.bottom, resolveTabBarInset(tabBarHeight, height)),
  };
}
