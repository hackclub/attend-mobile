import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemedStyles, useTheme, type ThemeColors } from '../theme';

interface StatusBadgeProps {
  status: 'checkedIn' | 'pending' | 'signed' | 'unsigned';
  label?: string;
}

const statusConfig = (colors: ThemeColors) => ({
  checkedIn: {
    backgroundColor: colors.green,
    label: 'Checked In',
  },
  pending: {
    backgroundColor: colors.gray[400],
    label: 'Not Checked In',
  },
  signed: {
    backgroundColor: colors.green,
    label: 'Signed',
  },
  unsigned: {
    backgroundColor: colors.orange,
    label: 'Not Signed',
  },
});

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const config = statusConfig(colors)[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.backgroundColor }]}>
      <Text style={styles.text}>{label ?? config.label}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  text: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
});
