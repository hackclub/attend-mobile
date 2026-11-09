import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../services/api';
import { RichText } from '../components/RichText';
import { ErrorView, LoadingView, formatDateTime } from '../components/forms';
import { Badge, Button, Container } from '../components/ui';
import { CHANNEL_LABELS } from '../services/statusDisplay';
import { spacing, useTheme } from '../theme';
import type { InboxMessage, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'InboxMessage'>;
type Route = RouteProp<RootStackParamList, 'InboxMessage'>;

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

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: message?.event.name ?? 'Message' });
  }, [navigation, message]);

  if (error && !message) return <ErrorView message={error} onRetry={load} />;
  if (!message) return <LoadingView />;

  const openTicket = async () => {
    if (!message.ticket_id) return;
    try {
      const ticket = await api.getMyTicket(message.ticket_id);
      navigation.navigate('TicketDetail', { ticket });
    } catch {
      navigation.navigate('ParticipantMain');
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl + spacing.sm, gap: spacing.lg },
  header: { gap: spacing.sm },
  channels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
