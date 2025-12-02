import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface AlertBadgeProps {
  type: 'anaphylaxis' | 'highSupport' | 'medical' | 'warning';
  label: string;
  compact?: boolean;
}

export function AlertBadge({ type, label, compact = false }: AlertBadgeProps) {
  const backgroundColor = {
    anaphylaxis: colors.alert.anaphylaxis,
    highSupport: colors.alert.highSupport,
    medical: colors.alert.medical,
    warning: colors.orange,
  }[type];

  return (
    <View style={[styles.badge, { backgroundColor }, compact && styles.compact]}>
      <Text style={[styles.text, compact && styles.compactText]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  compact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 4,
    marginBottom: 4,
  },
  text: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  compactText: {
    fontSize: 12,
  },
});
