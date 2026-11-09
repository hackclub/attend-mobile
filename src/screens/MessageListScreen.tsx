import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  Badge,
  Button,
  EmptyState,
  ErrorView,
  Icon,
  isAndroid,
  LoadingView,
  ripple,
  ROW_STATE_LAYER_ALPHA,
  Screen,
  SegmentedControl,
} from '../components/ui';
import { MESSAGE_STATUS_BADGE, channelList } from '../components/messageStatus';
import { formatDateTime } from '../components/forms';
import { titleize } from '../services/statusDisplay';
import { spacing, useTheme } from '../theme';
import type { MessageSummary, AppStackParamList } from '../types';
import { useScreenInsets } from '../hooks/useScreenInsets';

type Nav = NativeStackNavigationProp<AppStackParamList, 'MessageList'>;
type Filter = 'all' | 'draft' | 'scheduled';

function timeLine(m: MessageSummary): string {
  const when = m.sent_at
    ? `Sent ${formatDateTime(m.sent_at)} · ${m.sent_count}/${m.recipient_count} delivered`
    : m.scheduled_at
      ? `Scheduled for ${formatDateTime(m.scheduled_at)}`
      : `Created ${formatDateTime(m.created_at)}`;
  return m.sent_by ? `${when} · ${m.sent_by}` : when;
}

export function MessageListScreen() {
  const insets = useScreenInsets();
  const { tokens, type, radii } = useTheme();
  const navigation = useNavigation<Nav>();
  const { state } = useApp();
  const event = state.currentEvent;
  const [messages, setMessages] = useState<MessageSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!event) return;
    try {
      setMessages(await api.getMessages(event.id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, [event]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const shown = useMemo(
    () => (messages ?? []).filter(m => filter === 'all' || m.status === filter),
    [messages, filter]
  );

  if (!event) {
    return (
      <Screen title="Messages">
        <EmptyState title="No event selected" message="Pick an event on the Overview tab first." />
      </Screen>
    );
  }
  if (error && !messages) {
    return (
      <Screen title="Messages" scroll={false}>
        <ErrorView message={error} onRetry={load} />
      </Screen>
    );
  }
  if (!messages) {
    return (
      <Screen title="Messages" scroll={false}>
        <LoadingView />
      </Screen>
    );
  }

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const compose = () => navigation.navigate('MessageCompose', {});
  // Every message opens its page; a draft's page offers Edit and Send.
  const open = (message: MessageSummary) => navigation.navigate('MessageDetail', { messageId: message.id });

  const drafts = messages.filter(m => m.status === 'draft').length;
  const scheduled = messages.filter(m => m.status === 'scheduled').length;

  return (
    <Screen
      title="Messages"
      scroll={false}
      action={
        // An empty list offers Compose in its empty state instead.
        messages.length > 0 ? (
          <Button title="Compose message" variant="primary" icon="plus" onPress={compose} />
        ) : undefined
      }
    >
      <FlatList
        style={{ flex: 1, backgroundColor: tokens.bg }}
        data={shown}
        keyExtractor={m => m.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressBackgroundColor={tokens.bg}
          />
        }
        ListHeaderComponent={
          messages.length > 0 ? (
            <View style={styles.header}>
              <SegmentedControl
                accessibilityLabel="Filter messages"
                role="tab"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'draft', label: `Drafts · ${drafts}` },
                  { value: 'scheduled', label: `Scheduled · ${scheduled}` },
                ]}
              />
            </View>
          ) : undefined
        }
        renderItem={({ item, index }) => {
          const first = index === 0;
          const last = index === shown.length - 1;
          return (
            <View
              style={[
                styles.cardSlice,
                { backgroundColor: tokens.bg, borderColor: tokens.box },
                first && { borderTopWidth: 1, borderTopLeftRadius: radii.container, borderTopRightRadius: radii.container },
                last && { borderBottomWidth: 1, borderBottomLeftRadius: radii.container, borderBottomRightRadius: radii.container },
              ]}
            >
              <Pressable
                onPress={() => open(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.subject || 'No subject'}, ${titleize(item.status)}`}
                android_ripple={ripple(tokens.text, { alpha: ROW_STATE_LAYER_ALPHA })}
                style={({ pressed }) => [
                  styles.row,
                  !first && { borderTopWidth: 1, borderTopColor: tokens.div2 },
                  !isAndroid && pressed && { backgroundColor: tokens.shaded },
                ]}
              >
                <View style={styles.titleRow}>
                  <Text
                    style={[type.h3, styles.subject, { color: item.subject ? tokens.textH : tokens.muted }]}
                    numberOfLines={1}
                  >
                    {item.subject || 'No subject'}
                  </Text>
                  <Badge label={titleize(item.status)} color={MESSAGE_STATUS_BADGE[item.status] ?? 'grey'} />
                </View>
                {item.preview_text ? (
                  <Text style={[type.body, { color: tokens.text2 }]} numberOfLines={2}>
                    {item.preview_text}
                  </Text>
                ) : null}
                <Text style={[type.body, { color: tokens.muted }]}>
                  {[item.audience_label, channelList(item.channels)].filter(Boolean).join(' · ')}
                </Text>
                <Text style={[type.body, { color: tokens.muted }]}>{timeLine(item)}</Text>
                {item.failed_count ? (
                  <View style={styles.failed}>
                    <Icon name="exclamation-circle" size={16} color={tokens.error} />
                    <Text style={[type.body, { color: tokens.error }]}>{item.failed_count} failed</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          messages.length === 0 ? (
            <EmptyState
              title="No messages yet"
              message="Send email, SMS, Slack and push messages to this event's attendees and guardians."
              action={<Button title="Compose message" variant="primary" icon="plus" onPress={compose} />}
            />
          ) : (
            <Text style={[type.body, styles.none, { color: tokens.muted }]}>
              {filter === 'draft' ? 'No drafts.' : 'No scheduled messages.'}
            </Text>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, width: '100%', maxWidth: 620, alignSelf: 'center' },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  // Rows render as slices of one bordered container, so the list stays virtualised.
  cardSlice: { borderLeftWidth: 1, borderRightWidth: 1, overflow: 'hidden' },
  row: { paddingVertical: 14, paddingHorizontal: spacing.xl, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  subject: { flex: 1, lineHeight: 22 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  none: { textAlign: 'center', paddingVertical: spacing.xxl },
});
