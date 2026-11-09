import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type TintName } from '../../theme';
import { Icon, type IconName } from './Icon';
import { PressableSurface } from './PressableSurface';

export interface QuickActionTileProps {
  icon: IconName;
  label: string;
  subLabel?: string;
  tint?: TintName;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Console quick action: tinted round icon chip, bold label, optional sub-label. */
export function QuickActionTile({
  icon,
  label,
  subLabel,
  tint = 'grey',
  onPress,
  disabled = false,
  accessibilityHint,
  style,
  testID,
}: QuickActionTileProps) {
  const { tokens, type, radii } = useTheme();
  const { bg, fg } = tokens.tint[tint];
  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={subLabel ? `${label}, ${subLabel}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      rippleColor={tokens.text}
      style={[
        styles.tile,
        { borderColor: tokens.div2, borderRadius: radii.item, backgroundColor: tokens.bg },
        disabled && styles.disabled,
        style,
      ]}
      contentStyle={styles.content}
      testID={testID}
    >
      <View style={[styles.chip, { backgroundColor: bg }]}>
        <Icon name={icon} size={20} color={fg} />
      </View>
      <Text style={[type.label, styles.center, { color: tokens.text }]} numberOfLines={2}>
        {label}
      </Text>
      {subLabel ? (
        <Text style={[type.body, styles.center, { color: tokens.text2 }]} numberOfLines={1}>
          {subLabel}
        </Text>
      ) : null}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderWidth: 1 },
  content: { alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 8 },
  chip: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
