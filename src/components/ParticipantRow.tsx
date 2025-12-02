import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { StatusBadge } from './StatusBadge';
import { AlertBadge } from './AlertBadge';
import type { Participant } from '../types';

interface ParticipantRowProps {
  participant: Participant;
  onPress: () => void;
}

export function ParticipantRow({ participant, onPress }: ParticipantRowProps) {
  const hasAlerts = participant.has_anaphylaxis_risk || participant.high_support_flag;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.content}>
        <View style={styles.mainInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {participant.display_name}
          </Text>
          {participant.pronouns && (
            <Text style={styles.pronouns}>({participant.pronouns})</Text>
          )}
        </View>

        <Text style={styles.email} numberOfLines={1}>
          {participant.email}
        </Text>

        {hasAlerts && (
          <View style={styles.alerts}>
            {participant.has_anaphylaxis_risk && (
              <AlertBadge type="anaphylaxis" label="Anaphylaxis" compact />
            )}
            {participant.high_support_flag && (
              <AlertBadge type="highSupport" label="High Support" compact />
            )}
          </View>
        )}
      </View>

      <View style={styles.status}>
        <StatusBadge status={participant.checked_in_at ? 'checkedIn' : 'pending'} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.glass.dark,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  content: {
    flex: 1,
    marginRight: 12,
  },
  mainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  pronouns: {
    fontSize: 14,
    color: colors.text.secondary,
    marginLeft: 6,
  },
  email: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  alerts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  status: {
    alignItems: 'flex-end',
  },
});
