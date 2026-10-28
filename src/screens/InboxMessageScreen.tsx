import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../services/api';
import { RichText } from '../components/RichText';
import { Badge, Button, ErrorView, LoadingView, formatDateTime } from '../components/forms';
import { makeCardSurface } from '../components/ui';
import { CHANNEL_COLORS, CHANNEL_LABELS } from '../services/statusDisplay';
import { useThemedStyles, type Theme, type ThemeColors } from '../theme';
import type { InboxMessage, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'InboxMessage'>;
type Route = RouteProp<RootStackParamList, 'InboxMessage'>;

/** One organizer message. Opening it marks it read, as on the web. */
export function InboxMessageScreen() {
  const styles = useThemedStyles(makeStyles);
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
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{message.subject || `Message from ${message.event.name}`}</Text>
          <View style={styles.channels}>
            {message.channels.map(c => (
              <Badge key={c} label={CHANNEL_LABELS[c] ?? c} color={CHANNEL_COLORS[c]} />
            ))}
          </View>
          <Text style={styles.meta}>
            {message.event.name}
            {message.delivered_at ? ` · ${formatDateTime(message.delivered_at)}` : ''}
            {message.sender_name ? ` · From ${message.sender_name}` : ''}
          </Text>
        </View>
        <View style={styles.body}>
          <RichText html={message.body_html} size={16} />
        </View>
      </View>
      {message.ticket_id ? (
        <View style={styles.actions}>
          <Button title="View event" variant="primary" icon="ticket-outline" onPress={openTicket} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  card: { ...makeCardSurface(colors, theme), overflow: 'hidden' },
  header: {
    padding: 18,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
  },
  title: { fontSize: 21, fontWeight: '800', color: colors.gray[900] },
  channels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meta: { fontSize: 13, color: colors.gray[600] },
  body: { padding: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
