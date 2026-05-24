import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  Image,
  TextInput,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { SplitView } from '../components/SplitView';
import { ParticipantDetailContent } from './ParticipantDetailContent';
import { api } from '../services/api';
import { colors } from '../theme/colors';
import type {
  AirportModeData,
  AirportTab,
  Journey,
  Participant,
  RootStackParamList,
  StatusColor,
} from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type ChipId =
  | 'all'
  | 'alerts'
  | 'landed'
  | 'arriving_now'
  | 'in_flight'
  | 'scheduled'
  | 'picked_up'
  | 'ums';

const COLOR_FOR: Record<StatusColor, string> = {
  gray: colors.gray[700],
  blue: colors.blue,
  amber: colors.orange,
  orange: colors.orange,
  green: colors.green,
  red: colors.red,
};

const REFRESH_INTERVAL_MS = 60_000;

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso).getTime();
  if (Number.isNaN(date)) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - date) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
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

function dayBadge(iso: string, tz?: string | null): { label: string; tone: 'today' | 'tomorrow' | 'past' | 'future' } {
  const target = new Date(iso);
  const now = new Date();
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const targetDay = fmt(target);
  const todayDay = fmt(now);
  if (targetDay === todayDay) return { label: 'Today', tone: 'today' };

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (targetDay === fmt(tomorrow)) return { label: 'Tomorrow', tone: 'tomorrow' };

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (targetDay === fmt(yesterday)) return { label: 'Yesterday', tone: 'past' };

  const label = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: tz || undefined,
  }).format(target);
  return { label, tone: target.getTime() < now.getTime() ? 'past' : 'future' };
}

function PulseDot({ color }: { color: string }) {
  const opacity = React.useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity }} />;
}

function Avatar({ journey }: { journey: Journey }) {
  if (journey.participantHeadshotUrl) {
    return <Image source={{ uri: journey.participantHeadshotUrl }} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitials}>{getInitials(journey.participantName)}</Text>
    </View>
  );
}

function StatusPill({ journey }: { journey: Journey }) {
  const tint = COLOR_FOR[journey.statusColor] || colors.gray[700];
  const progress = journey.progress != null && journey.status === 'in_flight'
    ? ` · ${Math.round((journey.progress || 0) * 100)}%`
    : '';
  return (
    <View style={[styles.pill, { backgroundColor: tint + '1A' }]}>
      {journey.arrivingNow && journey.status === 'in_flight' && <PulseDot color={tint} />}
      <Text style={[styles.pillText, { color: tint }]}>
        {journey.statusLabel}
        {progress}
      </Text>
    </View>
  );
}

function DayBadge({ tone, label }: { tone: 'today' | 'tomorrow' | 'past' | 'future'; label: string }) {
  const map = {
    today: { bg: colors.green + '1A', fg: colors.green },
    tomorrow: { bg: colors.blue + '1A', fg: colors.blue },
    past: { bg: colors.gray[200], fg: colors.gray[600] },
    future: { bg: colors.orange + '1A', fg: colors.orange },
  } as const;
  return (
    <View style={[styles.dayBadge, { backgroundColor: map[tone].bg }]}>
      <Text style={[styles.dayBadgeText, { color: map[tone].fg }]}>{label}</Text>
    </View>
  );
}

