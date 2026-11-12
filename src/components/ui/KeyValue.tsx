import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';

export interface KeyValueProps {
  label: string;
  value: ReactNode;
  /** Override the value colour, e.g. `tokens.error` for an allergy. */
  valueColor?: string;
  /** `row` puts the label in a fixed-width column; `stacked` puts it above. */
  layout?: 'row' | 'stacked';
  labelWidth?: number;
  /** Let the value be selected and copied. */
  selectable?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A labelled value (console key-value pair), e.g. "Diet type  Vegetarian". */
export function KeyValue({
  label,
  value,
  valueColor,
  layout = 'row',
  labelWidth = 140,
  selectable = false,
  style,
  testID,
}: KeyValueProps) {
  const { tokens, type } = useTheme();
  const stacked = layout === 'stacked';
  const a11yValue = typeof value === 'string' || typeof value === 'number' ? `${label}: ${value}` : undefined;

  return (
    <View
      style={[stacked ? styles.stacked : styles.row, style]}
      accessible={Boolean(a11yValue)}
      accessibilityLabel={a11yValue}
      testID={testID}
    >
      <Text style={[type.label, { color: tokens.text }, !stacked && { width: labelWidth }]}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[type.body, styles.value, { color: valueColor ?? tokens.text }]} selectable={selectable}>
          {value}
        </Text>
      ) : (
        <View style={styles.value}>{value}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 6 },
  stacked: { gap: 2, paddingVertical: 6 },
  value: { flex: 1, minWidth: 0 },
});
