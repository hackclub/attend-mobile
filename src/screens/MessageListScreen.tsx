import React, { useCallback, useLayoutEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { makeCardSurface } from '../components/ui';
import { Badge, Button, EmptyState, ErrorView, LoadingView, StatusPill, formatDateTime } from '../components/forms';
import { CHANNEL_COLORS, CHANNEL_LABELS, MESSAGE_STATUS_TONES, titleize } from '../services/statusDisplay';
import { useTheme, useThemedStyles, type Theme, type ThemeColors } from '../theme';
import type { MessageSummary, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'MessageList'>;

export function MessageListScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const { state } = useApp();
  const event = state.currentEvent;
  const [messages, setMessages] = useState<MessageSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('MessageCompose', {})}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Compose message"
        >
          <Ionicons name="create-outline" size={26} color={colors.text.accent} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors]);

  if (!event) return <EmptyState title="No event selected" message="Pick an event on the Events tab first." />;
  if (error && !messages) return <ErrorView message={error} onRetry={load} />;
  if (!messages) return <LoadingView />;

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Every message opens its page; a draft's page offers Edit and Send.
  const open = (message: MessageSummary) => navigation.navigate('MessageDetail', { messageId: message.id });

  return (
    <FlatList
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      data={messages}
      keyExtractor={m => m.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.text.accent} />}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={() => open(item)}>
          <View style={styles.row}>
            <Text style={[styles.subject, !item.subject && styles.muted]} numberOfLines={1}>
              {item.subject || 'No subject'}
            </Text>
            <StatusPill tone={MESSAGE_STATUS_TONES[item.status] ?? 'info'} label={titleize(item.status)} />
          </View>
          {item.preview_text ? <Text style={styles.preview} numberOfLines={2}>{item.preview_text}</Text> : null}
          <View style={styles.row}>
            <View style={styles.channels}>
              {item.channels.map(c => (
                <Badge key={c} label={CHANNEL_LABELS[c] ?? c} color={CHANNEL_COLORS[c]} />
              ))}
            </View>
            <Text style={styles.meta}>{item.audience_label}</Text>
          </View>
          <Text style={styles.meta}>
            {item.sent_at
              ? `Sent ${formatDateTime(item.sent_at)} · ${item.sent_count}/${item.recipient_count} delivered${item.failed_count ? ` · ${item.failed_count} failed` : ''}`
              : item.scheduled_at
                ? `Scheduled for ${formatDateTime(item.scheduled_at)}`
                : `Created ${formatDateTime(item.created_at)}`}
            {item.sent_by ? ` · ${item.sent_by}` : ''}
          </Text>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <EmptyState
          title="No messages yet"
          message="Send email, SMS, Slack and push messages to this event's attendees and guardians."
          action={<Button title="Compose message" onPress={() => navigation.navigate('MessageCompose', {})} />}
        />
      }
    />
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: 32, paddingTop: 4 },
  card: { ...makeCardSurface(colors, theme), marginHorizontal: 16, marginTop: 10, padding: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  subject: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.gray[900] },
  muted: { color: colors.gray[500] },
  preview: { fontSize: 14, color: colors.gray[700] },
  channels: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 },
  meta: { fontSize: 13, color: colors.gray[600] },
});
