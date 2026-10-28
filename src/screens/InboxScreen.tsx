import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../services/api';
import { FilterChip, SearchField, makeCardSurface } from '../components/ui';
import { Badge, EmptyState, ErrorView, LoadingView, formatDateTime } from '../components/forms';
import { CHANNEL_COLORS, CHANNEL_LABELS } from '../services/statusDisplay';
import { useTheme, useThemedStyles, type Theme, type ThemeColors } from '../theme';
import type { InboxPage, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Inbox'>;

/** The participant's messages from organizers, as /dashboard/messages. */
export function InboxScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const [page, setPage] = useState<InboxPage | null>(null);
  // The event chips come from the unfiltered list, so they don't vanish
  // when one is picked.
  const [events, setEvents] = useState<InboxPage['events']>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    try {
      const result = await api.getInbox({ eventId, q: query.trim() || undefined }, controller.signal);
      if (controller.signal.aborted) return;
      setPage(result);
      if (!eventId && !query.trim()) setEvents(result.events);
      setError(null);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, [eventId, query]);

  // Debounced so typing in the search box doesn't fire a request per key.
  useEffect(() => {
    const timer = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  // Coming back from a message refreshes its read state. The ref keeps the
  // focus listener on the current filters without re-subscribing.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) loadRef.current();
      focusedOnce.current = true;
    }, [])
  );

  if (error && !page) return <ErrorView message={error} onRetry={load} />;
  if (!page) return <LoadingView />;

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = !!eventId || !!query.trim();

  return (
    <FlatList
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      data={page.messages}
      keyExtractor={m => m.id}
      contentContainerStyle={styles.list}
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.text.accent} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search messages" />
          {events.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <FilterChip label="All events" active={!eventId} onPress={() => setEventId(null)} />
              {events.map(e => (
                <FilterChip key={e.id} label={e.name} active={eventId === e.id} onPress={() => setEventId(e.id)} />
              ))}
            </ScrollView>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.75}
          onPress={() => navigation.navigate('InboxMessage', { messageId: item.id })}
        >
          <View style={styles.row}>
            {item.unread ? <View style={[styles.dot, { backgroundColor: colors.text.accent }]} accessibilityLabel="Unread" /> : null}
            <Text style={[styles.subject, item.unread && styles.unread]} numberOfLines={1}>
              {item.subject || `Message from ${item.event.name}`}
            </Text>
            <Text style={styles.meta}>{formatDateTime(item.delivered_at)}</Text>
          </View>
          <Text style={styles.preview} numberOfLines={2}>{item.preview_text}</Text>
          <View style={styles.row}>
            <Text style={[styles.meta, styles.flex]} numberOfLines={1}>
              {item.event.name}
              {item.sender_name ? ` · From ${item.sender_name}` : ''}
            </Text>
            {item.channels.map(c => (
              <Badge key={c} label={CHANNEL_LABELS[c] ?? c} color={CHANNEL_COLORS[c]} />
            ))}
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        filtered ? (
          <EmptyState title="No messages match" message="Try a different search or event." />
        ) : (
          <EmptyState title="No messages yet" message="Messages from your event organizers will appear here." />
        )
      }
    />
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) => StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: 32 },
  header: { paddingTop: 8, gap: 10 },
  chips: { gap: 8, paddingHorizontal: 16 },
  card: { ...makeCardSurface(colors, theme), marginHorizontal: 16, marginTop: 10, padding: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  subject: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.gray[900] },
  unread: { fontWeight: '800' },
  preview: { fontSize: 14, color: colors.gray[700] },
  meta: { fontSize: 12, color: colors.gray[600] },
});
