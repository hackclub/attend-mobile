import React, { useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from '../services/toast';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useTheme, withAlpha } from '../theme';
import { slow } from '../theme/motion';
import { Icon } from './ui';

const GAP = 12;

/** Shows the current toast (services/toast) along the bottom, over the app. */
export function ToastHost() {
  const current = useSyncExternalStore(toast.subscribe, toast.get, toast.get);
  const insets = useSafeAreaInsets();
  const { tokens, type } = useTheme();
  const reduceMotion = useReduceMotion();

  // iOS has no live regions: say it.
  useEffect(() => {
    if (current && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(current.message);
  }, [current]);

  if (!current) return null;
  const bottom = Math.max(insets.bottom, current.bottomOffset) + GAP;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.host, { paddingBottom: bottom }]}>
      <Animated.View
        key={current.id}
        entering={reduceMotion ? undefined : FadeIn.duration(slow(180))}
        exiting={reduceMotion ? undefined : FadeOut.duration(slow(220))}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          { backgroundColor: tokens.textH, shadowColor: withAlpha(tokens.textH, 1) },
        ]}
      >
        <Icon name="information-circle" size={16} color={tokens.bg} />
        <Text style={[type.body, styles.text, { color: tokens.bg }]}>{current.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 520,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { flexShrink: 1 },
});
