import React from 'react';
import { Alert, Platform, Share, StyleSheet, View } from 'react-native';
import { Button } from './ui';
import { useApp } from '../context/AppContext';
import { useOpenLink } from '../hooks/useOpenLink';

export function participantWebUrl(eventSlug: string, participantEventId: string): string {
  return `https://attend.hackclub.com/admin/events/${eventSlug}/participants/${participantEventId}`;
}

const browserError = () => Alert.alert('Error', 'Unable to open browser');

/**
 * The header's "View on attend.hackclub.com" and share actions: icons that
 * open the participant's admin page in the in-app browser, or hand its link
 * to the share sheet. The link carries no participant details, so it can sit
 * outside the biometric gate.
 */
export function ParticipantWebLink({ participantEventId }: { participantEventId: string }) {
  const { state } = useApp();
  const openLink = useOpenLink(browserError);
  const slug = state.currentEvent?.slug;
  if (!slug) return null;
  const url = participantWebUrl(slug, participantEventId);

  // iOS shares the URL itself (so it previews and offers "Copy"); Android's
  // share intent only takes text.
  const share = () => {
    void Share.share(Platform.OS === 'ios' ? { url } : { message: url }).catch(() => {});
  };

  return (
    <View style={styles.row}>
      <Button variant="plain-icon" icon="share" title="Share link" onPress={share} />
      <Button
        variant="plain-icon"
        icon="external-link"
        title="View on attend.hackclub.com"
        onPress={() => openLink(url)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
