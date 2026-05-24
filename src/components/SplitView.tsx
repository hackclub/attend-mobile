import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface SplitViewProps {
  sidebar: React.ReactNode;
  detail: React.ReactNode | null;
  sidebarWidth?: number;
  placeholder?: React.ReactNode;
}

export function SplitView({ sidebar, detail, sidebarWidth = 360, placeholder }: SplitViewProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.sidebar, { width: sidebarWidth }]}>{sidebar}</View>
      <View style={styles.detail}>
        {detail ?? placeholder ?? <DefaultPlaceholder />}
      </View>
    </View>
  );
}

function DefaultPlaceholder() {
  return (
    <View style={styles.placeholder}>
      <View style={styles.placeholderIcon}>
        <Ionicons name="person-outline" size={44} color={colors.gray[400]} />
      </View>
      <Text style={styles.placeholderTitle}>No participant selected</Text>
      <Text style={styles.placeholderText}>
        Select a participant from the list to view their details.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },
  sidebar: {
    borderRightWidth: 1,
    borderRightColor: colors.gray[200],
    backgroundColor: colors.background,
  },
  detail: {
    flex: 1,
    backgroundColor: colors.background,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  placeholderIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 6,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
});
