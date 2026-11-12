import React from 'react';
import { RefreshControl as RNRefreshControl, type RefreshControlProps as RNRefreshControlProps } from 'react-native';
import { RefreshControl as GestureRefreshControl, type usePanGesture } from 'react-native-gesture-handler';
import { haptics } from '../../services/haptics';

export interface RefreshControlProps extends RNRefreshControlProps {
  /**
   * A gesture the pull-to-refresh waits on, e.g. the banner's pull to open
   * the event switcher, so a pull starting on the banner doesn't refresh.
   * Needs the gesture handler's ScrollView around it.
   */
  requireToFail?: ReturnType<typeof usePanGesture>;
}

/**
 * React Native's RefreshControl with a light tick when the pull triggers.
 * onRefresh only fires for the user's pull, never when `refreshing` is set in
 * code, so a programmatic reload stays silent.
 */
export function RefreshControl({ onRefresh, requireToFail, ...props }: RefreshControlProps) {
  const tickThenRefresh = onRefresh
    ? () => {
        haptics.impact('light');
        onRefresh();
      }
    : undefined;
  if (requireToFail) {
    return <GestureRefreshControl {...props} onRefresh={tickThenRefresh} requireToFail={requireToFail} />;
  }
  return <RNRefreshControl {...props} onRefresh={tickThenRefresh} />;
}
