import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme, type ThemeTokens } from '../../theme';

// The console's status glyphs (console_helper.rb STATUS_ICONS): 16px,
// stroke 2, round caps. Colour comes from the status, label sits beside it.

export type StatusType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'pending'
  | 'in-progress'
  | 'stopped';

export function StatusGlyph({ type, color, size = 16 }: { type: StatusType; color: string; size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {type === 'success' && (
        <>
          <Circle cx={8} cy={8} r={7} />
          <Path d="M4.5 8.2l2.3 2.3 4.7-4.9" />
        </>
      )}
      {type === 'error' && (
        <>
          <Circle cx={8} cy={8} r={7} />
          <Path d="M5.5 5.5l5 5m0-5l-5 5" />
        </>
      )}
      {type === 'warning' && (
        <>
          <Path d="M8 1.5l7 12.5H1z" />
          <Path d="M8 6v4m0 1.8v.2" />
        </>
      )}
      {type === 'info' && (
        <>
          <Circle cx={8} cy={8} r={7} />
          <Path d="M8 7v4.5m0-6.8v.3" />
        </>
      )}
      {type === 'pending' && (
        <>
          <Circle cx={8} cy={8} r={7} />
          <Path d="M8 4.5V8l2.5 1.8" />
        </>
      )}
      {type === 'in-progress' && (
        <>
          <Circle cx={8} cy={8} r={7} strokeDasharray="3 2.5" />
          <Circle cx={8} cy={8} r={1.4} fill={color} stroke="none" />
        </>
      )}
      {type === 'stopped' && (
        <>
          <Circle cx={8} cy={8} r={7} />
          <Path d="M5 8h6" />
        </>
      )}
    </Svg>
  );
}

export function statusColor(type: StatusType, tokens: ThemeTokens): string {
  switch (type) {
    case 'success':
      return tokens.success;
    case 'error':
      return tokens.error;
    case 'warning':
      return tokens.warning;
    case 'info':
    case 'in-progress':
      return tokens.info;
    case 'pending':
    case 'stopped':
      return tokens.inactive;
  }
}

export interface StatusIndicatorProps {
  type: StatusType;
  label: string;
  /** Colour the label like the glyph (console default). Set false for body-coloured text. */
  colorLabel?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function StatusIndicator({ type, label, colorLabel = true, style, testID }: StatusIndicatorProps) {
  const { tokens, type: typeScale } = useTheme();
  const color = statusColor(type, tokens);
  return (
    <View style={[styles.row, style]} accessible accessibilityLabel={label} testID={testID}>
      <StatusGlyph type={type} color={color} />
      <Text style={[typeScale.body, { color: colorLabel ? color : tokens.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
