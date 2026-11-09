import React from 'react';
import { Alert, Linking } from 'react-native';
import { Button } from './ui';
import { useApp } from '../context/AppContext';

export function participantWebUrl(eventSlug: string, participantEventId: string): string {
  return `https://attend.hackclub.com/admin/events/${eventSlug}/participants/${participantEventId}`;
}

/**
 * The header's "View on attend.hackclub.com" action: an external-link icon
 * that opens the participant's admin page in the browser. It carries no
 * participant details, so it can sit outside the biometric gate.
 */
export function ParticipantWebLink({ participantEventId }: { participantEventId: string }) {
  const { state } = useApp();
  const slug = state.currentEvent?.slug;
  if (!slug) return null;

  const open = () => {
    Linking.openURL(participantWebUrl(slug, participantEventId)).catch(() => {
      Alert.alert('Error', 'Unable to open browser');
    });
  };

  return (
    <Button
      variant="plain-icon"
      icon="external-link"
      title="View on attend.hackclub.com"
      onPress={open}
    />
  );
}
