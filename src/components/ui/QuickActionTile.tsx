import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type TintName } from '../../theme';
import { Icon, type IconName } from './Icon';
import { PressableSurface } from './PressableSurface';
import { FadeIn, SkeletonLine } from './Loading';

/** A tile sub-label that hasn't loaded yet: shows a placeholder bar. */
export const QUICK_ACTION_LOADING: unique symbol = Symbol('loading');

export interface QuickActionTileProps {
  icon: IconName;
  label: string;
  /** A line under the label, or `QUICK_ACTION_LOADING` for a placeholder while it loads. */
  subLabel?: string | typeof QUICK_ACTION_LOADING;
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
      accessibilityLabel={
        subLabel === QUICK_ACTION_LOADING ? `${label}, loading` : subLabel ? `${label}, ${subLabel}` : label
      }
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      rippleColor={tokens.text}
      pressScale={0.97}
      style={[
        styles.tile,
        { borderColor: tokens.cardBorder, borderRadius: radii.container, backgroundColor: tokens.card },
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
      {subLabel === undefined ? null : subLabel === QUICK_ACTION_LOADING ? (
        <SkeletonLine width="60%" />
      ) : (
        <FadeIn>
          <Text style={[type.body, styles.center, { color: tokens.text2 }]} numberOfLines={1}>
            {subLabel}
          </Text>
        </FadeIn>
      )}
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
