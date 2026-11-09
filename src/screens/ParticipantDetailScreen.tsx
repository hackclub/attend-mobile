import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { BiometricGate } from '../components/BiometricGate';
import { Screen } from '../components/ui';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { useTheme } from '../theme';
import { ParticipantDetailContent } from './ParticipantDetailContent';
import { participantDetailTarget } from '../services/deepLinks';
import type { Participant, AppStackParamList } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'ParticipantDetail'>;

// Pushed with a participant from a list, or with just an id from the
// attend://participant/:id deep link. Either way the details sit behind the
// biometric gate (ParticipantDetailContent carries its own); a deep link is
// gated before the lookup too, so nothing is fetched for a locked device.
// The scaffold sits outside the gate, so the back link shows while it's locked;
// the participant's name is the page's heading, so it has no title.
export function ParticipantDetailScreen({ route }: Props) {
  // Deep link params are untyped strings, whatever the route type says.
  const target = participantDetailTarget<Participant>(route.params);

  return (
    <Screen scroll={false}>
      {'participant' in target ? (
        <PushedParticipantDetail participant={target.participant} />
      ) : (
        <BiometricGate>
          <ParticipantById id={target.id} />
        </BiometricGate>
      )}
    </Screen>
  );
}

/** The details below the scaffold's pinned back link, clear of the tab bar. */
function PushedParticipantDetail({ participant }: { participant: Participant }) {
  const { bottom } = useScreenInsets();
  return (
    <ParticipantDetailContent
      participant={participant}
      underHeader={false}
      topInset={0}
      bottomInset={bottom + 24}
      contentContainerStyle={styles.column}
    />
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
    return <PushedParticipantDetail participant={participant} />;
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
  // The scaffold's column, so the details line up with the back link.
  column: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
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
