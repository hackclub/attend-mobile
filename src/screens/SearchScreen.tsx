import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
import { useEventAccess } from '../hooks/useEventAccess';
import { useParticipants } from '../hooks/useParticipants';
import { useParticipantViews } from '../hooks/useParticipantViews';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { ParticipantRow } from '../components/ParticipantRow';
import { SplitView } from '../components/SplitView';
import { FilterSheet } from '../components/FilterSheet';
import { ParticipantDetailContent } from './ParticipantDetailContent';
import { api } from '../services/api';
import { colors } from '../theme/colors';
import { ScreenHeader, SearchField, ui } from '../components/ui';
import {
  applyFilters,
  applySort,
  getField,
  getSortField,
  ruleIsComplete,
  operatorNeedsValue,
  OPERATOR_LABELS,
  type FilterContext,
  type SavedView,
} from '../services/participantFilters';
import type { RootStackParamList, Participant, ScanContext } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SearchScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { useSplitView } = useResponsiveLayout();
  const { canViewParticipantRecords, roleLabel } = useEventAccess();
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
  const {
    rules,
    setRules,
    conjunction,
    setConjunction,
    sort,
    setSort,
    savedViews,
    allViews,
    activeViewId,
    applyView,
    saveView,
    deleteView,
  } = useParticipantViews(currentEvent?.id);
  const [inputValue, setInputValue] = useState('');
  const [scanContexts, setScanContexts] = useState<ScanContext[]>([]);
  const [isFilterSheetVisible, setIsFilterSheetVisible] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);

  useEffect(() => {
    setSelectedParticipant(null);
  }, [currentEvent?.id]);

  // Load scan contexts when event changes (used for the "Scanned At" filter field)
  useEffect(() => {
    async function loadContexts() {
      if (!currentEvent) {
        setScanContexts([]);
        return;
      }

      try {
        const contexts = await api.getScanContexts(currentEvent.id);
        setScanContexts(contexts);
      } catch (error) {
        console.error('Failed to load scan contexts:', error);
        setScanContexts([]);
      }
    }

    loadContexts();
  }, [currentEvent?.id]);

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
    if (useSplitView) {
      setSelectedParticipant(participant);
    } else {
      navigation.navigate('ParticipantDetail', { participant });
    }
  };

  const baseParticipants = searchResults ?? participants;

  // Options (status, diet, etc.) derive from the full roster, not the current search subset
  const filterContext = useMemo<FilterContext>(
    () => ({ scanContexts, participants }),
    [scanContexts, participants],
  );

  const activeRules = useMemo(() => rules.filter(ruleIsComplete), [rules]);

  // Match the old behavior: filtering to checked-in sorts newest check-in first unless
  // the user picked an explicit sort
  const effectiveSort = useMemo(() => {
    if (sort) return sort;
    const filtersToCheckedIn = activeRules.some(
      r => r.field === 'checked_in' && r.operator === 'is_true',
    );
    return filtersToCheckedIn ? { field: 'checked_in_at', direction: 'desc' as const } : null;
  }, [sort, activeRules]);

  const filteredParticipants = useMemo(
    () => applySort(applyFilters(baseParticipants, rules, conjunction, filterContext), effectiveSort),
    [baseParticipants, rules, conjunction, effectiveSort, filterContext],
  );

  const viewCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const view of allViews) {
      counts[view.id] = applyFilters(baseParticipants, view.rules, view.conjunction, filterContext).length;
    }
    return counts;
  }, [allViews, baseParticipants, filterContext]);

  const handleViewPress = useCallback(
    (view: SavedView) => {
      applyView(view);
    },
    [applyView],
  );

  const removeRule = useCallback(
    (ruleId: string) => {
      setRules(rules.filter(r => r.id !== ruleId));
    },
    [rules, setRules],
  );

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

  // The tab is hidden for these roles, but a deep link (attend://search) or a
  // stale navigation state can still land here. Explain it rather than showing
  // an empty roster that pull-to-refresh will never fill.
  if (!canViewParticipantRecords) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Participants" subtitle={currentEvent.name} />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={42} color={colors.gray[400]} />
          <Text style={styles.emptyTitle}>Participant records unavailable</Text>
          <Text style={styles.emptyText}>
            {roleLabel
              ? `Your role on this event (${roleLabel}) doesn't include participant records.`
              : "Your role on this event doesn't include participant records."}
          </Text>
          <Text style={styles.emptyText}>
            You can still scan attendees in and use the travel calendar.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasActiveFilters = activeRules.length > 0 || sort !== null;

  const sidebar = (
    <View style={styles.container}>
      <ScreenHeader title="Participants" subtitle={currentEvent.name} />

      <SearchField
        value={inputValue}
        onChangeText={handleSearch}
        onClear={handleClear}
        placeholder="Search by name or email"
      />

      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          {allViews.map(view => (
            <ViewChip
              key={view.id}
              label={view.name}
              count={viewCounts[view.id] ?? 0}
              isActive={activeViewId === view.id}
              isSaved={savedViews.some(v => v.id === view.id)}
              onPress={() => handleViewPress(view)}
            />
          ))}
        </ScrollView>

        <View style={styles.filterSpacer} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          <TouchableOpacity
            style={[styles.toolButton, hasActiveFilters && styles.toolButtonActive]}
            onPress={() => setIsFilterSheetVisible(true)}
          >
            <Ionicons
              name="funnel-outline"
              size={15}
              color={hasActiveFilters ? colors.red : colors.text.secondary}
            />
            <Text style={[styles.toolButtonText, hasActiveFilters && styles.toolButtonTextActive]}>
              Filter{activeRules.length > 0 ? ` · ${activeRules.length}` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolButton, sort && styles.toolButtonActive]}
            onPress={() => setIsFilterSheetVisible(true)}
          >
            <Ionicons
              name="swap-vertical"
              size={15}
              color={sort ? colors.red : colors.text.secondary}
            />
            <Text style={[styles.toolButtonText, sort && styles.toolButtonTextActive]}>
              {sort
                ? `${getSortField(sort.field)?.label ?? 'Sort'} ${sort.direction === 'asc' ? '↑' : '↓'}`
                : 'Sort'}
            </Text>
          </TouchableOpacity>

          {activeRules.map(rule => {
            const field = getField(rule.field);
            if (!field) return null;
            const valueLabel = operatorNeedsValue(rule.operator)
              ? field.getOptions?.(filterContext).find(o => o.value === rule.value)?.label ?? rule.value
              : null;
            return (
              <TouchableOpacity
                key={rule.id}
                style={styles.ruleChip}
                onPress={() => removeRule(rule.id)}
              >
                <Text style={styles.ruleChipText} numberOfLines={1}>
                  {field.label} {OPERATOR_LABELS[rule.operator]}
                  {valueLabel ? ` ${valueLabel}` : ''}
                </Text>
                <Ionicons name="close" size={14} color={colors.red} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isSearching && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.red} />
        </View>
      )}

      <FlatList
        data={filteredParticipants}
        renderItem={({ item }) => (
          <ParticipantRow
            participant={item}
            onPress={() => handleParticipantPress(item)}
            selected={useSplitView && selectedParticipant?.participant_event_id === item.participant_event_id}
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
            ) : activeRules.length > 0 ? (
              <>
                <Text style={styles.emptyTitle}>No Participants</Text>
                <Text style={styles.emptyText}>
                  No participants match the current filters
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
        contentContainerStyle={filteredParticipants.length === 0 ? styles.emptyList : styles.listContent}
      />

      <FilterSheet
        visible={isFilterSheetVisible}
        onClose={() => setIsFilterSheetVisible(false)}
        rules={rules}
        onRulesChange={setRules}
        conjunction={conjunction}
        onConjunctionChange={setConjunction}
        sort={sort}
        onSortChange={setSort}
        savedViews={savedViews}
        onSaveView={saveView}
        onDeleteView={deleteView}
        filterContext={filterContext}
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

interface ViewChipProps {
  label: string;
  count: number;
  isActive: boolean;
  isSaved: boolean;
  onPress: () => void;
}

function ViewChip({ label, count, isActive, isSaved, onPress }: ViewChipProps) {
  return (
    <TouchableOpacity
      style={[ui.chip, isActive && ui.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      {isSaved && (
        <Ionicons name="bookmark" size={12} color={isActive ? colors.white : colors.gray[400]} />
      )}
      <Text style={[ui.chipText, isActive && ui.chipTextActive]}>{label}</Text>
      <View style={[ui.chipBadge, isActive && ui.chipBadgeActive]}>
        <Text style={[ui.chipBadgeText, isActive && ui.chipBadgeTextActive]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filtersContainer: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  filtersScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterSpacer: {
    height: 8,
  },
  toolButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[300],
    backgroundColor: colors.white,
  },
  toolButtonActive: {
    borderColor: colors.red,
    backgroundColor: colors.red + '10',
  },
  toolButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
  },
  toolButtonTextActive: {
    color: colors.red,
  },
  ruleChip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.red + '55',
    backgroundColor: colors.red + '10',
    maxWidth: 240,
  },
  ruleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.red,
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
    gap: 10,
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
    maxWidth: 300,
    lineHeight: 20,
  },
});
