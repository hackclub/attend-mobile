import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset } from '../hooks/useTabBarInset';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ApiError, api } from '../services/api';
import { useApp } from '../context/AppContext';
import { useEventAccess } from '../hooks/useEventAccess';
import { travelClock } from '../services/travelTimes';
import { useTheme, useThemedStyles, type Theme } from '../theme';
import {
  Badge,
  Flashbar,
  Icon,
  SegmentedControl,
  StatusGlyph,
  TextField,
  PressableSurface,
  type StatusType,
} from '../components/ui';
import type {
  AppStackParamList,
  TravelCalendarData,
  TravelCalendarEntry,
  TravelDirection,
  TravelMode,
} from '../types';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const REFRESH_INTERVAL_MS = 60_000;

const MODE_LABEL: Record<TravelMode, string> = {
  plane: 'Plane',
  train: 'Train',
  bus: 'Bus',
  car: 'Car',
  other: 'Other',
};

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

function displayName(entry: TravelCalendarEntry): string {
  return entry.participantPreferredName?.trim() || entry.participantName;
}

// agendaDate is a plain YYYY-MM-DD in the event's timezone. Anchor it at noon
// UTC and format in UTC so the label never drifts a day in other timezones.
function formatAgendaDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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

const isPickedUp = (e: TravelCalendarEntry) => e.pickupState === 'collected' || e.pickupState === 'checked_in';

/** One journey at one time: everyone on the same flight, train or car. */
interface Leg {
  key: string;
  /** "2:15" and "PM", in the event's timezone. */
  time: { time: string; period: string } | null;
  title: string;
  route: string | null;
  routeRedacted: boolean;
  entries: TravelCalendarEntry[];
  hasMinor: boolean;
  pickup: { type: StatusType; label: string } | null;
}

// Collapse a day's entries into legs: same time, mode, reference and route.
function buildLegs(entries: TravelCalendarEntry[], timezone?: string | null): Leg[] {
  const sorted = [...entries].sort((a, b) => (a.primaryTimeAt ?? '').localeCompare(b.primaryTimeAt ?? ''));
  const legs = new Map<string, Leg>();
  for (const entry of sorted) {
    const time = travelClock(entry.primaryTimeAt, timezone);
    const key = [time ? `${time.time} ${time.period}` : '', entry.mode, entry.reference ?? '', entry.route ?? '', entry.routeRedacted ? 'r' : ''].join('|');
    let leg = legs.get(key);
    if (!leg) {
      leg = {
        key,
        time,
        title: entry.reference?.trim() || MODE_LABEL[entry.mode] || MODE_LABEL.other,
        route: entry.route ?? null,
        routeRedacted: !entry.route && Boolean(entry.routeRedacted),
        entries: [],
        hasMinor: false,
        pickup: null,
      };
      legs.set(key, leg);
    }
    leg.entries.push(entry);
    leg.hasMinor ||= entry.isUnaccompaniedMinor;
  }
  for (const leg of legs.values()) leg.pickup = legPickup(leg.entries);
  return [...legs.values()];
}

// The leg's pickup status: anyone still waiting wins, then picked up, then
// "No pickup". Legs whose entries carry no pickup state show none.
function legPickup(entries: TravelCalendarEntry[]): Leg['pickup'] {
  const states = entries.map((e) => e.pickupState).filter(Boolean);
  if (!states.length) return null;
  if (states.includes('awaiting_pickup')) return { type: 'pending', label: 'Awaiting pickup' };
  if (states.every((s) => s === 'checked_in')) return { type: 'success', label: 'Checked in' };
  if (states.some((s) => s === 'collected' || s === 'checked_in')) return { type: 'success', label: 'Picked up' };
  return { type: 'stopped', label: 'No pickup' };
}

/** Status glyph and label; "Awaiting pickup" uses the info colour, as on the console. */
function PickupStatus({ type, label }: { type: StatusType; label: string }) {
  const { tokens, type: typeScale } = useTheme();
  const color = type === 'success' ? tokens.success : type === 'pending' ? tokens.info : tokens.inactive;
  return (
    <View style={pickupStyles.row} accessible accessibilityLabel={label}>
      <StatusGlyph type={type} color={color} />
      <Text style={[typeScale.body, { color }]}>{label}</Text>
    </View>
  );
}

const pickupStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

function LegRow({
  leg,
  onOpen,
}: {
  leg: Leg;
  // Absent when this role can't open participant records: the chips still
  // name everyone, they just aren't links into a 403.
  onOpen?: (entry: TravelCalendarEntry) => void;
}) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const done = leg.pickup?.type === 'success';
  return (
    <View style={[styles.legRow, done && styles.legDone]}>
      <View style={styles.legTime} accessible accessibilityLabel={leg.time ? `${leg.time.time} ${leg.time.period}` : 'No time'}>
        {leg.time ? (
          <>
            <Text style={styles.timeText}>{leg.time.time}</Text>
            <Text style={styles.timePeriod}>{leg.time.period}</Text>
          </>
        ) : (
          <Text style={styles.timeMissing}>—:—</Text>
        )}
      </View>
      <View style={styles.legCard}>
        <Text style={styles.legTitle} numberOfLines={1}>
          {leg.title}
        </Text>
        {leg.route ? (
          <Text style={styles.legRoute} numberOfLines={1}>
            {leg.route}
          </Text>
        ) : leg.routeRedacted ? (
          <Text style={styles.legRouteHidden} numberOfLines={1}>
            Pickup address hidden for your role
          </Text>
        ) : null}
        <View style={styles.chips}>
          {leg.entries.map((entry) =>
            onOpen ? (
              <PressableSurface
                key={entry.id}
                onPress={() => onOpen(entry)}
                rippleColor={tokens.text}
                style={styles.chipShape}
                contentStyle={[styles.chipContent, styles.chipPressable]}
                accessibilityRole="button"
                accessibilityLabel={`${displayName(entry)}${entry.isUnaccompaniedMinor ? ', unaccompanied minor' : ''}`}
                accessibilityHint="Opens their participant record"
              >
                <Text style={styles.chipText} numberOfLines={1}>
                  {displayName(entry)}
                </Text>
              </PressableSurface>
            ) : (
              <View key={entry.id} style={[styles.chipShape, styles.chipContent]}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {displayName(entry)}
                </Text>
              </View>
            ),
          )}
          {leg.hasMinor ? <Badge label="Unaccompanied minor" color="yellow" /> : null}
        </View>
        {leg.pickup ? <PickupStatus type={leg.pickup.type} label={leg.pickup.label} /> : null}
      </View>
    </View>
  );
}

interface DaySection {
  key: string;
  title: string;
  badge: string | null;
  pickedUp: number;
  awaiting: number;
  data: Leg[];
}

