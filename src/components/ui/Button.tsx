import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme';
import { Icon, type IconName } from './Icon';
import { PressableSurface } from './PressableSurface';
import { Spinner } from './Spinner';

export type ButtonVariant = 'normal' | 'primary' | 'link' | 'icon' | 'plain-icon';

export interface ButtonProps {
  /** Visible label. For `variant="icon"` it becomes the accessibility label. */
  title: string;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  icon?: IconName;
  iconPosition?: 'start' | 'end';
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container width. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Console button (.cs-btn) as a pill: min height 44, 2px accent border.
 * `primary` fills with the accent, `link` drops the border, `icon` is a
 * 44pt round button showing only `icon`, and `plain-icon` is the same 44pt
 * target with no border or fill (a sheet's close button).
 */
export function Button({
  title,
  onPress,
  variant = 'normal',
  icon,
  iconPosition = 'start',
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const { tokens, type, radii, hitTarget } = useTheme();
  const inactive = disabled || loading;
  const isPrimary = variant === 'primary';
  const isLink = variant === 'link';
  const isPlainIcon = variant === 'plain-icon';
  const isIcon = variant === 'icon' || isPlainIcon;

  let bg = tokens.bg;
  let border = tokens.accent;
  let fg = tokens.accent;
  if (isPrimary) {
    bg = tokens.accent;
    fg = tokens.accentOn;
  }
  if (isLink || isPlainIcon) {
    bg = 'transparent';
    border = 'transparent';
  }
  if (isPlainIcon) fg = tokens.text2;
  if (disabled) {
    fg = tokens.disabled;
    if (isPrimary) {
      bg = tokens.inputDisabled;
      border = tokens.inputDisabled;
    } else if (!isLink && !isPlainIcon) {
      border = tokens.input;
    }
  }

  const { shape: callerShape, content: callerContent } = splitButtonStyle(style);

  const iconNode = loading ? (
    <Spinner size="small" color={fg} decorative />
  ) : icon ? (
    <Icon name={icon} size={isIcon ? 20 : 16} color={fg} />
  ) : null;

  return (
    <PressableSurface
      onPress={onPress}
      disabled={inactive}
      accessibilityRole={isLink ? 'link' : 'button'}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      rippleColor={fg}
      hitSlop={isLink ? 4 : undefined}
      style={[
        styles.shape,
        { borderRadius: radii.pill, backgroundColor: bg, borderColor: border },
        isIcon && { width: hitTarget, height: hitTarget },
        fullWidth && styles.full,
        callerShape,
      ]}
      contentStyle={[
        styles.base,
        // The 2px border sits outside the content.
        { minHeight: hitTarget - BORDER * 2 },
        isLink && styles.link,
        isIcon && styles.icon,
        callerContent,
      ]}
      testID={testID}
    >
      {isIcon ? (
        iconNode
      ) : (
        <View style={styles.content}>
          {iconPosition === 'start' && iconNode}
          <Text style={[type.label, styles.title, { color: fg }]} numberOfLines={1}>
            {title}
          </Text>
          {iconPosition === 'end' && iconNode}
        </View>
      )}
    </PressableSurface>
  );
}

const BORDER = 2;

const CONTENT_KEYS = new Set<string>([
  'padding',
  'paddingHorizontal',
  'paddingVertical',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingStart',
  'paddingEnd',
  'minHeight',
]);

/**
 * A caller's style splits between the shape (margins, size, alignment) and
 * the content inside it (padding, minimum height), which is where the
 * ripple-clipping layout puts them. A minimum height is for the whole
 * button, so the content's loses the border.
 */
function splitButtonStyle(style: StyleProp<ViewStyle>): { shape: ViewStyle; content: ViewStyle } {
  const flat = StyleSheet.flatten(style) ?? {};
  const shape: Record<string, unknown> = {};
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (!CONTENT_KEYS.has(key)) shape[key] = value;
    else if (key === 'minHeight' && typeof value === 'number') content[key] = Math.max(0, value - BORDER * 2);
    else content[key] = value;
  }
  return { shape: shape as ViewStyle, content: content as ViewStyle };
}

const styles = StyleSheet.create({
  shape: { borderWidth: BORDER, alignSelf: 'flex-start' },
  base: { paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  link: { paddingHorizontal: 12 },
  icon: { paddingHorizontal: 0 },
  full: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { letterSpacing: 0.07 },
});
