import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../services/api';
import {
  EmptyState,
  ErrorView,
  isAndroid,
  LoadingView,
  PressableSurface,
  ripple,
  ROW_STATE_LAYER_ALPHA,
  Screen,
  TextField,
} from '../components/ui';
import { formatDateTime } from '../components/forms';
import { channelList } from '../components/messageStatus';
import { spacing, useTheme } from '../theme';
import type { InboxPage, AppStackParamList } from '../types';
import { useScreenInsets } from '../hooks/useScreenInsets';

type Nav = NativeStackNavigationProp<AppStackParamList, 'Inbox'>;

/** The participant's messages from organizers, as /dashboard/messages. */
export function InboxScreen() {
  const insets = useScreenInsets();
  const { tokens, type, radii } = useTheme();
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

  if (!page) {
    return (
      <Screen title="Messages" scroll={false}>
        {error ? <ErrorView message={error} onRetry={load} /> : <LoadingView />}
      </Screen>
    );
  }

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = !!eventId || !!query.trim();

  return (
    <Screen title="Messages" scroll={false}>
      <FlatList
        style={{ flex: 1, backgroundColor: tokens.bg }}
        data={page.messages}
        keyExtractor={m => m.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
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
          <View style={styles.header}>
            <TextField
              icon="search"
              clearable
              value={query}
              onChangeText={setQuery}
              placeholder="Search messages"
              accessibilityLabel="Search messages"
              returnKeyType="search"
              autoCorrect={false}
            />
            {events.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <EventChip label="All events" active={!eventId} onPress={() => setEventId(null)} />
                {events.map(e => (
                  <EventChip key={e.id} label={e.name} active={eventId === e.id} onPress={() => setEventId(e.id)} />
                ))}
              </ScrollView>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const first = index === 0;
          const last = index === page.messages.length - 1;
          const subject = item.subject || `Message from ${item.event.name}`;
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
                onPress={() => navigation.navigate('InboxMessage', { messageId: item.id })}
                accessibilityRole="button"
                accessibilityLabel={item.unread ? `Unread, ${subject}` : subject}
                android_ripple={ripple(tokens.text, { alpha: ROW_STATE_LAYER_ALPHA })}
                style={({ pressed }) => [
                  styles.row,
                  !first && { borderTopWidth: 1, borderTopColor: tokens.div2 },
                  item.unread && { backgroundColor: tokens.selected },
                  !isAndroid && pressed && { backgroundColor: tokens.shaded },
                ]}
              >
                <View style={styles.titleRow}>
                  {item.unread ? <View style={[styles.dot, { backgroundColor: tokens.accent }]} /> : null}
                  <Text
                    style={[item.unread ? type.h3 : type.label, styles.subject, { color: tokens.textH }]}
                    numberOfLines={1}
                  >
                    {subject}
                  </Text>
                  <Text style={[type.small, { color: tokens.muted }]}>{formatDateTime(item.delivered_at)}</Text>
                </View>
                <Text style={[type.body, { color: tokens.text2 }]} numberOfLines={2}>
                  {item.preview_text}
                </Text>
                <Text style={[type.body, { color: tokens.muted }]} numberOfLines={1}>
                  {[item.event.name, item.sender_name ? `From ${item.sender_name}` : null, channelList(item.channels)]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          filtered ? (
            <EmptyState title="No messages match" message="Try a different search or event." />
          ) : (
            <EmptyState title="No messages yet" message="Messages from your event organizers will appear here." />
          )
        }
      />
    </Screen>
  );
}

// The event filter. The kit has no chip, and a person can have more events
// than a SegmentedControl holds, so it is a scrolling strip of pills styled
// like a segment (selected: accent on the selected tint).
function EventChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { tokens, type, radii } = useTheme();
  return (
    <PressableSurface
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      rippleColor={active ? tokens.accent : tokens.text}
      style={[
        styles.chip,
        {
          borderRadius: radii.pill,
          borderColor: active ? tokens.accent : tokens.input,
          backgroundColor: active ? tokens.selected : tokens.bg,
        },
      ]}
      contentStyle={styles.chipContent}
    >
      <Text style={[type.label, { color: active ? tokens.accent : tokens.text }]} numberOfLines={1}>
        {label}
      </Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1 },
  // 36 including the 1px border.
  chipContent: { minHeight: 34, paddingHorizontal: 14, justifyContent: 'center' },
  list: { paddingHorizontal: spacing.lg, width: '100%', maxWidth: 620, alignSelf: 'center' },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  chips: { gap: spacing.sm },
  // Rows render as slices of one bordered container, so the list stays virtualised.
  cardSlice: { borderLeftWidth: 1, borderRightWidth: 1, overflow: 'hidden' },
  row: { paddingVertical: 14, paddingHorizontal: spacing.xl, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  subject: { flex: 1 },
});
