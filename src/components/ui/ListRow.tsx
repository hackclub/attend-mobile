import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { haptics } from '../../services/haptics';
import { Icon, type IconName } from './Icon';
import { isAndroid, ripple, ROW_STATE_LAYER_ALPHA } from './pressFeedback';
import { Toggle } from './Toggle';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading slot: an Avatar, StatusGlyph or icon. `icon` is a shorthand. */
  leading?: ReactNode;
  icon?: IconName;
  /** Trailing slot: a Badge or Button. For a switch use `toggle`. */
  trailing?: ReactNode;
  /** A trailing switch; the whole row is then the control. */
  toggle?: { value: boolean; onValueChange: (next: boolean) => void };
  /** Muted trailing text, e.g. a version number or count. */
  value?: string;
  onPress?: () => void;
  /**
   * Show a disclosure chevron (iOS only: Material rows have none). Defaults
   * to true when the row is pressable without `trailing`.
   */
  chevron?: boolean;
  /** Use an external-link glyph instead of a chevron. */
  external?: boolean;
  /** Hairline under the row; turn off on the last row of a Container. */
  divider?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A settings / list row: padding 14×20, hairline separator. */
export function ListRow({
  title,
  subtitle,
  leading,
  icon,
  trailing,
  toggle,
  value,
  onPress,
  chevron,
  external = false,
  divider = true,
  destructive = false,
  disabled = false,
  accessibilityHint,
  style,
  testID,
}: ListRowProps) {
  const { tokens, type } = useTheme();
  const showChevron = !isAndroid && !toggle && (chevron ?? (Boolean(onPress) && !trailing));
  const titleColor = destructive ? tokens.error : subtitle ? tokens.textH : tokens.text;

  const content = (
    <>
      {leading ?? (icon ? <Icon name={icon} size={20} color={destructive ? tokens.error : tokens.text2} /> : null)}
      <View style={styles.text} pointerEvents="none">
        <Text style={[subtitle ? type.label : type.body, { color: titleColor }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={[type.body, { color: tokens.text2 }]}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={[type.body, { color: tokens.muted }]}>{value}</Text> : null}
      {trailing}
      {toggle ? (
        <Toggle
          value={toggle.value}
          onValueChange={toggle.onValueChange}
          disabled={disabled}
          accessibilityLabel={title}
          decorative
        />
      ) : null}
      {showChevron || external ? (
        <Icon name={external ? 'external-link' : 'chevron-right'} size={16} color={tokens.muted} />
      ) : null}
    </>
  );

  const rowStyle = [
    styles.row,
    divider && { borderBottomWidth: 1, borderBottomColor: tokens.div2 },
    disabled && styles.disabled,
  ];

  if (toggle) {
    return (
      <Pressable
        onPress={() => {
          // The same feedback as tapping the switch itself.
          const next = !toggle.value;
          haptics.toggle(next);
          toggle.onValueChange(next);
        }}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ checked: toggle.value, disabled }}
        android_ripple={ripple(tokens.text, { alpha: ROW_STATE_LAYER_ALPHA })}
        style={({ pressed }) => [rowStyle, !isAndroid && pressed && { backgroundColor: tokens.shaded }, style]}
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

  if (!onPress) {
    return (
      <View style={[rowStyle, style]} accessible={!trailing} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      android_ripple={ripple(tokens.text, { alpha: ROW_STATE_LAYER_ALPHA })}
      // iOS highlights the row like a table cell; Android ripples.
      style={({ pressed }) => [rowStyle, !isAndroid && pressed && { backgroundColor: tokens.shaded }, style]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 48,
  },
  text: { flex: 1, flexShrink: 1, minWidth: 0 },
  disabled: { opacity: 0.5 },
});
