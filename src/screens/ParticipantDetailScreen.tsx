import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { BiometricGate } from '../components/BiometricGate';
import { useTheme } from '../theme';
import { ParticipantDetailContent } from './ParticipantDetailContent';
import { participantDetailTarget } from '../services/deepLinks';
import type { Participant, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ParticipantDetail'>;

// Pushed with a participant from a list, or with just an id from the
// attend://participant/:id deep link. Either way the details sit behind the
// biometric gate (ParticipantDetailContent carries its own); a deep link is
// gated before the lookup too, so nothing is fetched for a locked device.
export function ParticipantDetailScreen({ route }: Props) {
  const { tokens } = useTheme();
  // Deep link params are untyped strings, whatever the route type says.
  const target = participantDetailTarget<Participant>(route.params);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['bottom']}>
      {'participant' in target ? (
        <ParticipantDetailContent participant={target.participant} />
      ) : (
        <BiometricGate topInset={100}>
          <ParticipantById id={target.id} />
        </BiometricGate>
      )}
    </SafeAreaView>
  );
}

function ParticipantById({ id }: { id: string | undefined }) {
  const { tokens, type } = useTheme();
  const { state } = useApp();
  const eventId = state.currentEvent?.id;
  const cached = id
    ? state.participants.find((p) => p.participant_event_id === id || p.participant_id === id)
    : undefined;
  const [fetched, setFetched] = useState<Participant | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached || !id || !eventId) return;
    let cancelled = false;
    api.getParticipant(eventId, id)
      .then((participant) => {
        if (!cancelled) setFetched(participant);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this participant.");
      });
    return () => {
      cancelled = true;
    };
  }, [cached, id, eventId]);

  const participant = cached ?? fetched;
  if (participant) {
    return <ParticipantDetailContent participant={participant} />;
  }

  const message = !id
    ? 'This link doesn’t name a participant.'
    : !eventId
      ? 'Choose an event first, then open the link again.'
      : error;

  return (
    <View style={styles.centered}>
      {message ? (
        <Text style={[type.body, styles.message, { color: tokens.text2 }]}>{message}</Text>
      ) : (
        <ActivityIndicator size="large" color={tokens.accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  message: {
    textAlign: 'center',
  },
});