function JourneyRow({ journey, onPress, selected }: { journey: Journey; onPress: () => void; selected?: boolean }) {
  const tz = journey.primaryTimezone || undefined;
  const eta = journey.primaryTimeIso ? formatTimeInZone(journey.primaryTimeIso, tz) : null;
  const day = journey.primaryTimeIso ? dayBadge(journey.primaryTimeIso, tz) : null;
  const wasScheduled =
    journey.isDelayed && journey.primaryScheduledIso
      ? formatTimeInZone(journey.primaryScheduledIso, tz)
      : null;

  const legs = journey.legs || [];
  const legChain: string[] = [];
  legs.forEach((leg, idx) => {
    if (idx === 0 && leg.origin) legChain.push(leg.origin);
    if (leg.destination) legChain.push(leg.destination);
  });

  return (
    <TouchableOpacity
      style={[styles.row, journey.isUnaccompaniedMinor && styles.rowUm, selected && styles.rowSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Avatar journey={journey} />

      <View style={styles.rowBody}>
        <View style={styles.rowTopLine}>
          <Text style={styles.name} numberOfLines={1}>
            {journey.participantName}
          </Text>
          {journey.isUnaccompaniedMinor && (
            <View style={styles.umBadge}>
              <Text style={styles.umBadgeText}>UM</Text>
            </View>
          )}
        </View>

        <View style={styles.statusLine}>
          <StatusPill journey={journey} />
          {journey.scannedIn && journey.status === 'picked_up' && (
            <Text style={styles.metaSubtle}>Checked in</Text>
          )}
          {journey.status === 'landed' && (
            <Text style={[styles.metaSubtle, { color: colors.orange }]}>Awaiting pickup</Text>
          )}
        </View>

        <View style={styles.route}>
          {legChain.map((code, idx) => (
            <React.Fragment key={`${code}-${idx}`}>
              {idx > 0 && <Text style={styles.routeSep}>→</Text>}
              <Text style={styles.routeCode}>{code}</Text>
            </React.Fragment>
          ))}
        </View>

        <View style={styles.flightCodes}>
          {legs.map((leg) => (
            <View key={leg.id} style={styles.flightChip}>
              <Text style={styles.flightChipText}>{leg.flightCode}</Text>
            </View>
          ))}
          {journey.legCount > 1 && <Text style={styles.metaSubtle}>{journey.legCount} legs</Text>}
        </View>

        {(journey.primaryTerminal || journey.primaryGate) && (
          <Text style={styles.terminal}>
            {journey.primaryTerminal ? `T${journey.primaryTerminal}` : '—'}
            {journey.primaryGate ? ` · Gate ${journey.primaryGate}` : ''}
          </Text>
        )}
      </View>

      <View style={styles.rowTiming}>
        {day && <DayBadge tone={day.tone} label={day.label} />}
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{eta || '--:--'}</Text>
          {journey.isDelayed && journey.delayMinutes > 0 && (
            <View style={styles.delayBadge}>
              <Text style={styles.delayBadgeText}>+{journey.delayMinutes}m</Text>
            </View>
          )}
        </View>
        {wasScheduled && <Text style={styles.wasText}>was {wasScheduled}</Text>}
        <Ionicons name="chevron-forward" size={14} color={colors.gray[400]} style={{ marginTop: 4 }} />
      </View>
    </TouchableOpacity>
  );
}

function buildChips(tab: AirportTab, counts: Record<string, number>): { id: ChipId; label: string; color: StatusColor; count: number; pulse?: boolean }[] {
  const c = (k: string) => counts[k] || 0;
  if (tab === 'inbound') {
    return [
      { id: 'all', label: 'All', color: 'gray', count: c('total') },
      { id: 'alerts', label: 'Alerts', color: 'red', count: c('alerts') },
      { id: 'landed', label: 'Landed waiting', color: 'amber', count: c('landed_waiting'), pulse: c('landed_waiting') > 0 },
      { id: 'arriving_now', label: 'Arriving <30m', color: 'red', count: c('arriving_now') },
      { id: 'in_flight', label: 'In flight', color: 'blue', count: c('in_flight') },
      { id: 'scheduled', label: 'Scheduled', color: 'gray', count: c('scheduled') },
      { id: 'picked_up', label: 'Picked up', color: 'green', count: c('picked_up') },
      { id: 'ums', label: 'UMs', color: 'red', count: c('ums') },
    ];
  }
  return [
    { id: 'all', label: 'All', color: 'gray', count: c('total') },
    { id: 'alerts', label: 'Alerts', color: 'red', count: c('alerts') },
    { id: 'scheduled', label: 'Scheduled', color: 'gray', count: c('scheduled') },
    { id: 'in_flight', label: 'Departed', color: 'blue', count: c('in_flight') },
    { id: 'landed', label: 'Arrived', color: 'green', count: c('landed_waiting') + c('picked_up') },
    { id: 'ums', label: 'UMs', color: 'red', count: c('ums') },
  ];
}

function journeyMatchesChip(j: Journey, chip: ChipId): boolean {
  switch (chip) {
    case 'all': return true;
    case 'alerts': return j.isAlert;
    case 'landed': return j.status === 'landed';
    case 'arriving_now': return j.arrivingNow && j.status !== 'picked_up';
    case 'in_flight': return j.status === 'in_flight';
    case 'scheduled': return j.status === 'scheduled';
    case 'picked_up': return j.status === 'picked_up';
    case 'ums': return j.isUnaccompaniedMinor;
  }
}

function AirportPicker({
  visible,
  airports,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  airports: string[];
  selected: string | null;
  onSelect: (a: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter by airport</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.gray[500]} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={[null, ...airports]}
            keyExtractor={(item) => item || 'all'}
            renderItem={({ item }) => {
              const isSelected = item === selected || (item === null && selected === null);
              return (
                <TouchableOpacity
                  style={[styles.airportOption, isSelected && styles.airportOptionSelected]}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <Text style={[styles.airportOptionText, isSelected && { color: colors.blue }]}>
                    {item || 'All airports'}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={20} color={colors.blue} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function AirportModeScreen() {
  const { state } = useApp();
  const navigation = useNavigation<NavigationProp>();
  const { useSplitView } = useResponsiveLayout();
  const [tab, setTab] = useState<AirportTab>('inbound');
  const [data, setData] = useState<AirportModeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chip, setChip] = useState<ChipId>('all');
  const [airportFilter, setAirportFilter] = useState<string | null>(null);
  const [showAirportPicker, setShowAirportPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [tickKey, setTickKey] = useState(0);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedParticipant(null);
    setSelectedJourneyId(null);
  }, [state.currentEvent?.id]);

  const fetchData = useCallback(async (showRefresh = false, targetTab: AirportTab = tab) => {
    if (!state.currentEvent) return;
    if (showRefresh) setIsRefreshing(true);
    try {
      const result = await api.getAirportMode(state.currentEvent.id, targetTab);
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load airport data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [state.currentEvent, tab]);

  useEffect(() => {
    fetchData(false, tab);
    const interval = setInterval(() => fetchData(false, tab), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData, tab]);

  useEffect(() => {
    const i = setInterval(() => setTickKey((k) => k + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const handleJourneyPress = async (journey: Journey) => {
    if (!state.currentEvent) return;
    if (useSplitView) {
      setSelectedJourneyId(journey.id);
    }
    try {
      const participant = await api.getParticipant(state.currentEvent.id, journey.participantEventId);
      if (useSplitView) {
        setSelectedParticipant(participant);
      } else {
        navigation.navigate('ParticipantDetail', { participant });
      }
    } catch {
      Alert.alert('Error', 'Could not load participant details');
    }
  };

  const counts = data?.counts?.[tab] || {};
  const chips = useMemo(() => buildChips(tab, counts as Record<string, number>), [tab, counts]);

  const filteredJourneys = useMemo(() => {
    const journeys = data?.journeys || [];
    const needle = search.trim().toLowerCase();
    return journeys.filter((j) => {
      if (!journeyMatchesChip(j, chip)) return false;
      if (airportFilter && j.primaryAirport !== airportFilter) return false;
      if (needle) {
        const legs = j.legs || [];
        const blob = [
          j.participantName,
          j.participantFullName,
          ...legs.map((l) => l.flightCode),
          ...legs.map((l) => l.origin),
          ...legs.map((l) => l.destination),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!blob.includes(needle)) return false;
      }
      return true;
    });
  }, [data?.journeys, chip, airportFilter, search]);

  const sections = useMemo(() => {
    const groups = new Map<string, Journey[]>();
    for (const j of filteredJourneys) {
      const key = j.primaryAirport || '—';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(j);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([airport, items]) => ({ title: airport, data: items }));
  }, [filteredJourneys]);

  const lastRefreshLabel = useMemo(
    () => (data?.last_refreshed_at ? relativeTime(data.last_refreshed_at) : null),
    // tickKey makes this recompute periodically
    [data?.last_refreshed_at, tickKey],
  );

  const inboundTotal = data?.counts?.inbound?.total ?? 0;
  const outboundTotal = data?.counts?.outbound?.total ?? 0;

  if (!state.currentEvent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Event Selected</Text>
          <Text style={styles.emptyText}>Please select an event from the Events tab.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.blue} />
          <Text style={styles.loadingText}>Loading flights...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.red} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchData()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sidebar = (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="airplane" size={24} color={colors.red} />
            <Text style={styles.headerTitle}>Airport Mode</Text>
          </View>
          <TouchableOpacity style={styles.refreshPill} onPress={() => fetchData(true)} disabled={isRefreshing}>
            {isRefreshing ? (
              <ActivityIndicator size="small" color={colors.red} />
            ) : (
              <Ionicons name="refresh" size={16} color={colors.red} />
            )}
            <Text style={styles.refreshPillText}>
              {lastRefreshLabel ? `Updated ${lastRefreshLabel}` : 'Refresh'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSubtitle}>{state.currentEvent.name}</Text>
      </View>

      <View style={styles.tabs}>
        {([
          { id: 'inbound' as const, label: 'Inbound', count: inboundTotal },
          { id: 'outbound' as const, label: 'Outbound', count: outboundTotal },
        ]).map((t) => {
          const active = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => { setTab(t.id); setChip('all'); }}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
              <View style={[styles.tabCount, active && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.controlBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {chips.map((c) => {
            const active = chip === c.id;
            const tint = COLOR_FOR[c.color];
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => setChip(c.id)}
                style={[
                  styles.chip,
                  active
                    ? { backgroundColor: tint, borderColor: tint }
                    : { backgroundColor: colors.white, borderColor: colors.gray[300] },
                ]}
              >
                {c.pulse && !active && <PulseDot color={tint} />}
                <Text style={[styles.chipText, { color: active ? colors.white : tint }]}>{c.label}</Text>
                <Text style={[styles.chipCount, { color: active ? colors.white : colors.gray[500] }]}>({c.count})</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.gray[400]} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search name, flight, airport"
              placeholderTextColor={colors.gray[400]}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="characters"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          {(data?.airports.length ?? 0) > 1 && (
            <TouchableOpacity
              style={[styles.airportButton, airportFilter && styles.airportButtonActive]}
              onPress={() => setShowAirportPicker(true)}
            >
              <Ionicons name="location" size={14} color={airportFilter ? colors.white : colors.blue} />
              <Text style={[styles.airportButtonText, airportFilter && { color: colors.white }]}>
                {airportFilter || 'All'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={airportFilter ? colors.white : colors.blue} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <AirportPicker
        visible={showAirportPicker}
        airports={data?.airports || []}
        selected={airportFilter}
        onSelect={setAirportFilter}
        onClose={() => setShowAirportPicker(false)}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <JourneyRow
            journey={item}
            onPress={() => handleJourneyPress(item)}
            selected={useSplitView && selectedJourneyId === item.id}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Ionicons name="location-outline" size={14} color={colors.gray[500]} />
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="airplane-outline" size={48} color={colors.gray[300]} />
            <Text style={styles.emptyTitle}>No flights match</Text>
            <Text style={styles.emptyText}>
              Try a different chip, clear the airport filter, or change tab.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchData(true)}
            tintColor={colors.red}
          />
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={sections.length === 0 ? styles.emptyList : styles.listContent}
      />
    </View>
  );

  if (useSplitView) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <SplitView
          sidebar={sidebar}
          detail={selectedParticipant ? (
            <ParticipantDetailContent
              participant={selectedParticipant}
              topInset={16}
              bottomInset={100}
            />
          ) : null}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {sidebar}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text.primary },
  headerSubtitle: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  refreshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.red + '12',
    borderRadius: 16,
  },
  refreshPillText: { color: colors.red, fontWeight: '600', fontSize: 12 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    paddingHorizontal: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.red },
  tabLabel: { fontSize: 14, fontWeight: '600', color: colors.gray[500] },
  tabLabelActive: { color: colors.red },
  tabCount: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 9,
    backgroundColor: colors.gray[100],
    minWidth: 22,
    alignItems: 'center',
  },
  tabCountActive: { backgroundColor: colors.red + '1A' },
  tabCountText: { fontSize: 11, fontWeight: '700', color: colors.gray[600] },
  tabCountTextActive: { color: colors.red },

  controlBar: {
    backgroundColor: colors.white,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    gap: 10,
  },
  chipRow: {
    paddingHorizontal: 12,
    gap: 6,
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipCount: { fontSize: 11, fontWeight: '600' },

  searchRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text.primary, padding: 0 },
  airportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.blue + '12',
    borderWidth: 1,
    borderColor: colors.blue + '30',
  },
  airportButtonActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  airportButtonText: { fontSize: 12, fontWeight: '600', color: colors.blue },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.gray[100],
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.text.primary, fontVariant: ['tabular-nums'] },
  sectionCount: { fontSize: 11, color: colors.gray[500], marginLeft: 'auto' },

  row: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
    gap: 12,
  },
  rowUm: { borderLeftWidth: 3, borderLeftColor: colors.red },
  rowSelected: { backgroundColor: colors.red + '0A', borderLeftWidth: 3, borderLeftColor: colors.red },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gray[200] },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 14, fontWeight: '700', color: colors.gray[600] },

  rowBody: { flex: 1, gap: 4 },
  rowTopLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text.primary, flexShrink: 1 },
  umBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: colors.red },
  umBadgeText: { fontSize: 9, fontWeight: '800', color: colors.white, letterSpacing: 0.5 },

  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  pillText: { fontSize: 11, fontWeight: '700' },
  metaSubtle: { fontSize: 11, color: colors.gray[500] },

  route: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  routeCode: { fontSize: 13, fontWeight: '600', color: colors.text.primary, fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  routeSep: { fontSize: 13, color: colors.gray[300] },

  flightCodes: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  flightChip: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.gray[100] },
  flightChipText: { fontSize: 10, fontWeight: '600', color: colors.gray[700], fontVariant: ['tabular-nums'] },
  terminal: { fontSize: 11, color: colors.gray[500], marginTop: 2 },

  rowTiming: { alignItems: 'flex-end', minWidth: 64 },
  dayBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginBottom: 2 },
  dayBadgeText: { fontSize: 10, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  timeText: { fontSize: 18, fontWeight: '700', color: colors.text.primary, fontVariant: ['tabular-nums'] },
  delayBadge: { backgroundColor: colors.red + '1A', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  delayBadgeText: { fontSize: 10, fontWeight: '800', color: colors.red },
  wasText: { fontSize: 11, color: colors.gray[400], textDecorationLine: 'line-through' },

  listContent: { paddingBottom: 100 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, paddingTop: 80 },
  emptyList: { flexGrow: 1 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text.primary, marginTop: 16, marginBottom: 6 },
  emptyText: { fontSize: 13, color: colors.text.secondary, textAlign: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: colors.text.secondary },
  errorText: { marginTop: 12, fontSize: 14, color: colors.red, textAlign: 'center' },
  retryButton: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.red, borderRadius: 8 },
  retryButtonText: { color: colors.white, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalContent: { backgroundColor: colors.white, borderRadius: 16, width: '100%', maxHeight: '70%', overflow: 'hidden' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.text.primary },
  airportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  airportOptionSelected: { backgroundColor: colors.blue + '10' },
  airportOptionText: { fontSize: 15, color: colors.text.primary, fontWeight: '500', flex: 1 },
});
