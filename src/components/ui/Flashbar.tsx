import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { hitTarget, useTheme, type ThemeTokens } from '../../theme';
import { Icon, type IconName } from './Icon';
import { pressedStyle, ripple } from './pressFeedback';

export type FlashbarType = 'info' | 'success' | 'warning' | 'error';

export interface FlashbarProps {
  type?: FlashbarType;
  /** Bold first line. */
  title?: string;
  message?: ReactNode;
  /** Defaults to a glyph per type. */
  icon?: IconName;
  action?: { label: string; onPress: () => void };
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const DEFAULT_ICON: Record<FlashbarType, IconName> = {
  info: 'information-circle',
  success: 'check-circle',
  warning: 'exclamation',
  error: 'exclamation-circle',
};

function flashColors(type: FlashbarType, t: ThemeTokens) {
  switch (type) {
    case 'success':
      return { bg: t.badgeGreen, fg: t.onStatusFill };
    case 'error':
      return { bg: t.badgeRed, fg: t.onStatusFill };
    case 'warning':
      return { bg: t.warningFill, fg: t.onWarningFill };
    case 'info':
      return { bg: t.badgeBlue, fg: t.onStatusFill };
  }
}

/** Console flash (.cs-flash): solid filled banner, radius 12. */
export function Flashbar({
  type = 'info',
  title,
  message,
  icon,
  action,
  onDismiss,
  style,
  testID,
}: FlashbarProps) {
  const { tokens, type: typeScale, radii } = useTheme();
  const { bg, fg } = flashColors(type, tokens);
  const urgent = type === 'error' || type === 'warning';

  return (
    <View
      style={[styles.bar, { backgroundColor: bg, borderRadius: radii.flash }, style]}
      accessibilityRole={urgent ? 'alert' : 'summary'}
      accessibilityLiveRegion={urgent ? 'assertive' : 'polite'}
      testID={testID}
    >
      <View style={styles.icon}>
        <Icon name={icon ?? DEFAULT_ICON[type]} size={16} color={fg} />
      </View>
      <View style={styles.text}>
        {title ? <Text style={[typeScale.label, { color: fg }]}>{title}</Text> : null}
        {typeof message === 'string' ? (
          <Text style={[typeScale.body, { color: fg }]}>{message}</Text>
        ) : (
          message
        )}
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          android_ripple={ripple(fg, { alpha: 0.24, borderless: true, radius: hitTarget / 2 })}
          style={({ pressed }) => [styles.action, pressedStyle(pressed)]}
        >
          <Text style={[typeScale.label, styles.actionLabel, { color: fg }]}>{action.label}</Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          android_ripple={ripple(fg, { alpha: 0.24, borderless: true, radius: hitTarget / 2 })}
          style={({ pressed }) => [styles.dismiss, pressedStyle(pressed)]}
        >
          <Icon name="x" size={16} color={fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  icon: { paddingTop: 2 },
  text: { flex: 1, minWidth: 0 },
  // 44pt targets that overlap the bar's padding, centred on the first line.
  action: {
    minHeight: hitTarget,
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginVertical: -(hitTarget - 20) / 2,
  },
  actionLabel: { textDecorationLine: 'underline' },
  dismiss: {
    width: hitTarget,
    height: hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -(hitTarget - 20) / 2,
    // The glyph's edge, not the target's, sits on the bar's padding.
    marginRight: -(hitTarget - 16) / 2,
  },
});
