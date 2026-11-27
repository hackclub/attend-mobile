import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemedStyles, type Theme } from '../../theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';

// Whole-pane loading, error and empty states for the stack screens. They
// take the background of the screen they sit in.

/** The label of every button that retries a failed load. */
export const RETRY_LABEL = 'Try again';

export function LoadingView() {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center}>
      <Spinner size="large" color={tokens.accent} />
    </View>
  );
}

export interface ErrorViewProps {
  /** Defaults to "Couldn’t load this". */
  title?: string;
  message: string;
  onRetry?: () => void;
}

// Buttons sit at the start of their row by default; these views centre them.
const centredButton = { alignSelf: 'center' } as const;

export function ErrorView({ title = 'Couldn’t load this', message, onRetry }: ErrorViewProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? <Button title={RETRY_LABEL} onPress={onRetry} style={centredButton} /> : null}
    </View>
  );
}

export interface EmptyStateProps {
  /** A muted glyph above the title. */
  icon?: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.empty}>
      {icon ? <Icon name={icon} size={32} color={tokens.muted} /> : null}
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
  },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxxl },
  title: { ...type.h3, color: tokens.textH, textAlign: 'center' },
  text: { ...type.body, color: tokens.text2, textAlign: 'center' },
});
