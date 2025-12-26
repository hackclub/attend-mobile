import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { colors } from '../theme/colors';
import type { AirportModeData, Flight, FlightAlert, FlightSection, RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function getStatusColor(status?: string): string {
  switch (status?.toLowerCase()) {
    case 'arrived':
      return colors.green;
    case 'departed':
    case 'enroute':
      return colors.blue;
    case 'delayed':
      return colors.orange;
    case 'cancelled':
      return colors.red;
    case 'diverted':
      return colors.purple;
    default:
      return colors.gray[500];
  }
}

function FlightRow({ flight, onPress }: { flight: Flight; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.flightRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.flightInfo}>
        <View style={styles.flightHeader}>
          <Text style={styles.flightCode}>{flight.flightCode}</Text>
          {flight.isUnaccompaniedMinor && (
            <View style={styles.umBadge}>
              <Text style={styles.umBadgeText}>UM</Text>
            </View>
          )}
          {flight.status && (
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(flight.status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(flight.status) }]}>
                {flight.status}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.participantName}>{flight.participantName}</Text>
        <View style={styles.routeRow}>
          <Text style={styles.airport}>{flight.origin}</Text>
          <Ionicons name="airplane" size={14} color={colors.gray[400]} style={styles.planeIcon} />
          <Text style={styles.airport}>{flight.destination}</Text>
        </View>
      </View>
      <View style={styles.flightTiming}>
        <Text style={styles.etaLabel}>ETA</Text>
        <Text style={styles.etaTime}>{flight.eta || '--:--'}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} style={styles.chevron} />
      </View>
    </TouchableOpacity>
  );
}