export function TravelCalendarScreen() {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const { canViewParticipantRecords } = useEventAccess();
  const tabBarHeight = useTabBarInset();
  const [data, setData] = useState<TravelCalendarData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // `retryable` is false for an answer that won't change on a retry (a role
  // that has no access), so the banner doesn't invite a pointless tap.
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [direction, setDirection] = useState<TravelDirection>('inbound');
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

  const sections = useMemo<DaySection[]>(() => {
    if (!data) return [];
    const filtered = data.entries.filter(
      (entry) => entry.direction === direction && entryMatchesSearch(entry, trimmedQuery)
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
    const section = (key: string, title: string, badge: string | null, entries: TravelCalendarEntry[]): DaySection => ({
      key,
      title,
      badge,
      pickedUp: entries.filter(isPickedUp).length,
      awaiting: entries.filter((e) => e.pickupState === 'awaiting_pickup').length,
      data: buildLegs(entries, data.eventTimezone),
    });
    const dated = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entries]) => section(date, formatAgendaDate(date), relativeDayLabel(date, data.eventTimezone), entries));
    if (unscheduled.length > 0) {
      dated.push(section('unscheduled', 'Unscheduled', null, unscheduled));
    }
    return dated;
  }, [data, direction, trimmedQuery]);

  const directionOptions = useMemo(
    () =>
      [
        { value: 'inbound', label: 'Arrivals', count: data?.counts.inbound },
        { value: 'outbound', label: 'Departures', count: data?.counts.outbound },
      ] as const,
    [data]
  );

  if (!state.currentEvent) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <Icon name="travel" size={40} color={tokens.muted} />
          <Text style={styles.emptyTitle}>No event selected</Text>
          <Text style={styles.emptyText}>Pick an event from the Overview tab to see its travel calendar.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // The heading, then search, then the direction: the same order as People.
  const header = (
    <View style={styles.header}>
      <View>
        <Text style={styles.title} accessibilityRole="header">Travel</Text>
        {data?.eventTimezone ? (
          <Text style={styles.tzText} numberOfLines={1}>Times in {data.eventTimezone}</Text>
        ) : null}
      </View>
      <TextField
        icon="search"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search name, route, or flight"
        accessibilityLabel="Search travel"
        clearable
        autoCorrect={false}
        returnKeyType="search"
      />
      <SegmentedControl
        options={directionOptions}
        value={direction}
        onChange={setDirection}
        accessibilityLabel="Direction"
        role="tab"
      />
      {error ? (
        <Flashbar
          type="error"
          message={error.message}
          action={error.retryable ? { label: 'Try again', onPress: () => fetchData() } : undefined}
        />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {header}
      {isLoading && !data ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.accent} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.key}
          stickySectionHeadersEnabled
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={tokens.accent}
              colors={[tokens.accent]}
              progressBackgroundColor={tokens.bg}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.dayHeader} accessibilityRole="header">
              <Text style={styles.dayTitle}>{section.title}</Text>
              {section.badge ? <Badge label={section.badge} color="blue" /> : null}
              {section.pickedUp || section.awaiting ? (
                <View style={styles.dayCounts}>
                  <PickupStatus type="success" label={`${section.pickedUp} picked up`} />
                  <PickupStatus type="pending" label={`${section.awaiting} awaiting pickup`} />
                </View>
              ) : null}
            </View>
          )}
          renderItem={({ item }) => (
            <LegRow leg={item} onOpen={canViewParticipantRecords ? openParticipant : undefined} />
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Icon name="travel" size={40} color={tokens.muted} />
              <Text style={styles.emptyTitle}>
                {trimmedQuery ? `No matches for “${trimmedQuery}”` : 'No travel yet'}
              </Text>
              <Text style={styles.emptyText}>
                {trimmedQuery
                  ? 'Try a different search to see more journeys.'
                  : 'Participant journeys appear here once travel details are added.'}
              </Text>
            </View>
          }
        />
      )}

      {isOpeningId && (
        <View style={styles.openingOverlay} pointerEvents="none">
          <ActivityIndicator color={tokens.accent} />
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) => {
  const { tokens: t, type, spacing, radii } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.md },
    title: { ...type.h1, color: t.textH },
    tzText: { ...type.small, color: t.muted },
    listContent: { paddingHorizontal: spacing.lg, flexGrow: 1 },
    dayHeader: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: 14,
      rowGap: spacing.xs,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      backgroundColor: t.bg,
    },
    dayTitle: { ...type.label, color: t.textH },
    dayCounts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: spacing.xs },
    legRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
    legDone: { opacity: 0.6 },
    legTime: { width: 52, alignItems: 'flex-end', paddingTop: spacing.md },
    timeText: { ...type.label, color: t.textH, fontVariant: ['tabular-nums'] },
    timePeriod: { ...type.body, color: t.muted },
    timeMissing: { ...type.label, color: t.muted },
    legCard: {
      flex: 1,
      minWidth: 0,
      backgroundColor: t.bg,
      borderWidth: 1,
      borderColor: t.box,
      borderRadius: radii.container,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
    },
    legTitle: { ...type.h3, color: t.textH },
    legRoute: { ...type.body, color: t.text2, marginTop: -spacing.xs },
    legRouteHidden: { ...type.body, color: t.muted, fontStyle: 'italic', marginTop: -spacing.xs },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chipShape: { borderRadius: radii.badge, backgroundColor: t.shaded, maxWidth: '100%', overflow: 'hidden' },
    chipContent: { paddingHorizontal: spacing.sm },
    // A larger touch area around the 20pt chip without changing its look.
    chipPressable: { minHeight: 28, justifyContent: 'center' },
    chipText: { fontSize: 12, lineHeight: 20, color: t.text },
    centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl, gap: 10 },
    emptyTitle: { ...type.h3, color: t.textH, textAlign: 'center' },
    emptyText: { ...type.body, color: t.text2, textAlign: 'center', maxWidth: 280 },
    openingOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.overlay,
    },
  });
};
