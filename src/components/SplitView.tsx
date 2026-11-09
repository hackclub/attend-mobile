import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, useThemedStyles, type Theme } from '../theme';
import { Icon } from './ui/Icon';

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
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.placeholder}>
      <View style={styles.placeholderIcon}>
        <Icon name="user" size={44} color={tokens.disabled} />
      </View>
      <Text style={styles.placeholderTitle}>No participant selected</Text>
      <Text style={styles.placeholderText}>
        Select a participant from the list to view their details.
      </Text>
    </View>
  );
}

const makeStyles = ({ tokens, type, radii }: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: tokens.bg,
  },
  sidebar: {
    flexBasis: '36%',
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 300,
    borderRightWidth: 1,
    borderRightColor: tokens.div2,
    backgroundColor: tokens.bg,
  },
  detail: {
    flex: 1,
    backgroundColor: tokens.bg,
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
    borderRadius: radii.pill,
    backgroundColor: tokens.shaded,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  placeholderTitle: {
    ...type.h2,
    color: tokens.text2,
    marginBottom: 6,
  },
  placeholderText: {
    ...type.body,
    color: tokens.muted,
    textAlign: 'center',
    maxWidth: 280,
  },
});
