import React, { useEffect, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useTheme } from '../../theme';

/** DESIGN.md's crossfade for content arriving (as for participant photos). */
const FADE_IN_MS = 120;

/**
 * Fades its children in when it mounts. Swap a loading placeholder for the
 * loaded content inside one of these so the content arrives softly instead
 * of popping in. Instant with Reduce Motion.
 */
export function FadeIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    const fade = Animated.timing(opacity, {
      toValue: 1,
      duration: reduceMotion ? 0 : FADE_IN_MS,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [opacity, reduceMotion]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

/**
 * A rounded bar standing in for a line of text that hasn't loaded, at about
 * the height of body text. Hidden from screen readers; pair it with a
 * loading label on the container.
 */
export function SkeletonLine({ width = '100%', style }: { width?: DimensionValue; style?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.line, { width, backgroundColor: tokens.div2 }, style]}
    />
  );
}

const styles = StyleSheet.create({
  // A body line is 16pt type on a 23pt line: a 12pt bar centred in it.
  line: { height: 12, borderRadius: 6, marginVertical: 5.5 },
});
