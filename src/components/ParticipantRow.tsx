import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Avatar, Badge, PressableSurface, ROW_STATE_LAYER_ALPHA, type BadgeColor } from './ui';
import { isWithdrawn } from '../services/participantStatus';
import { participantDetailLine } from '../services/participantCheckIn';
import type { Participant } from '../types';

interface ParticipantRowProps {
  participant: Participant;
  /** Called with the row's participant, so a list can pass one stable callback. */
  onPress: (participant: Participant) => void;
  selected?: boolean;
  /** Position in the list, so the rows draw one bordered container between them. */
  first?: boolean;
  last?: boolean;
}

export function participantBadges(participant: Participant): { label: string; color: BadgeColor }[] {
  const badges: { label: string; color: BadgeColor }[] = [
    isWithdrawn(participant)
      ? { label: 'Withdrawn', color: 'red' }
      : participant.checked_in_at
        ? { label: 'Checked in', color: 'green' }
        : { label: 'Not checked in', color: 'grey' },
  ];
  if (participant.has_anaphylaxis_risk) badges.push({ label: 'Anaphylaxis', color: 'red' });
  if (participant.high_support_flag) badges.push({ label: 'High support', color: 'yellow' });
  return badges;
}

// Memoised: the People list re-renders on every keystroke and selection, and
// only the rows whose props changed need to.
export const ParticipantRow = React.memo(function ParticipantRow({
  participant,
  onPress,
  selected = false,
  first = false,
  last = false,
}: ParticipantRowProps) {
  const { tokens, type, radii } = useTheme();
  const name = participant.display_name || participant.full_name;
  const detail = participantDetailLine(participant);
  const badges = participantBadges(participant);

  return (
    <PressableSurface
      onPress={() => onPress(participant)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[name, participant.pronouns, detail, ...badges.map((b) => b.label)]
        .filter(Boolean)
        .join(', ')}
      rippleColor={tokens.text}
      rippleAlpha={ROW_STATE_LAYER_ALPHA}
      pressedOpacity={null}
      style={(pressed) => [
        styles.shape,
        {
          borderColor: tokens.box,
          backgroundColor: selected ? tokens.selected : tokens.bg,
          borderTopColor: first ? tokens.box : tokens.div2,
        },
        first && { borderTopLeftRadius: radii.container, borderTopRightRadius: radii.container },
        last && styles.last,
        last && { borderBottomLeftRadius: radii.container, borderBottomRightRadius: radii.container },
        pressed && !selected && { backgroundColor: tokens.shaded },
      ]}
      contentStyle={styles.row}
    >
      <Avatar name={name} uri={participant.headshot_url} size={36} decorative />
      <View style={styles.text}>
        <Text style={[type.body, { color: tokens.muted }]} numberOfLines={1}>
          <Text style={[type.label, { color: tokens.textH }]}>{name}</Text>
          {participant.pronouns ? ` ${participant.pronouns}` : ''}
        </Text>
        <Text style={[type.body, { color: tokens.text2 }]} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <View style={styles.badges}>
        {badges.map((badge) => (
          <Badge key={badge.label} label={badge.label} color={badge.color} style={styles.badge} />
        ))}
      </View>
    </PressableSurface>
  );
});

const styles = StyleSheet.create({
  shape: {
    marginHorizontal: 16,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    // 56 including the 1px top border.
    minHeight: 55,
  },
  last: { borderBottomWidth: 1 },
  text: { flex: 1, minWidth: 0 },
  badges: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  badge: { alignSelf: 'flex-end' },
});
