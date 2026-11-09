import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme';
import { CHROME_MAX_FONT_SCALE } from './fontScale';
import { PressableSurface } from './PressableSurface';

export interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/**
 * One choice in a strip of filters, e.g. the inbox's events: on iOS a pill
 * styled like a segment (selected: accent on the selected tint); Material 3's
 * filter chip on Android (FilterChip.android.tsx).
 */
export function FilterChip({ label, selected, onPress }: FilterChipProps) {
  const { tokens, type, radii } = useTheme();
  return (
    <PressableSurface
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      rippleColor={selected ? tokens.accent : tokens.text}
      style={[
        styles.chip,
        {
          borderRadius: radii.pill,
          borderColor: selected ? tokens.accent : tokens.input,
          backgroundColor: selected ? tokens.selected : tokens.bg,
        },
      ]}
      contentStyle={styles.chipContent}
    >
      <Text
        style={[type.label, { color: selected ? tokens.accent : tokens.text }]}
        numberOfLines={1}
        maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
      >
        {label}
      </Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1 },
  // 36 including the 1px border.
  chipContent: { minHeight: 34, paddingHorizontal: 14, justifyContent: 'center' },
});