function StatCard({ label, value, color, onPress, isActive }: { label: string; value: number; color: string; onPress?: () => void; isActive?: boolean }) {
  return (
    <TouchableOpacity 
      style={[styles.statCard, isActive && { borderColor: color, borderWidth: 2 }]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function AlertRow({ alert }: { alert: FlightAlert }) {
  const alertColors = {
    delayed: { bg: colors.orange + '15', text: colors.orange },
    cancelled: { bg: colors.red + '15', text: colors.red },
    diverted: { bg: colors.purple + '15', text: colors.purple },
  };

  return (
    <View style={[styles.alertRow, { backgroundColor: alertColors[alert.type].bg }]}>
      <View style={[styles.alertBadge, { backgroundColor: alertColors[alert.type].text + '20' }]}>
        <Text style={[styles.alertBadgeText, { color: alertColors[alert.type].text }]}>
          {alert.type.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.alertFlightCode}>{alert.flightCode}</Text>
      <Text style={styles.alertParticipant} numberOfLines={1}>{alert.participantName}</Text>
    </View>
  );
}

type FilterType = 'all' | 'inbound' | 'in_flight' | 'arriving' | 'waiting' | 'checked_in';

const FILTER_SECTION_MAP: Record<FilterType, string[]> = {
  all: [],
  inbound: [],
  in_flight: ['Arriving Now', 'Arriving Soon', 'Arriving Later'],
  arriving: ['Arriving Now', 'Arriving Soon'],
  waiting: ['Landed (Awaiting Pickup)'],
  checked_in: ['Checked In'],
};

function AirportPickerModal({
  visible,
  airports,
  selectedAirport,
  onSelect,
  onClose,
}: {
  visible: boolean;
  airports: { code: string; count: number }[];
  selectedAirport: string | null;
  onSelect: (airport: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter by Destination</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.gray[500]} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={[{ code: null, count: airports.reduce((sum, a) => sum + a.count, 0) }, ...airports]}
            keyExtractor={(item) => item.code || 'all'}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.airportOption,
                  (item.code === selectedAirport || (item.code === null && selectedAirport === null)) && styles.airportOptionSelected,
                ]}
                onPress={() => {
                  onSelect(item.code);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.airportOptionText,
                    (item.code === selectedAirport || (item.code === null && selectedAirport === null)) && styles.airportOptionTextSelected,
                  ]}
                >
                  {item.code || 'All airports'}
                </Text>
                <Text style={styles.airportOptionCount}>({item.count})</Text>
                {(item.code === selectedAirport || (item.code === null && selectedAirport === null)) && (
                  <Ionicons name="checkmark" size={20} color={colors.blue} style={styles.checkmark} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function AirportModeScreen() {
  const { state } = useApp();
  const navigation = useNavigation<NavigationProp>();
  const [data, setData] = useState<AirportModeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [destinationFilter, setDestinationFilter] = useState<string | null>(null);
  const [showAirportPicker, setShowAirportPicker] = useState(false);

  const fetchData = useCallback(async (showRefresh = false) => {
    if (!state.currentEvent) return;

    if (showRefresh) {
      setIsRefreshing(true);
    }

    try {
      const result = await api.getAirportMode(state.currentEvent.id);
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load airport data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [state.currentEvent]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = () => fetchData(true);

  const handleFilterPress = (newFilter: FilterType) => {
    setFilter(filter === newFilter ? 'all' : newFilter);
  };

  const handleFlightPress = async (flight: Flight) => {
    if (!state.currentEvent) return;
    
    try {
      const participant = await api.getParticipant(state.currentEvent.id, flight.participantEventId);
      navigation.navigate('ParticipantDetail', { participant });
    } catch (e) {
      Alert.alert('Error', 'Could not load participant details');
    }
  };

  const allSections: FlightSection[] = data?.sections || [];

  const destinationAirports = useMemo(() => {
    const airportCounts = new Map<string, number>();
    for (const section of allSections) {
      for (const flight of section.data) {
        if (flight.destination) {
          airportCounts.set(flight.destination, (airportCounts.get(flight.destination) || 0) + 1);
        }
      }
    }
    return Array.from(airportCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [allSections]);

  const sectionsFilteredByStatus = filter === 'all' || filter === 'inbound'
    ? allSections
    : allSections.filter(s => FILTER_SECTION_MAP[filter].includes(s.title));

  const sections = useMemo(() => {
    if (!destinationFilter) return sectionsFilteredByStatus;
    return sectionsFilteredByStatus
      .map(section => ({
        ...section,
        data: section.data.filter(flight => flight.destination === destinationFilter),
      }))
      .filter(section => section.data.length > 0);
  }, [sectionsFilteredByStatus, destinationFilter]);

  const filteredAlerts = useMemo(() => {
    if (!data?.alerts) return [];
    if (!destinationFilter) return data.alerts;
    return data.alerts.filter(alert => alert.destination === destinationFilter);
  }, [data?.alerts, destinationFilter]);

  const hasAlerts = filteredAlerts.length > 0;

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="airplane" size={24} color={colors.blue} />
            <Text style={styles.headerTitle}>Airport Mode</Text>
          </View>
          {destinationAirports.length > 1 && (
            <TouchableOpacity
              style={[styles.airportFilterButton, destinationFilter && styles.airportFilterButtonActive]}
              onPress={() => setShowAirportPicker(true)}
            >
              <Ionicons name="location" size={16} color={destinationFilter ? colors.white : colors.blue} />
              <Text style={[styles.airportFilterButtonText, destinationFilter && styles.airportFilterButtonTextActive]}>
                {destinationFilter || 'All'}
              </Text>
              <Ionicons name="chevron-down" size={14} color={destinationFilter ? colors.white : colors.blue} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.headerSubtitle}>{state.currentEvent.name}</Text>
      </View>

      <AirportPickerModal
        visible={showAirportPicker}
        airports={destinationAirports}
        selectedAirport={destinationFilter}
        onSelect={setDestinationFilter}
        onClose={() => setShowAirportPicker(false)}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FlightRow flight={item} onPress={() => handleFlightPress(item)} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        ListHeaderComponent={
          <>
            {data && (
              <View style={styles.statsRow}>
                <StatCard label="Inbound" value={data.stats.inbound} color={colors.gray[700]} onPress={() => handleFilterPress('inbound')} isActive={filter === 'inbound'} />
                <StatCard label="In Flight" value={data.stats.in_flight} color={colors.blue} onPress={() => handleFilterPress('in_flight')} isActive={filter === 'in_flight'} />
                <StatCard label="Arriving" value={data.stats.arriving} color={colors.orange} onPress={() => handleFilterPress('arriving')} isActive={filter === 'arriving'} />
                <StatCard label="Waiting" value={data.stats.waiting} color={colors.orange} onPress={() => handleFilterPress('waiting')} isActive={filter === 'waiting'} />
                <StatCard label="Checked In" value={data.stats.checked_in} color={colors.green} onPress={() => handleFilterPress('checked_in')} isActive={filter === 'checked_in'} />
              </View>
            )}
            {(filter !== 'all' || destinationFilter) && (
              <TouchableOpacity style={styles.clearFilter} onPress={() => { setFilter('all'); setDestinationFilter(null); }}>
                <Text style={styles.clearFilterText}>Clear filter{destinationFilter ? ` (${destinationFilter})` : ''}</Text>
                <Ionicons name="close-circle" size={16} color={colors.gray[500]} />
              </TouchableOpacity>
            )}

            {hasAlerts && (
              <View style={styles.alertsContainer}>
                <View style={styles.alertsHeader}>
                  <Ionicons name="warning" size={18} color={colors.red} />
                  <Text style={styles.alertsTitle}>Flight Alerts</Text>
                </View>
                {filteredAlerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="airplane-outline" size={48} color={colors.gray[300]} />
            <Text style={styles.emptyTitle}>No Flights to Track</Text>
            <Text style={styles.emptyText}>
              There are no inbound flights for this event.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.blue}
          />
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={sections.length === 0 ? styles.emptyList : styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  airportFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.blue + '15',
    borderWidth: 1,
    borderColor: colors.blue + '30',
  },
  airportFilterButtonActive: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  airportFilterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.blue,
  },
  airportFilterButtonTextActive: {
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 100,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  statCard: {
    width: '31%',
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 9,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    marginTop: 4,
    textAlign: 'center',
  },
  clearFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  clearFilterText: {
    fontSize: 14,
    color: colors.gray[500],
  },
  alertsContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: colors.red + '08',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.red + '20',
    padding: 12,
  },
  alertsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  alertsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.red,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
    gap: 10,
  },
  alertBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  alertBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  alertFlightCode: {
    fontWeight: '600',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
    color: colors.text.primary,
  },
  alertParticipant: {
    flex: 1,
    fontSize: 14,
    color: colors.text.secondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.gray[100],
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  flightRow: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  flightInfo: {
    flex: 1,
  },
  flightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flightCode: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
    color: colors.text.primary,
  },
  umBadge: {
    backgroundColor: colors.orange + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  umBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.orange,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  participantName: {
    fontSize: 14,
    color: colors.text.primary,
    marginTop: 4,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  airport: {
    fontSize: 13,
    color: colors.text.secondary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  planeIcon: {
    marginHorizontal: 6,
  },
  flightTiming: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  etaLabel: {
    fontSize: 10,
    color: colors.text.muted,
    textTransform: 'uppercase',
  },
  etaTime: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  chevron: {
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    paddingTop: 80,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.text.secondary,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.red,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: colors.blue,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 16,
    width: '100%',
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  airportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  airportOptionSelected: {
    backgroundColor: colors.blue + '10',
  },
  airportOptionText: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '500',
  },
  airportOptionTextSelected: {
    color: colors.blue,
  },
  airportOptionCount: {
    fontSize: 14,
    color: colors.text.secondary,
    marginLeft: 6,
  },
  checkmark: {
    marginLeft: 'auto',
  },
});
