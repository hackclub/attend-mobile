import React from 'react';
import { RefreshControl as RNRefreshControl, type RefreshControlProps } from 'react-native';
import { haptics } from '../../services/haptics';

/**
 * React Native's RefreshControl with a light tick when the pull triggers.
 * onRefresh only fires for the user's pull, never when `refreshing` is set in
 * code, so a programmatic reload stays silent.
 */
export function RefreshControl({ onRefresh, ...props }: RefreshControlProps) {
  return (
    <RNRefreshControl
      {...props}
      onRefresh={
        onRefresh
          ? () => {
              haptics.impact('light');
              onRefresh();
            }
          : undefined
      }
    />
  );
}
