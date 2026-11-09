import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { eventStatus, formatEventMoment, type EventPhase } from '../services/eventStatus';
import { useTheme } from '../theme';
import { Container, Icon, type IconName } from './ui';
import type { Event } from '../types';

const PHASE_ICON: Record<EventPhase, IconName> = {
  upcoming: 'calendar',
  live: 'check-circle',
  ended: 'calendar',
};

interface EventStatusCardProps {
  event: Event;
  checkedIn?: boolean;
  /** When "now" is, so the screen can refresh it when it comes back into view. */
  now?: Date;
  /** Under the times, e.g. a directions button. */
  footer?: ReactNode;
}

/**
 * Where the event stands (upcoming, running, ended) with a day count, and
 * its start and end in the event's own timezone.
 */
export function EventStatusCard({ event, checkedIn, now, footer }: EventStatusCardProps) {
  const { tokens, type, spacing } = useTheme();
  const status = eventStatus(event, { now, checkedIn });
  const starts = formatEventMoment(event.starts_at, event.timezone);
  const ends = formatEventMoment(event.ends_at, event.timezone);
  if (!status && !starts) return null;

  const accent = status?.phase === 'live' ? tokens.success : tokens.accent;

  return (
    <Container bodyStyle={{ gap: spacing.md }}>
      {status ? (
        <View style={{ gap: spacing.xs }}>
          <View style={styles.titleRow}>
            <Icon name={PHASE_ICON[status.phase]} size={18} color={accent} />
            <Text style={[type.label, { color: accent }]} accessibilityRole="header">
              {status.title}
            </Text>
          </View>
          <Text style={[type.h2, { color: tokens.textH }]}>{status.headline}</Text>
        </View>
      ) : null}
      <View style={{ gap: spacing.xs }}>
        {starts ? <TimeRow label="Starts" value={starts} /> : null}
        {ends ? <TimeRow label="Ends" value={ends} /> : null}
      </View>
      {footer}
    </Container>
  );
}

function TimeRow({ label, value }: { label: string; value: string }) {
  const { tokens, type } = useTheme();
  return (
    <View style={styles.timeRow} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={[type.body, styles.timeLabel, { color: tokens.muted }]}>{label}</Text>
      <Text style={[type.body, styles.timeValue, { color: tokens.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeLabel: { width: 52 },
  timeValue: { flex: 1 },
});
