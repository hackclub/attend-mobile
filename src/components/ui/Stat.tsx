import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';

export interface StatProps {
  label: string;
  value: string | number;
  /** Line under the number, e.g. "120 complete · 9 in progress". */
  sub?: string;
  /** `accent` colours the number (e.g. a headline percentage). */
  tone?: 'default' | 'accent';
  /** Left rule, for the 2nd and later stats in a row. */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Big light number with a bold label above it (console stat). */
export function Stat({ label, value, sub, tone = 'default', divider = false, style, testID }: StatProps) {
  const { tokens, type } = useTheme();
  return (
    <View
      style={[styles.stat, divider && { borderLeftWidth: 1, borderLeftColor: tokens.div2, paddingLeft: 12 }, style]}
      accessible
      accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`}
      testID={testID}
    >
      <Text style={[type.label, { color: tokens.text }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[type.stat, styles.value, { color: tone === 'accent' ? tokens.accent : tokens.textH }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? <Text style={[type.body, { color: tokens.text2 }]}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, minWidth: 0 },
  value: { marginTop: 4, fontVariant: ['tabular-nums'] },
});
