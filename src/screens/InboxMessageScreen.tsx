import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../services/api';
import { RichText } from '../components/RichText';
import { ErrorView, LoadingView, formatDateTime } from '../components/forms';
import { Badge, Button, Container, Screen } from '../components/ui';
import { CHANNEL_LABELS } from '../services/statusDisplay';
import { spacing, useTheme } from '../theme';
import type { InboxMessage, AppStackParamList } from '../types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'InboxMessage'>;
type Route = RouteProp<AppStackParamList, 'InboxMessage'>;

/** One organizer message. Opening it marks it read, as on the web. */
export function InboxMessageScreen() {
  const { tokens, type } = useTheme();
  const navigation = useNavigation<Nav>();
  const { messageId } = useRoute<Route>().params;
  const [message, setMessage] = useState<InboxMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMessage(await api.getInboxMessage(messageId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, [messageId]);

  useEffect(() => {
    load();
  }, [load]);

  // The subject is the page's heading once the message has loaded.
  if (!message) {
    return (
      <Screen title="Message" scroll={false}>
        {error ? <ErrorView message={error} onRetry={load} /> : <LoadingView />}
      </Screen>
    );
  }

  const openTicket = async () => {
    if (!message.ticket_id) return;
    try {
      const ticket = await api.getMyTicket(message.ticket_id);
      navigation.navigate('TicketDetail', { ticket });
    } catch {
      navigation.navigate('MyTickets');
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[type.h1, { color: tokens.textH }]} accessibilityRole="header" selectable>
          {message.subject || `Message from ${message.event.name}`}
        </Text>
        {message.channels.length ? (
          <View style={styles.channels}>
            {message.channels.map(c => (
              <Badge key={c} label={CHANNEL_LABELS[c] ?? c} />
            ))}
          </View>
        ) : null}
        <Text style={[type.body, { color: tokens.muted }]}>
          {[
            message.event.name,
            message.delivered_at ? formatDateTime(message.delivered_at) : null,
            message.sender_name ? `From ${message.sender_name}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Container>
        <RichText html={message.body_html} size={16} />
      </Container>
      {message.ticket_id ? (
        <Button title="View event" variant="primary" icon="ticket" onPress={openTicket} fullWidth />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  channels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
