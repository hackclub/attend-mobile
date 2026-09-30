import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, api } from '../services/api';
import { useApp } from '../context/AppContext';
import { useEventAccess } from '../hooks/useEventAccess';
import { colors } from '../theme/colors';
import { FilterChip, ScreenHeader, SearchField, cardSurface } from '../components/ui';
import type {
  RootStackParamList,
  TravelCalendarData,
  TravelCalendarEntry,
  TravelMode,
  TravelPickupState,
} from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type ChipId = 'all' | 'inbound' | 'outbound' | 'awaiting_pickup' | 'collected' | 'ums';

const REFRESH_INTERVAL_MS = 60_000;

const MODE_ICON: Record<TravelMode, keyof typeof Ionicons.glyphMap> = {
  plane: 'airplane-outline',
  train: 'train-outline',
  bus: 'bus-outline',
  car: 'car-outline',
  other: 'navigate-circle-outline',
};

const MODE_LABEL: Record<TravelMode, string> = {
  plane: 'Plane',
  train: 'Train',
  bus: 'Bus',
  car: 'Car',
  other: 'Other',
};

const MODE_ORDER: TravelMode[] = ['plane', 'train', 'bus', 'car', 'other'];

function entryMatchesSearch(entry: TravelCalendarEntry, query: string): boolean {
  if (!query) return true;
  const haystack = [
    entry.participantName,
    entry.participantPreferredName,
    entry.route,
    entry.reference,
    entry.details,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

const PICKUP_LABEL: Record<TravelPickupState, string> = {
  awaiting_pickup: 'Awaiting pickup',
  collected: 'Picked up',
  checked_in: 'Checked in',
  pickup_not_needed: 'No pickup',
};

const PICKUP_TINT: Record<TravelPickupState, string> = {
  awaiting_pickup: colors.orange,
  collected: colors.green,
  checked_in: colors.blue,
  pickup_not_needed: colors.gray[500],
};

function displayName(entry: TravelCalendarEntry): string {
  return entry.participantPreferredName?.trim() || entry.participantName;
}

function formatTimeInZone(iso: string, tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz || undefined,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

// agendaDate is a plain YYYY-MM-DD in the event's timezone. Anchor it at noon
// UTC and format in UTC so the label never drifts a day in other timezones.
function formatAgendaDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function todayInZone(tz?: string | null): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function relativeDayLabel(date: string, tz?: string | null): string | null {
  const today = todayInZone(tz);
  if (date === today) return 'Today';
  const todayMs = new Date(`${today}T12:00:00Z`).getTime();
  const dateMs = new Date(`${date}T12:00:00Z`).getTime();
  const diffDays = Math.round((dateMs - todayMs) / 86_400_000);
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return null;
}

function entryMatchesChip(entry: TravelCalendarEntry, chip: ChipId): boolean {
  switch (chip) {
    case 'all': return true;
    case 'inbound': return entry.direction === 'inbound';
    case 'outbound': return entry.direction === 'outbound';
    case 'awaiting_pickup': return entry.pickupState === 'awaiting_pickup';
    case 'collected': return entry.pickupState === 'collected' || entry.pickupState === 'checked_in';
    case 'ums': return entry.isUnaccompaniedMinor;
  }
}

function DirectionBadge({ direction }: { direction: TravelCalendarEntry['direction'] }) {
  const inbound = direction === 'inbound';
  return (
    <View style={[styles.directionBadge, inbound ? styles.directionInbound : styles.directionOutbound]}>
      <Ionicons
        name={inbound ? 'arrow-down' : 'arrow-up'}
        size={11}
        color={inbound ? colors.green : colors.blue}
      />
      <Text style={[styles.directionText, { color: inbound ? colors.green : colors.blue }]}>
        {inbound ? 'Arrives' : 'Departs'}
      </Text>
    </View>
  );
}

function PickupPill({ state }: { state: TravelPickupState }) {
  const tint = PICKUP_TINT[state];
  return (
    <View style={[styles.pickupPill, { backgroundColor: `${tint}22`, borderColor: `${tint}55` }]}>
      <Text style={[styles.pickupPillText, { color: tint }]}>{PICKUP_LABEL[state]}</Text>
    </View>
  );
}

function EntryRow({
  entry,
  timezone,
  onPress,
}: {
  entry: TravelCalendarEntry;
  timezone?: string | null;
  // Absent when this role can't open participant records: the row still shows
  // the journey, it just isn't a link into a 403.
  onPress?: () => void;
}) {
  const time = entry.primaryTimeAt ? formatTimeInZone(entry.primaryTimeAt, timezone) : null;
  return (
    <TouchableOpacity
      style={[styles.row, entry.isUnaccompaniedMinor && styles.rowUm]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={styles.rowTime}>
        {time ? (
          <Text style={styles.timeText}>{time}</Text>
        ) : (
          <Text style={styles.timeMissing}>—:—</Text>
        )}
        <Ionicons name={MODE_ICON[entry.mode] ?? MODE_ICON.other} size={18} color={colors.gray[500]} />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.name} numberOfLines={1}>{displayName(entry)}</Text>
          {entry.isUnaccompaniedMinor && (
            <View style={styles.umBadge}>
              <Text style={styles.umBadgeText}>UM</Text>
            </View>
          )}
        </View>

        {entry.route || entry.reference ? (
          <Text style={styles.routeText} numberOfLines={1}>
            {[entry.route, entry.reference].filter(Boolean).join(' · ')}
          </Text>
        ) : entry.routeRedacted ? (
          <Text style={styles.routeRedactedText} numberOfLines={1}>
            Pickup address hidden for your role
          </Text>
        ) : null}

        <View style={styles.rowMetaLine}>
          <DirectionBadge direction={entry.direction} />
          {entry.pickupState ? <PickupPill state={entry.pickupState} /> : null}
          {entry.groups.slice(0, 2).map((group) => (
            <View key={group.id} style={styles.groupChip}>
              <View style={[styles.groupDot, { backgroundColor: group.color || colors.gray[400] }]} />
              <Text style={styles.groupText} numberOfLines={1}>{group.name}</Text>
            </View>
          ))}
        </View>
      </View>

      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} /> : null}
    </TouchableOpacity>
  );
}

export function TravelCalendarScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const { canViewParticipantRecords } = useEventAccess();
  const tabBarHeight = useBottomTabBarHeight();
  const [data, setData] = useState<TravelCalendarData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // `retryable` is false for an answer that won't change on a retry (a role
  // that has no access), so the banner doesn't invite a pointless tap.
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [chip, setChip] = useState<ChipId>('all');
  const [modeFilter, setModeFilter] = useState<TravelMode | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpeningId, setIsOpeningId] = useState<string | null>(null);
  const eventId = state.currentEvent?.id ?? null;
  const requestSeq = useRef(0);

  const fetchData = useCallback(async (silent = false) => {
    if (!eventId) return;
    const seq = ++requestSeq.current;
    if (!silent) setIsLoading(true);
    try {
      const result = await api.getTravelCalendar(eventId);
      if (requestSeq.current === seq) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (requestSeq.current === seq) {
        setError({
          message: e instanceof Error ? e.message : 'Failed to load travel calendar',
          retryable: !(e instanceof ApiError && e.isForbidden),
        });
      }
    } finally {
      if (requestSeq.current === seq) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [eventId]);

  // Refetch when the tab gains focus, and keep it fresh while visible.
  useFocusEffect(
    useCallback(() => {
      setData(null);
      setChip('all');
      setModeFilter('all');
      setSearchQuery('');
      fetchData();
      const interval = setInterval(() => fetchData(true), REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [fetchData])
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchData(true);
  }, [fetchData]);

  const openParticipant = useCallback(async (entry: TravelCalendarEntry) => {
    if (!eventId || isOpeningId || !canViewParticipantRecords) return;
    setIsOpeningId(entry.id);
    try {
      const participant = await api.getParticipant(eventId, entry.participantEventId);
      navigation.navigate('ParticipantDetail', { participant });
    } catch (e) {
      // A 403 isn't a failure to retry — it's the answer. The tap target is
      // gone by the next render, so say what happened and leave it there.
      const forbidden = e instanceof ApiError && e.isForbidden;
      setError({
        message: forbidden
          ? "Your role on this event doesn't include participant records."
          : 'Could not open that participant.',
        retryable: !forbidden,
      });
    } finally {
      setIsOpeningId(null);
    }
  }, [canViewParticipantRecords, eventId, isOpeningId, navigation]);

  const trimmedQuery = searchQuery.trim();

  const availableModes = useMemo(() => {
    if (!data) return [];
    const present = new Set(data.entries.map((entry) => entry.mode));
    return MODE_ORDER.filter((mode) => present.has(mode));
  }, [data]);

  const modeCounts = useMemo(() => {
    const counts = new Map<TravelMode, number>();
    for (const entry of data?.entries ?? []) {
      counts.set(entry.mode, (counts.get(entry.mode) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const sections = useMemo(() => {
    if (!data) return [];
    const filtered = data.entries.filter(
      (entry) =>
        entryMatchesChip(entry, chip)
        && (modeFilter === 'all' || entry.mode === modeFilter)
        && entryMatchesSearch(entry, trimmedQuery)
    );
    const byDate = new Map<string, TravelCalendarEntry[]>();
    const unscheduled: TravelCalendarEntry[] = [];
    for (const entry of filtered) {
      if (entry.agendaDate) {
        const bucket = byDate.get(entry.agendaDate) ?? [];
        bucket.push(entry);
        byDate.set(entry.agendaDate, bucket);
      } else {
        unscheduled.push(entry);
      }
    }
    const dated = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entries]) => ({
        key: date,
        title: formatAgendaDate(date),
        badge: relativeDayLabel(date, data.eventTimezone),
        data: entries,
      }));
    if (unscheduled.length > 0) {
      dated.push({ key: 'unscheduled', title: 'Unscheduled', badge: null, data: unscheduled });
    }
    return dated;
  }, [data, chip, modeFilter, trimmedQuery]);

  const chips: { id: ChipId; label: string; count?: number }[] = useMemo(() => {
    const counts = data?.counts;
    return [
      { id: 'all', label: 'All', count: counts?.total },
      { id: 'inbound', label: 'Arrivals', count: counts?.inbound },
      { id: 'outbound', label: 'Departures', count: counts?.outbound },
      { id: 'awaiting_pickup', label: 'Awaiting pickup', count: counts?.awaitingPickup },
      { id: 'collected', label: 'Picked up', count: counts ? counts.collected + counts.checkedIn : undefined },
      { id: 'ums', label: 'UMs', count: data ? data.entries.filter((e) => e.isUnaccompaniedMinor).length : undefined },
    ];
  }, [data]);

  if (!state.currentEvent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Ionicons name="airplane-outline" size={42} color={colors.gray[400]} />
          <Text style={styles.emptyTitle}>No event selected</Text>
          <Text style={styles.emptyText}>Pick an event from the Events tab to see its travel calendar.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Travel"
        subtitle={state.currentEvent.name}
        right={data?.eventTimezone ? (
          <View style={styles.tzBadge}>
            <Ionicons name="time-outline" size={13} color={colors.gray[600]} />
            <Text style={styles.tzText}>{data.eventTimezone}</Text>
          </View>
        ) : undefined}
      />

      <SearchField
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search name, route, or flight"
      />

      <View style={styles.chipBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {chips.map((c) => (
            <FilterChip
              key={c.id}
              label={c.label}
              badge={c.count}
              active={chip === c.id}
              onPress={() => setChip(c.id)}
            />
          ))}
        </ScrollView>
      </View>

      {availableModes.length > 1 && (
        <View style={styles.chipBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <FilterChip
              label="All transport"
              active={modeFilter === 'all'}
              onPress={() => setModeFilter('all')}
            />
            {availableModes.map((mode) => (
              <FilterChip
                key={mode}
                label={MODE_LABEL[mode]}
                icon={MODE_ICON[mode]}
                badge={modeCounts.get(mode) ?? 0}
                active={modeFilter === mode}
                onPress={() => setModeFilter(modeFilter === mode ? 'all' : mode)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {error && (
        <TouchableOpacity
          style={styles.errorBanner}
          onPress={() => fetchData()}
          disabled={!error.retryable}
        >
          <Ionicons name="alert-circle-outline" size={16} color={colors.red} />
          <Text style={styles.errorText} numberOfLines={2}>
            {error.retryable ? `${error.message} · Tap to retry` : error.message}
          </Text>
        </TouchableOpacity>
      )}

      {isLoading && !data ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.red} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 24 }]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.red} />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.badge ? (
                <View style={styles.sectionBadge}>
                  <Text style={styles.sectionBadgeText}>{section.badge}</Text>
                </View>
              ) : null}
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <EntryRow
              entry={item}
              timezone={data?.eventTimezone}
              onPress={canViewParticipantRecords ? () => openParticipant(item) : undefined}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="airplane-outline" size={42} color={colors.gray[400]} />
              <Text style={styles.emptyTitle}>
                {trimmedQuery
                  ? `No matches for “${trimmedQuery}”`
                  : chip === 'all' && modeFilter === 'all'
                    ? 'No travel yet'
                    : 'Nothing matches these filters'}
              </Text>
              <Text style={styles.emptyText}>
                {trimmedQuery || chip !== 'all' || modeFilter !== 'all'
                  ? 'Try a different search or filter to see more journeys.'
                  : 'Participant journeys appear here once travel details are added.'}
              </Text>
            </View>
          }
        />
      )}

      {isOpeningId && (
        <View style={styles.openingOverlay} pointerEvents="none">
          <ActivityIndicator color={colors.white} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  tzBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  tzText: { fontSize: 12, color: colors.gray[600], fontWeight: '600' },
  chipBar: { paddingTop: 8 },
  chipRow: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: `${colors.red}14`,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.red, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingTop: 4, flexGrow: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    backgroundColor: colors.gray[50],
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.gray[900] },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9,
    backgroundColor: `${colors.red}18`,
  },
  sectionBadgeText: { fontSize: 11, fontWeight: '800', color: colors.red },
  sectionCount: { marginLeft: 'auto', fontSize: 13, fontWeight: '700', color: colors.gray[400] },
  row: {
    ...cardSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowUm: { borderColor: colors.orange, borderWidth: 1 },
  rowTime: { width: 52, alignItems: 'center', gap: 5 },
  timeText: { fontSize: 15, fontWeight: '800', color: colors.gray[900], fontVariant: ['tabular-nums'] },
  timeMissing: { fontSize: 15, fontWeight: '700', color: colors.gray[300] },
  rowBody: { flex: 1, gap: 4 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { fontSize: 16, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  umBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: colors.orange,
  },
  umBadgeText: { fontSize: 10, fontWeight: '900', color: colors.white },
  routeText: { fontSize: 13, color: colors.gray[500] },
  routeRedactedText: { fontSize: 13, color: colors.gray[400], fontStyle: 'italic' },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  directionInbound: { backgroundColor: `${colors.green}16` },
  directionOutbound: { backgroundColor: `${colors.blue}16` },
  directionText: { fontSize: 11, fontWeight: '700' },
  pickupPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickupPillText: { fontSize: 11, fontWeight: '700' },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.gray[100],
    maxWidth: 120,
  },
  groupDot: { width: 7, height: 7, borderRadius: 4 },
  groupText: { fontSize: 11, fontWeight: '600', color: colors.gray[600] },
  centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.gray[700] },
  emptyText: { fontSize: 14, color: colors.gray[500], textAlign: 'center', maxWidth: 280, lineHeight: 20 },
  openingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.25)',
  },
});
