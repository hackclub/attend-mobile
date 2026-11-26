import React, { useContext } from 'react';
import { RefreshControl as RNRefreshControl, useWindowDimensions, type RefreshControlProps } from 'react-native';
import { BottomTabBarHeightContext } from 'react-native-bottom-tabs';
import { haptics } from '../../services/haptics';
import { toastIfOffline } from '../../services/offlineToast';
import { resolveTabBarInset } from '../../hooks/useTabBarInset';

/**
 * React Native's RefreshControl with a light tick when the pull triggers.
 * onRefresh only fires for the user's pull, never when `refreshing` is set in
 * code, so a programmatic reload stays silent. A pull while offline still
 * runs it (the screen keeps what it has), and says why nothing changed.
 */
export function RefreshControl({ onRefresh, ...props }: RefreshControlProps) {
  const { height } = useWindowDimensions();
  // Inside the tabs the toast sits above the tab bar.
  const tabBarInset = resolveTabBarInset(useContext(BottomTabBarHeightContext) ?? 0, height);
  return (
    <RNRefreshControl
      {...props}
      onRefresh={
        onRefresh
          ? () => {
              haptics.impact('light');
              void toastIfOffline({ bottomOffset: tabBarInset });
              onRefresh();
            }
          : undefined
      }
    />
  );
}
