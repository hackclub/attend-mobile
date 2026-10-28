import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';

interface SplitViewProps {
  sidebar: React.ReactNode;
  detail: React.ReactNode | null;
  /** Upper bound only — the sidebar is sized against its container. */
  sidebarWidth?: number;
  placeholder?: React.ReactNode;
}

/**
 * The sidebar takes a share of whatever the container gives it rather than a
 * fixed 360pt, so it still leaves a usable detail pane on iPhone Duo's inner
 * display, which is a good deal narrower than an iPad in landscape.
 */
export function SplitView({ sidebar, detail, sidebarWidth = 360, placeholder }: SplitViewProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <View style={[styles.sidebar, { maxWidth: sidebarWidth }]}>{sidebar}</View>
      <View style={styles.detail}>
        {detail ?? placeholder ?? <DefaultPlaceholder />}
      </View>
    </View>
  );
}

function DefaultPlaceholder() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },
  sidebar: {
    flexBasis: '36%',
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 300,
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
