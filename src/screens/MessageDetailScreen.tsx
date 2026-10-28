import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { RichText } from '../components/RichText';
import {
  Badge,
  Button,
  EmptyState,
  ErrorView,
  KeyValue,
  LoadingView,
  Section,
  StatusPill,
  formatDateTime,
  formatRelative,
} from '../components/forms';
import {
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  DELIVERY_STATUS_TONES,
  MESSAGE_STATUS_TONES,
  titleize,
} from '../services/statusDisplay';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { BroadcastMessage, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'MessageDetail'>;
type Route = RouteProp<RootStackParamList, 'MessageDetail'>;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function MessageDetailScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const { messageId } = useRoute<Route>().params;
  const { state } = useApp();
  const event = state.currentEvent;
  const [message, setMessage] = useState<BroadcastMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!event) return;
    try {
      setMessage(await api.getMessage(event.id, messageId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, [event, messageId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: 'Message' });
  }, [navigation]);

  if (!event) return <ErrorView message="Pick an event on the Events tab first." />;
  if (error && !message) return <ErrorView message={error} onRetry={load} />;
  if (!message) return <LoadingView />;

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  type Action = Parameters<typeof api.messageAction>[2];
  const run = async (action: Action, params: Record<string, string> = {}, key: string = action) => {
    setBusy(key);
    try {
      const result = await api.messageAction(event.id, message.id, action, params);
      setMessage(result.record);
      if (result.notice) Alert.alert(result.notice);
    } catch (e) {
      Alert.alert('Something went wrong', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const confirm = (title: string, body: string, onConfirm: () => void, destructive = false) =>
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: title, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);

  const remove = () =>
    confirm(
      'Delete',
      'Delete this message? This cannot be undone.',
      async () => {
        setBusy('destroy');
        try {
          await api.deleteMessage(event.id, message.id);
          navigation.goBack();
        } catch (e) {
          Alert.alert('Not deleted', e instanceof Error ? e.message : 'Please try again.');
          setBusy(null);
        }
      },
      true
    );

  const { permissions } = message;
  const byline = message.sent_at
    ? `Sent ${formatRelative(message.sent_at)} by ${message.sent_by ?? 'someone'}`
    : message.scheduled_at
      ? `Scheduled for ${formatDateTime(message.scheduled_at)} by ${message.sent_by ?? 'someone'}`
      : `Sent by ${message.sent_by ?? 'someone'} · Draft`;

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.text.accent} />}
    >
      <View style={styles.header}>
        <Text style={[styles.title, !message.subject && styles.muted]}>{message.subject || 'No subject'}</Text>
        <Text style={styles.byline}>{byline}</Text>
      </View>

      <View style={styles.actionRow}>
        {permissions.send_now ? (
          <Button
            title={message.scheduled_at && new Date(message.scheduled_at) > new Date() ? 'Schedule' : 'Send now'}
            variant="primary"
            onPress={() => navigation.navigate('MessagePreview', { messageId: message.id })}
          />
        ) : null}
        {permissions.edit ? (
          <Button title="Edit" onPress={() => navigation.navigate('MessageCompose', { messageId: message.id })} />
        ) : null}
        {permissions.cancel ? (
          <Button
            title="Cancel"
            loading={busy === 'cancel'}
            onPress={() => confirm('Cancel', 'Are you sure you want to cancel this scheduled message?', () => run('cancel'))}
          />
        ) : null}
        {permissions.retry_failed ? (
          <Button
            title={`Retry failed (${message.failed_count})`}
            loading={busy === 'retry_failed'}
            onPress={() => run('retry_failed')}
          />
        ) : null}
        {permissions.send_to_new_recipients ? (
          <Button
            title={`Send to ${plural(message.new_recipient_count, 'new recipient')}`}
            loading={busy === 'send_to_new_recipients'}
            onPress={() =>
              confirm(
                'Send',
                `Send this message to ${plural(message.new_recipient_count, 'new recipient')}? They match this audience now but haven't received it.`,
                () => run('send_to_new_recipients')
              )
            }
          />
        ) : null}
        {permissions.destroy ? (
          <Button title="Delete" variant="destructive" loading={busy === 'destroy'} onPress={remove} />
        ) : null}
      </View>

      <Section title="Overview">
        <View style={styles.kvRow}>
          <KeyValue label="Status">
            <StatusPill tone={MESSAGE_STATUS_TONES[message.status] ?? 'info'} label={titleize(message.status)} />
          </KeyValue>
          <KeyValue label="Audience">{message.audience_label}</KeyValue>
        </View>
        <KeyValue label="Channels">
          <View style={styles.tokens}>
            {message.channels.map(c => (
              <Badge key={c} label={CHANNEL_LABELS[c] ?? c} color={CHANNEL_COLORS[c]} />
            ))}
          </View>
        </KeyValue>
        <View style={styles.counters}>
          <Counter label="Recipients" value={message.recipient_count} />
          <Counter label="Delivered" value={message.sent_count} />
          {message.opened_count != null ? <Counter label="Opened" value={message.opened_count} /> : null}
          <Counter label="Failed" value={message.failed_count} />
          <Counter label="Pending" value={message.pending_count} />
        </View>
      </Section>

      <Section title="Message content">
        {message.body_html ? <RichText html={message.body_html} /> : <Text style={styles.muted}>No content yet.</Text>}
      </Section>

      <Section title="Delivery status">
        {message.recipients.length ? (
          message.recipients.map((recipient, i) => (
            <View key={recipient.id} style={[styles.recipient, i > 0 && styles.divider]}>
              <View style={styles.recipientHeader}>
                <Text style={styles.bold}>{recipient.name}</Text>
                <Text style={styles.muted}>{recipient.kind === 'guardian' ? 'Guardian' : 'Attendee'}</Text>
                {recipient.catch_up ? <Badge label="Sent later" /> : null}
              </View>
              {recipient.deliveries.map(delivery => (
                <View key={delivery.id} style={styles.delivery}>
                  <View style={styles.deliveryRow}>
                    <Badge label={CHANNEL_LABELS[delivery.channel] ?? delivery.channel} color={CHANNEL_COLORS[delivery.channel]} />
                    <Text style={[styles.identifier, styles.flex]} numberOfLines={1}>
                      {delivery.recipient_identifier ?? 'Hidden for your role'}
                    </Text>
                    <StatusPill tone={DELIVERY_STATUS_TONES[delivery.status] ?? 'info'} label={titleize(delivery.status)} />
                  </View>
                  {delivery.error_message ? (
                    <Text style={styles.error} numberOfLines={3}>{delivery.error_message}</Text>
                  ) : null}
                  {delivery.status === 'failed' ? (
                    <Button
                      title="Retry"
                      variant="link"
                      loading={busy === delivery.id}
                      onPress={() => run('retry_delivery', { delivery_id: delivery.id }, delivery.id)}
                    />
                  ) : delivery.status === 'delivered' && delivery.delivered_at ? (
                    delivery.channel === 'email' && delivery.read_at ? (
                      <StatusPill tone="success" label={`Opened ${formatRelative(delivery.read_at)}`} />
                    ) : (
                      <Text style={styles.muted}>Delivered {formatRelative(delivery.delivered_at)}</Text>
                    )
                  ) : null}
                </View>
              ))}
            </View>
          ))
        ) : (
          <EmptyState title="No deliveries yet" message="Send the message to see delivery status." />
        )}
      </Section>
    </ScrollView>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.counter}>
      <Text style={styles.counterLabel}>{label}</Text>
      <Text style={styles.counterValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },
  header: { paddingHorizontal: 16, paddingTop: 10, gap: 4 },
  title: { fontSize: 22, fontWeight: '800', color: colors.gray[900] },
  byline: { fontSize: 14, color: colors.gray[600] },
  muted: { fontSize: 13, color: colors.gray[500] },
  bold: { fontSize: 15, fontWeight: '700', color: colors.gray[900] },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  kvRow: { flexDirection: 'row', gap: 24 },
  tokens: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  counters: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  counter: { gap: 2, minWidth: 70 },
  counterLabel: { fontSize: 12, fontWeight: '600', color: colors.gray[500], textTransform: 'uppercase' },
  counterValue: { fontSize: 22, fontWeight: '800', color: colors.gray[900] },
  recipient: { gap: 8, paddingTop: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  recipientHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  delivery: { gap: 4, paddingLeft: 4 },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identifier: { fontSize: 13, color: colors.gray[700] },
  error: { fontSize: 13, color: colors.status.error },
});
