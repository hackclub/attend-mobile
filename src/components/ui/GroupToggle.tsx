import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptics } from '../../services/haptics';
import { useTheme } from '../../theme';
import { Icon } from './Icon';
import { pressedStyle, ripple, STATE_LAYER_ALPHA } from './pressFeedback';

export interface GroupToggleProps {
  /** The group's name, e.g. "Past" or "Closed". */
  label: string;
  count: number;
  open: boolean;
  /** Leave out to show the label only, e.g. while a search shows every match. */
  onToggle?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** "Past (3)": a collapsible group's label, with its count. */
export const groupToggleTitle = (label: string, count: number) => `${label} (${count})`;

/**
 * A collapsible group's section label, "Past (3) ⌄", that opens and closes
 * the group below it: the chevron points up while it's open. It sits where
 * the group's label would, in the label style.
 */
export function GroupToggle({ label, count, open, onToggle, style }: GroupToggleProps) {
  const { tokens, type } = useTheme();
  const title = groupToggleTitle(label, count);
  const text = (
    <Text style={[type.label, { color: tokens.text2 }]} numberOfLines={1}>
      {title}
    </Text>
  );
  if (!onToggle) {
    return (
      <View style={[styles.toggle, style]} accessibilityRole="header">
        {text}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptics.toggle(!open);
        onToggle();
      }}
      hitSlop={8}
      android_ripple={ripple(tokens.text, { alpha: STATE_LAYER_ALPHA })}
      style={({ pressed }) => [styles.toggle, styles.pressable, style, pressedStyle(pressed)]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: open }}
    >
      {text}
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={tokens.text2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // A 44pt target around a label-sized line, without moving the label.
  pressable: { minHeight: 32, marginVertical: -6, paddingRight: 4, borderRadius: 8 },
});
