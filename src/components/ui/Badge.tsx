import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type ThemeTokens } from '../../theme';

export type BadgeColor = 'grey' | 'green' | 'blue' | 'red' | 'yellow';

export interface BadgeProps {
  label: string;
  color?: BadgeColor;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function badgeColors(color: BadgeColor, t: ThemeTokens): { bg: string; fg: string } {
  switch (color) {
    case 'green':
      return { bg: t.badgeGreen, fg: t.badgeOn };
    case 'blue':
      return { bg: t.badgeBlue, fg: t.badgeOn };
    case 'red':
      return { bg: t.badgeRed, fg: t.badgeOn };
    case 'yellow':
      return { bg: t.warningFill, fg: t.onWarningFill };
    case 'grey':
      return { bg: t.badgeGrey, fg: t.badgeOn };
  }
}

/** Small filled label (console .cs-badge): 12/20, radius 4. */
export function Badge({ label, color = 'grey', style, testID }: BadgeProps) {
  const { tokens, radii } = useTheme();
  const { bg, fg } = badgeColors(color, tokens);
  return (
    <View
      style={[styles.badge, { backgroundColor: bg, borderRadius: radii.badge }, style]}
      accessibilityRole="text"
      testID={testID}
    >
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8 },
  label: { fontSize: 12, lineHeight: 20, fontWeight: '400' },
});
