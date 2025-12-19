import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Keyboard,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useParticipants } from '../hooks/useParticipants';
import { ParticipantRow } from '../components/ParticipantRow';
import { colors } from '../theme/colors';
import type { RootStackParamList, Participant } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type StatusFilter = 'all' | 'checked-in' | 'not-checked-in';
type TravelFilter = 'any' | 'plane' | 'train' | 'car' | 'bus' | 'other' | 'none';

export function SearchScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    search,
    clearSearch,
    searchQuery,
    searchResults,
    isSearching,
    currentEvent,
    participants,
    isRefreshing,
    refresh,
  } = useParticipants();
  const [inputValue, setInputValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [travelFilter, setTravelFilter] = useState<TravelFilter>('any');

  const handleSearch = useCallback((text: string) => {
    setInputValue(text);
    if (text.length >= 2) {
      search(text);
    } else if (text.length === 0) {
      clearSearch();
    }
  }, [search, clearSearch]);

  const handleClear = useCallback(() => {
    setInputValue('');
    clearSearch();
    Keyboard.dismiss();
  }, [clearSearch]);

  const handleParticipantPress = (participant: Participant) => {
    navigation.navigate('ParticipantDetail', { participant });
  };

  const baseParticipants = searchResults ?? participants;

  const filteredParticipants = useMemo(() => {
    let result = baseParticipants;

    // Apply status filter
    if (statusFilter === 'checked-in') {
      result = result.filter(p => !!p.checked_in_at);
    } else if (statusFilter === 'not-checked-in') {
      result = result.filter(p => !p.checked_in_at);
    }

    // Apply travel filter
    if (travelFilter !== 'any') {
      if (travelFilter === 'none') {
        result = result.filter(p => !p.travel_inbound);
      } else {
        result = result.filter(p => p.travel_inbound?.mode === travelFilter);
      }
    }

    return result;
  }, [baseParticipants, statusFilter, travelFilter]);

  const sortedParticipants = useMemo(() => {
    if (statusFilter === 'checked-in') {
      return [...filteredParticipants].sort((a, b) => {
        const aTime = a.checked_in_at ? new Date(a.checked_in_at).getTime() : 0;
        const bTime = b.checked_in_at ? new Date(b.checked_in_at).getTime() : 0;
        return bTime - aTime;
      });
    }
    return filteredParticipants;
  }, [filteredParticipants, statusFilter]);

  const statusCounts = useMemo(() => {
    const all = baseParticipants.length;
    const checkedIn = baseParticipants.filter(p => !!p.checked_in_at).length;
    const notCheckedIn = all - checkedIn;
    return { all, checkedIn, notCheckedIn };
  }, [baseParticipants]);

  const travelCounts = useMemo(() => {
    const any = baseParticipants.length;
    const plane = baseParticipants.filter(p => p.travel_inbound?.mode === 'plane').length;
    const train = baseParticipants.filter(p => p.travel_inbound?.mode === 'train').length;
    const car = baseParticipants.filter(p => p.travel_inbound?.mode === 'car').length;
    const bus = baseParticipants.filter(p => p.travel_inbound?.mode === 'bus').length;
    const other = baseParticipants.filter(p => p.travel_inbound?.mode === 'other').length;
    const none = baseParticipants.filter(p => !p.travel_inbound).length;
    return { any, plane, train, car, bus, other, none };
  }, [baseParticipants]);

  if (!currentEvent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Event Selected</Text>
          <Text style={styles.emptyText}>
            Please select an event from the Events tab.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Participants</Text>
        <Text style={styles.headerSubtitle}>{currentEvent.name}</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={colors.text.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email..."
            placeholderTextColor={colors.text.muted}
            value={inputValue}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {inputValue.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color={colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          <FilterChip
            label="All"
            count={statusCounts.all}
            isActive={statusFilter === 'all'}
            onPress={() => setStatusFilter('all')}
          />
          <FilterChip
            label="Checked In"
            count={statusCounts.checkedIn}
            isActive={statusFilter === 'checked-in'}
            onPress={() => setStatusFilter('checked-in')}
            color={colors.green}
          />
          <FilterChip
            label="Not Checked In"
            count={statusCounts.notCheckedIn}
            isActive={statusFilter === 'not-checked-in'}
            onPress={() => setStatusFilter('not-checked-in')}
            color={colors.orange}
          />
        </ScrollView>

        <View style={styles.filterSpacer} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          <FilterChip
            label="Any Travel"
            count={travelCounts.any}
            isActive={travelFilter === 'any'}
            onPress={() => setTravelFilter('any')}
          />
          <FilterChip
            label="✈️ Plane"
            count={travelCounts.plane}
            isActive={travelFilter === 'plane'}
            onPress={() => setTravelFilter('plane')}
            color={colors.blue}
          />
          <FilterChip
            label="🚂 Train"
            count={travelCounts.train}
            isActive={travelFilter === 'train'}
            onPress={() => setTravelFilter('train')}
            color={colors.purple}
          />
          <FilterChip
            label="🚗 Car"
            count={travelCounts.car}
            isActive={travelFilter === 'car'}
            onPress={() => setTravelFilter('car')}
            color={colors.teal}
          />
          <FilterChip
            label="🚌 Bus"
            count={travelCounts.bus}
            isActive={travelFilter === 'bus'}
            onPress={() => setTravelFilter('bus')}
            color={colors.yellow}
          />
          <FilterChip
            label="Other"
            count={travelCounts.other}
            isActive={travelFilter === 'other'}
            onPress={() => setTravelFilter('other')}
            color={colors.gray[500]}
          />
          <FilterChip
            label="No Travel"
            count={travelCounts.none}
            isActive={travelFilter === 'none'}
            onPress={() => setTravelFilter('none')}
            color={colors.gray[400]}
          />
        </ScrollView>
      </View>

      {isSearching && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.red} />
        </View>
      )}

      <FlatList
        data={sortedParticipants}
        renderItem={({ item }) => (
          <ParticipantRow
            participant={item}
            onPress={() => handleParticipantPress(item)}
          />
        )}
        keyExtractor={(item, index) => item.participant_id || item.participant_event_id || `item-${index}`}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={colors.red}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {searchQuery.length >= 2 ? (
              <>
                <Text style={styles.emptyTitle}>No Results</Text>
                <Text style={styles.emptyText}>
                  No participants found matching "{searchQuery}"
                </Text>
              </>
            ) : searchQuery.length > 0 ? (
              <Text style={styles.emptyText}>
                Type at least 2 characters to search
              </Text>
            ) : (statusFilter !== 'all' || travelFilter !== 'any') ? (
              <>
                <Text style={styles.emptyTitle}>No Participants</Text>
                <Text style={styles.emptyText}>
                  No participants match the selected filters
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>No Participants</Text>
                <Text style={styles.emptyText}>
                  Pull to refresh or search by name/email
                </Text>
              </>
            )}
          </View>
        }
        contentContainerStyle={sortedParticipants.length === 0 ? styles.emptyList : styles.listContent}
      />
    </SafeAreaView>
  );
}

interface FilterChipProps {
  label: string;
  count: number;
  isActive: boolean;
  onPress: () => void;
  color?: string;
}

function FilterChip({ label, count, isActive, onPress, color }: FilterChipProps) {
  const activeColor = color || colors.red;
  
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        isActive && { backgroundColor: activeColor + '15', borderColor: activeColor },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.filterChipText,
          isActive && { color: activeColor },
        ]}
      >
        {label}
      </Text>
      <View style={[styles.filterChipCount, isActive && { backgroundColor: activeColor }]}>
        <Text style={[styles.filterChipCountText, isActive && { color: colors.white }]}>
          {count}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 2,
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 12,
    backgroundColor: colors.white,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text.primary,
  },
  clearButton: {
    padding: 8,
  },
  filtersContainer: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    paddingBottom: 12,
  },
  filtersScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterSpacer: {
    height: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.gray[300],
    backgroundColor: colors.white,
    gap: 6,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  filterChipCount: {
    backgroundColor: colors.gray[200],
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  filterChipCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    paddingTop: 64,
  },
  emptyList: {
    flexGrow: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
