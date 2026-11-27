import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useEventAccess } from '../hooks/useEventAccess';
import { useTheme } from '../theme';
import { Icon } from './ui';

/** "Your role (Ops) can't see this", or without a known role, "Your role can't see this". */
export function roleRestrictedMessage(roleLabel: string | null): string {
  return roleLabel ? `Your role (${roleLabel}) can't see this` : "Your role can't see this";
}

/**
 * Stands in for something the user's role on this event can't see, so the
 * screen keeps its shape instead of silently dropping a section or tab.
 */
export function RoleRestricted({
  fill = false,
  style,
}: {
  /** Centre in the available space, for a whole tab. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens, type } = useTheme();
  const { roleLabel } = useEventAccess();
  const message = roleRestrictedMessage(roleLabel);

  return (
    <View
      style={[styles.row, fill && [styles.fill, { backgroundColor: tokens.bg }], style]}
      accessible
      accessibilityLabel={message}
    >
      <Icon name="lock-closed" size={16} color={tokens.muted} />
      <Text style={[type.body, { color: tokens.text2 }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fill: { flex: 1, justifyContent: 'center', padding: 24 },
});
