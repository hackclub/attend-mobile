import React from 'react';
import { RefreshControl as RNRefreshControl, type RefreshControlProps as RNRefreshControlProps } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { haptics } from '../../services/haptics';

const AnimatedRefreshControl = Animated.createAnimatedComponent(RNRefreshControl);

export interface RefreshControlProps extends RNRefreshControlProps {
  /**
   * Off while this is true, switched on the UI thread: e.g. while a finger
   * is down on the event banner, whose pull opens the switcher instead.
   * Needs a Reanimated ScrollView around it.
   */
  heldBy?: SharedValue<boolean>;
}

/**
 * React Native's RefreshControl with a light tick when the pull triggers.
 * onRefresh only fires for the user's pull, never when `refreshing` is set in
 * code, so a programmatic reload stays silent.
 */
export function RefreshControl({ onRefresh, heldBy, ...props }: RefreshControlProps) {
  const tickThenRefresh = onRefresh
    ? () => {
        haptics.impact('light');
        onRefresh();
      }
    : undefined;
  if (heldBy) return <HeldRefreshControl {...props} onRefresh={tickThenRefresh} heldBy={heldBy} />;
  return <RNRefreshControl {...props} onRefresh={tickThenRefresh} />;
}

function HeldRefreshControl({ heldBy, ...props }: RNRefreshControlProps & { heldBy: SharedValue<boolean> }) {
  const animatedProps = useAnimatedProps(() => ({ enabled: !heldBy.value }));
  return <AnimatedRefreshControl {...props} animatedProps={animatedProps} />;
}
