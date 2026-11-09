import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { haptics } from '../../services/haptics';

export interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** Required: a switch with no visible label still needs a spoken one. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TRACK_W = 44;
const TRACK_H = 26;
const THUMB = 20;
const TRAVEL = TRACK_W - THUMB - 6;

/** Pill switch: accent track when on, 20pt thumb. */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  style,
  testID,
}: ToggleProps) {
  const { tokens } = useTheme();
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [progress, value]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [tokens.input, tokens.accent],
  });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] });

  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
      style={[disabled && styles.disabled, style]}
      testID={testID}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View
          style={[
            styles.thumb,
            { backgroundColor: value ? tokens.accentOn : '#ffffff', transform: [{ translateX }] },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, padding: 3 },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  disabled: { opacity: 0.4 },
});
