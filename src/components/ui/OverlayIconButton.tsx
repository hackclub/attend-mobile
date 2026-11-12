import React from 'react';
import { Pressable, StyleSheet, View, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import { hitTarget, overlayTokens } from '../../theme';
import { Icon, type IconName } from './Icon';
import { pressedStyle, ripple } from './pressFeedback';

export interface OverlayIconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Without it the button is only the look, e.g. a native menu's trigger. */
  onPress?: () => void;
  /** `camera` is denser so it reads over any scene; `image` sits on a photo or banner. */
  surface?: 'camera' | 'image';
  /** On, like the torch: a yellow fill. */
  active?: boolean;
  disabled?: boolean;
  hitSlop?: number | Insets;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ICON_SIZE = 20;

/**
 * A 44pt round icon button over imagery: the camera, an event photo or a
 * brand banner. White glyph on a dark translucent disc, the same in light
 * and dark mode.
 */
export function OverlayIconButton({
  icon,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  surface = 'image',
  active = false,
  disabled = false,
  hitSlop,
  style,
  testID,
}: OverlayIconButtonProps) {
  const fill = active
    ? overlayTokens.active
    : surface === 'camera' ? overlayTokens.cameraControl : overlayTokens.imageControl;
  const fg = active ? overlayTokens.onActive : overlayTokens.on;
  const glyph = <Icon name={icon} size={ICON_SIZE} color={fg} />;

  if (!onPress) {
    return (
      <View style={[styles.round, { backgroundColor: fill }, disabled && styles.disabled, style]} testID={testID}>
        {glyph}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      android_ripple={ripple(fg, { alpha: 0.24, borderless: true, radius: hitTarget / 2 })}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: fill },
        disabled && styles.disabled,
        pressedStyle(pressed && !disabled),
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected: active || undefined }}
      testID={testID}
    >
      {glyph}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
