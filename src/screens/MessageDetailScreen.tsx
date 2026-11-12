import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { useFlash } from '../hooks/useFlash';
import { haptics } from '../services/haptics';
import { api } from '../services/api';
import { RichText } from '../components/RichText';
import {
  ActionMenu,
  Badge,
  Button,
  Container,
  ErrorView,
  Flashbar,
  KeyValue,
  LoadingView,
  type MenuAction,
  Screen,
  Stat,
  StatusIndicator,
} from '../components/ui';
import { formatDateTime, formatRelative } from '../components/forms';
import { MESSAGE_STATUS_BADGE, channelList, statusType } from '../components/messageStatus';
import { CHANNEL_LABELS, DELIVERY_STATUS_TONES, MESSAGE_STATUS_TONES, titleize } from '../services/statusDisplay';
import { spacing, useTheme } from '../theme';
import type { BroadcastMessage, AppStackParamList } from '../types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'MessageDetail'>;
type Route = RouteProp<AppStackParamList, 'MessageDetail'>;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function MessageDetailScreen() {
  const { tokens, type } = useTheme();
  const navigation = useNavigation<Nav>();
  const { messageId, notice } = useRoute<Route>().params;
  const { state } = useApp();
  const event = state.currentEvent;
  const [message, setMessage] = useState<BroadcastMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { flash, show: showFlash, dismiss: dismissFlash } = useFlash();

  // A notice handed over by the preview (sent or scheduled) shows once; the
  // preview already played the haptic.
  useEffect(() => {
    if (!notice) return;
    showFlash('success', notice, { silent: true });
    navigation.setParams({ notice: undefined });
  }, [notice, showFlash, navigation]);

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

  // The message's subject is the page's heading, so the scaffold has no title
  // once it has loaded.
  if (!event || !message) {
    return (
      <Screen title="Message" scroll={false}>
        {!event ? (
          <ErrorView message="Pick an event on the Overview tab first." />
        ) : error ? (
          <ErrorView message={error} onRetry={load} />
        ) : (
          <LoadingView />
        )}
      </Screen>
    );
  }

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
      if (result.notice) showFlash('success', result.notice);
      else haptics.success();
    } catch (e) {
      haptics.error();
      Alert.alert('Something went wrong', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const confirm = (
    title: string,
    body: string,
    onConfirm: () => void,
    destructive = false,
    dismissLabel = 'Cancel',
  ) => {
    if (destructive) haptics.warning();
    Alert.alert(title, body, [
      { text: dismissLabel, style: 'cancel' },
      { text: title, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  };

  const remove = () =>
    confirm(
      'Delete',
      'Delete this message? This cannot be undone.',
      async () => {
        setBusy('destroy');
        try {
          await api.deleteMessage(event.id, message.id);
          haptics.success();
          navigation.goBack();
        } catch (e) {
          haptics.error();
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

  const counters: { label: string; value: number }[] = [
    { label: 'Recipients', value: message.recipient_count },
    { label: 'Delivered', value: message.sent_count },
    ...(message.opened_count != null ? [{ label: 'Opened', value: message.opened_count }] : []),
    { label: 'Failed', value: message.failed_count },
    { label: 'Pending', value: message.pending_count },
  ];

  const menuActions: MenuAction[] = [
    ...(permissions.edit
      ? [{
        key: 'edit',
        title: 'Edit',
        iosIcon: 'pencil',
        onSelect: () => navigation.navigate('MessageCompose', { messageId: message.id }),
      }]
      : []),
    ...(permissions.retry_failed
      ? [{
        key: 'retry_failed',
        title: `Retry failed (${message.failed_count})`,
        iosIcon: 'arrow.clockwise',
        onSelect: () => void run('retry_failed'),
      }]
      : []),
    ...(permissions.send_to_new_recipients
      ? [{
        key: 'send_to_new_recipients',
        title: `Send to ${plural(message.new_recipient_count, 'new recipient')}`,
        iosIcon: 'paperplane',
        onSelect: () =>
          confirm(
            'Send',
            `Send this message to ${plural(message.new_recipient_count, 'new recipient')}? They match this audience now but haven't received it.`,
            () => run('send_to_new_recipients')
          ),
      }]
      : []),
    ...(permissions.cancel
      ? [{
        key: 'cancel',
        title: 'Cancel message',
        iosIcon: 'xmark.circle',
        destructive: true,
        onSelect: () =>
          confirm(
            'Cancel message',
            'Are you sure you want to cancel this scheduled message?',
            () => run('cancel'),
            true,
            'Keep',
          ),
      }]
      : []),
    ...(permissions.destroy
      ? [{ key: 'destroy', title: 'Delete', iosIcon: 'trash', destructive: true, onSelect: remove }]
      : []),
  ];

  // The message's other actions sit in a native ⋯ menu; while one runs, a
  // spinner stands in for it.
  const menu = busy ? (
    <View style={styles.menuBusy}>
      <ActivityIndicator color={tokens.muted} accessibilityLabel="Working" />
    </View>
  ) : menuActions.length ? (
    <ActionMenu accessibilityLabel="Message actions" actions={menuActions} />
  ) : undefined;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} action={menu}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text
            style={[type.h1, styles.flex, { color: message.subject ? tokens.textH : tokens.muted }]}
            accessibilityRole="header"
          >
            {message.subject || 'No subject'}
          </Text>
          {/* Centred on the title's first line, however tall the badge is. */}
          <View style={[styles.badgeSlot, { height: type.h1.lineHeight }]}>
            <Badge label={titleize(message.status)} color={MESSAGE_STATUS_BADGE[message.status] ?? 'grey'} />
          </View>
        </View>
        <Text style={[type.body, { color: tokens.muted }]}>{byline}</Text>
      </View>

      {flash ? <Flashbar type={flash.type} message={flash.message} onDismiss={dismissFlash} /> : null}

      {permissions.send_now ? (
        <View style={styles.actionRow}>
          <Button
            title={message.scheduled_at && new Date(message.scheduled_at) > new Date() ? 'Schedule' : 'Send now'}
            variant="primary"
            onPress={() => navigation.navigate('MessagePreview', { messageId: message.id })}
          />
        </View>
      ) : null}

      <Container title="Overview">
        <KeyValue
          label="Status"
          value={
            <StatusIndicator
              type={statusType(MESSAGE_STATUS_TONES[message.status])}
              label={titleize(message.status)}
            />
          }
        />
        <KeyValue label="Audience" value={message.audience_label} />
        <KeyValue label="Channels" value={channelList(message.channels)} />
        <View style={[styles.stats, { borderTopColor: tokens.div2 }]}>
          {counters.map(c => (
            <Stat key={c.label} label={c.label} value={c.value} style={styles.stat} />
          ))}
        </View>
      </Container>

      <Container title="Message content">
        {message.body_html ? (
          <RichText html={message.body_html} />
        ) : (
          <Text style={[type.body, { color: tokens.muted }]}>No content yet.</Text>
        )}
      </Container>

      <Container title="Delivery status" flush headerDivided>
        {message.recipients.length ? (
          message.recipients.map((recipient, i) => (
            <View
              key={recipient.id}
              style={[styles.recipient, i > 0 && { borderTopWidth: 1, borderTopColor: tokens.div2 }]}
            >
              <View style={styles.recipientHeader}>
                <Text style={[type.label, { color: tokens.textH }]}>{recipient.name}</Text>
                <Text style={[type.body, { color: tokens.muted }]}>
                  {recipient.kind === 'guardian' ? 'Guardian' : 'Attendee'}
                </Text>
                {recipient.catch_up ? <Badge label="Sent later" /> : null}
              </View>
              {recipient.deliveries.map(delivery => (
                <View key={delivery.id} style={styles.delivery}>
                  <View style={styles.deliveryRow}>
                    <Text style={[type.label, styles.channel, { color: tokens.text }]}>
                      {CHANNEL_LABELS[delivery.channel] ?? delivery.channel}
                    </Text>
                    <Text style={[type.body, styles.flex, { color: tokens.text2 }]} numberOfLines={1}>
                      {delivery.recipient_identifier ?? 'Hidden for your role'}
                    </Text>
                    <StatusIndicator
                      type={statusType(DELIVERY_STATUS_TONES[delivery.status])}
                      label={titleize(delivery.status)}
                    />
                  </View>
                  {delivery.error_message ? (
                    <Text style={[type.body, { color: tokens.error }]} numberOfLines={3}>
                      {delivery.error_message}
                    </Text>
                  ) : null}
                  {delivery.status === 'failed' ? (
                    <Button
                      title="Retry"
                      variant="link"
                      icon="refresh"
                      loading={busy === delivery.id}
                      onPress={() => run('retry_delivery', { delivery_id: delivery.id }, delivery.id)}
                      style={styles.retry}
                    />
                  ) : delivery.status === 'delivered' && delivery.delivered_at ? (
                    delivery.channel === 'email' && delivery.read_at ? (
                      <StatusIndicator type="success" label={`Opened ${formatRelative(delivery.read_at)}`} />
                    ) : (
                      <Text style={[type.body, { color: tokens.muted }]}>
                        Delivered {formatRelative(delivery.delivered_at)}
                      </Text>
                    )
                  ) : null}
                </View>
              ))}
            </View>
          ))
        ) : (
          <View style={styles.recipient}>
            <Text style={[type.label, { color: tokens.textH }]}>No deliveries yet</Text>
            <Text style={[type.body, { color: tokens.muted }]}>Send the message to see delivery status.</Text>
          </View>
        )}
      </Container>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  header: { gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  badgeSlot: { justifyContent: 'center' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  menuBusy: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
  },
  stat: { flexBasis: '33%', flexGrow: 0 },
  recipient: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: 14 },
  recipientHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  delivery: { gap: spacing.xs },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  channel: { minWidth: 48 },
  retry: { alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 32 },
});
