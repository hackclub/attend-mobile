import React, { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemedStyles, type Theme } from '../../theme';
import { Button } from './Button';

// Whole-pane loading, error and empty states for the stack screens.

export function LoadingView() {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={tokens.accent} />
    </View>
  );
}

export interface ErrorViewProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorView({ message, onRetry }: ErrorViewProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Couldn’t load this</Text>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? <Button title="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

export interface EmptyStateProps {
  title: string;
  message?: string;
  action?: ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.text}>{message}</Text> : null}
      {action}
    </View>
  );
}

const makeStyles = ({ tokens, type, spacing }: Theme) => StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    backgroundColor: tokens.bg,
  },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxxl },
  title: { ...type.h3, color: tokens.textH, textAlign: 'center' },
  text: { ...type.body, color: tokens.text2, textAlign: 'center' },
});
