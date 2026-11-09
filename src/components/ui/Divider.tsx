import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';

export interface DividerProps {
  /** Use the stronger `div` colour instead of the hairline `div2`. */
  strong?: boolean;
  vertical?: boolean;
  /** Left inset (or top inset when vertical). */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}

export function Divider({ strong = false, vertical = false, inset = 0, style }: DividerProps) {
  const { tokens } = useTheme();
  const color = strong ? tokens.div : tokens.div2;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        vertical
          ? { width: StyleSheet.hairlineWidth * 2, alignSelf: 'stretch', marginTop: inset }
          : { height: StyleSheet.hairlineWidth * 2, marginLeft: inset },
        { backgroundColor: color },
        style,
      ]}
    />
  );
}
