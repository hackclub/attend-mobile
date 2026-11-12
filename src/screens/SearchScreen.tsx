import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEventAccess } from '../hooks/useEventAccess';
import { useParticipants } from '../hooks/useParticipants';
import { useParticipantViews } from '../hooks/useParticipantViews';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { ParticipantRow } from '../components/ParticipantRow';
import { SplitView } from '../components/SplitView';
import { filterSheet } from '../navigation/sheetData';
import { useOpenSheet } from '../navigation/sheetPresenter';
import { ParticipantDetailContent } from './ParticipantDetailContent';
import { api } from '../services/api';
import { radii, useTheme } from '../theme';
import {
  Icon,
  TextField,
  PressableSurface,
  type IconName,
  RefreshControl,
} from '../components/ui';
import { CHROME_MAX_FONT_SCALE } from '../components/ui/fontScale';
import {
  applyBasic,
  applyFilters,
  applySort,
  basicFilterCount,
  BASIC_TOGGLES,
  DEFAULT_SORT,
  EMPTY_BASIC,
  getField,
  getQuickFilter,
  getSortField,
  QUICK_FILTERS,
  quickFilterCounts,
  ruleIsComplete,
  operatorNeedsValue,
  OPERATOR_LABELS,
  searchRoster,
  sectionLetter,
  type FilterContext,
} from '../services/participantFilters';
import { PARTICIPANT_STATE_LABELS } from '../services/participantStatus';
import type { AppStackParamList, Participant, ScanContext } from '../types';
import { useTabBarInset } from '../hooks/useTabBarInset';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

// The list's rows, with a letter header before each run of names when it's
// sorted by name.
type ListItem =
  | { kind: 'header'; key: string; letter: string }
  | { kind: 'row'; key: string; participant: Participant; first: boolean; last: boolean };

function participantKey(p: Participant, index: number): string {
  return p.participant_event_id || p.participant_id || `item-${index}`;
}

export function SearchScreen() {
  const { tokens, type } = useTheme();
  // Zero once the native bar is laid out as a side rail — see useTabBarInset.
  const tabBarInset = useTabBarInset();
  const navigation = useNavigation<NavigationProp>();
  const openSheet = useOpenSheet();
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
    activeParticipants,
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
    quick,
    setQuick,
    basic,
    setBasic,
    savedViews,
    activeViewId,
    applyView,
    saveView,
    deleteView,
    clearFilters,
  } = useParticipantViews(currentEvent?.id);
  const [inputValue, setInputValue] = useState('');
  const [scanContexts, setScanContexts] = useState<ScanContext[]>([]);
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
    if (text.trim().length > 0) {
      void search(text);
    } else {
      clearSearch();
    }
  }, [search, clearSearch]);

  const handleParticipantPress = useCallback((participant: Participant) => {
    if (useSplitView) {
      setSelectedParticipant(participant);
    } else {
      navigation.navigate('ParticipantDetail', { participant });
    }
  }, [useSplitView, navigation]);

  // One pipeline, so every number agrees with the list: search (the whole
  // roster, withdrawn people included), then the sheet's filters, then the
  // chip. The chips' counts are taken just before the chip applies.
  // Matches come from the live roster, so a check-in made elsewhere shows
  // in rows already on screen; Attend's results stand in only when nobody
  // on the phone matches.
  const searched = useMemo(() => {
    if (!searchQuery.trim()) return participants;
    const local = searchRoster(participants, searchQuery);
    return local.length > 0 ? local : searchResults ?? [];
  }, [searchQuery, searchResults, participants]);

  // Options (diet, scan contexts, etc.) come from the full active roster, not the current search subset
  const filterContext = useMemo<FilterContext>(
    () => ({ scanContexts, participants: activeParticipants }),
    [scanContexts, activeParticipants],
  );

  const activeRules = useMemo(() => rules.filter(ruleIsComplete), [rules]);

  const narrowed = useMemo(
    () => applyBasic(applyFilters(searched, rules, conjunction, filterContext), basic),
    [searched, rules, conjunction, filterContext, basic],
  );
  const quickCounts = useMemo(() => quickFilterCounts(narrowed), [narrowed]);
  const quickFilter = getQuickFilter(quick);

  const listed = useMemo(
    () => applySort(narrowed.filter(quickFilter.test), sort),
    [narrowed, quickFilter, sort],
  );

  // Sorted by name, the list runs in lettered sections (sticky headers), and
  // the rows of each draw their own bordered group.
  const byName = (sort ?? DEFAULT_SORT).field === 'name';
  const { items, stickyHeaderIndices } = useMemo(() => {
    const out: ListItem[] = [];
    const sticky: number[] = [];
    let letter: string | null = null;
    listed.forEach((participant, index) => {
      const next = byName ? sectionLetter(participant) : null;
      const startsSection = index === 0 || (byName && next !== letter);
      if (byName && next !== letter) {
        sticky.push(out.length);
        out.push({ kind: 'header', key: `header-${next}`, letter: next! });
        letter = next;
      }
      const following = listed[index + 1];
      const endsSection = !following || (byName && sectionLetter(following) !== letter);
      out.push({
        kind: 'row',
        key: participantKey(participant, index),
        participant,
        first: startsSection,
        last: endsSection,
      });
    });
    return { items: out, stickyHeaderIndices: sticky };
  }, [listed, byName]);

  // One stable renderItem and callback, so the memoised rows only re-render
  // when their own selection or position changes.
  const selectedId = useSplitView ? selectedParticipant?.participant_event_id ?? null : null;
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ListItem>) => item.kind === 'header' ? (
      <SectionHeader letter={item.letter} />
    ) : (
      <ParticipantRow
        participant={item.participant}
        onPress={handleParticipantPress}
        selected={selectedId !== null && selectedId === item.participant.participant_event_id}
        first={item.first}
        last={item.last}
      />
    ),
    [handleParticipantPress, selectedId],
  );

  const claimFilterSheet = filterSheet.useOpener({
    rules,
    onRulesChange: setRules,
    conjunction,
    onConjunctionChange: setConjunction,
    sort,
    onSortChange: setSort,
    basic,
    onBasicChange: setBasic,
    onClearAll: clearFilters,
    resultCount: listed.length,
    savedViews,
    onSaveView: saveView,
    onDeleteView: deleteView,
    filterContext,
  });
  const openFilterSheet = useCallback(() => {
    claimFilterSheet();
    openSheet('FilterSheet');
  }, [claimFilterSheet, openSheet]);

  const removeRule = useCallback(
    (ruleId: string) => {
      setRules(rules.filter(r => r.id !== ruleId));
    },
    [rules, setRules],
  );

  if (!currentEvent) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <Text style={[type.h2, { color: tokens.textH }]}>No event selected</Text>
          <Text style={[type.body, styles.centeredText, { color: tokens.text2 }]}>
            Please select an event from the Overview tab.
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
      <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[type.h1, { color: tokens.textH }]} accessibilityRole="header">Participants</Text>
        </View>
        <View style={styles.centered}>
          <Icon name="lock-closed" size={40} color={tokens.muted} />
          <Text style={[type.h2, { color: tokens.textH }]}>Participant records unavailable</Text>
          <Text style={[type.body, styles.centeredText, { color: tokens.text2 }]}>
            {roleLabel
              ? `Your role on this event (${roleLabel}) doesn't include participant records.`
              : "Your role on this event doesn't include participant records."}
          </Text>
          <Text style={[type.body, styles.centeredText, { color: tokens.text2 }]}>
            You can still scan attendees in and use the travel calendar.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const sortField = sort ? getSortField(sort.field) : undefined;
  // A saved view is already shown by its chip, so its filters and sort don't
  // get chips of their own.
  const viewActive = activeViewId !== null;
  const customRules = viewActive ? [] : activeRules;
  const customSort = viewActive ? null : sort;
  const customBasic = viewActive ? EMPTY_BASIC : basic;
  const advancedCount = activeRules.length + basicFilterCount(basic) + (sort ? 1 : 0);
  // Only what's in force shows as chips (tap one to remove it); everything
  // else is behind the header's filter button.
  const hasToolbar = customRules.length > 0 || Boolean(customSort) || basicFilterCount(customBasic) > 0;

  const query = searchQuery.trim();
  const emptyState = isSearching ? (
    { title: null, text: 'Searching Attend…' }
  ) : query && searched.length === 0 ? (
    { title: 'No results', text: `No participants found matching "${query}"` }
  ) : narrowed.length === 0 && searched.length > 0 ? (
    { title: 'No participants', text: 'No participants match the current filters' }
  ) : participants.length === 0 ? (
    { title: 'No participants', text: 'Pull to refresh or search by name/email' }
  ) : query || advancedCount > 0 ? (
    { title: `Nobody ${quickFilter.key === 'all' ? 'here' : `under ${quickFilter.label}`}`, text: 'Try another chip, or clear the search or filters.' }
  ) : (
    { title: null, text: quickFilter.empty }
  );

  const sidebar = (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[type.h1, styles.title, { color: tokens.textH }]} accessibilityRole="header" numberOfLines={1}>
            Participants
          </Text>
          <FilterButton activeCount={advancedCount} onOpenSheet={openFilterSheet} />
        </View>

        <TextField
          icon="search"
          value={inputValue}
          onChangeText={handleSearch}
          clearable
          placeholder="Search by name or email"
          accessibilityLabel="Search participants"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.toolbar}
        contentContainerStyle={styles.toolbarContent}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="tablist"
      >
        {QUICK_FILTERS.map(filter => {
          const selected = quickFilter.key === filter.key;
          const count = quickCounts[filter.key];
          return (
            <ToolChip
              key={filter.key}
              label={`${filter.label} ${count}`}
              icon={filter.key === 'attention' && count > 0 ? 'exclamation' : undefined}
              iconColor={filter.key === 'attention' && count > 0 ? tokens.error : undefined}
              active={selected}
              role="tab"
              onPress={() => setQuick(filter.key)}
              accessibilityLabel={`${filter.label}, ${count}`}
            />
          );
        })}
        {savedViews.map(view => {
          const selected = activeViewId === view.id;
          return (
            <ToolChip
              key={view.id}
              label={view.name}
              icon="clipboard-list"
              active={selected}
              // A second tap on the view in force takes it off.
              onPress={() => (selected ? clearFilters() : applyView(view))}
              accessibilityLabel={`Saved view: ${view.name}`}
            />
          );
        })}
      </ScrollView>

      {hasToolbar && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.toolbar}
          contentContainerStyle={styles.toolbarContent}
          keyboardShouldPersistTaps="handled"
        >
          {customSort && (
            <ToolChip
              label={`${sortField?.label ?? 'Sort'} ${customSort.direction === 'asc' ? '↑' : '↓'}`}
              trailingIcon="x"
              active
              onPress={() => setSort(null)}
              accessibilityLabel={`Sorted by ${sortField?.label ?? 'field'}, ${customSort.direction === 'asc' ? 'ascending' : 'descending'}. Remove to sort by name`}
            />
          )}
          {customBasic.states.length > 0 && (
            <ToolChip
              label={customBasic.states.map(state => PARTICIPANT_STATE_LABELS[state]).join(', ')}
              trailingIcon="x"
              active
              onPress={() => setBasic({ ...basic, states: [] })}
              accessibilityLabel={`Remove filter: ${customBasic.states.map(state => PARTICIPANT_STATE_LABELS[state]).join(', ')}`}
            />
          )}
          {BASIC_TOGGLES.filter(toggle => customBasic[toggle.key] !== undefined).map(toggle => {
            const label = `${toggle.label}: ${customBasic[toggle.key] ? 'Yes' : 'No'}`;
            return (
              <ToolChip
                key={toggle.key}
                label={label}
                trailingIcon="x"
                active
                onPress={() => setBasic({ ...basic, [toggle.key]: undefined })}
                accessibilityLabel={`Remove filter: ${label}`}
              />
            );
          })}
          {customRules.map(rule => {
            const field = getField(rule.field);
            if (!field) return null;
            const valueLabel = operatorNeedsValue(rule.operator)
              ? field.getOptions?.(filterContext).find(o => o.value === rule.value)?.label ?? rule.value
              : null;
            const label = `${field.label} ${OPERATOR_LABELS[rule.operator]}${valueLabel ? ` ${valueLabel}` : ''}`;
            return (
              <ToolChip
                key={rule.id}
                label={label}
                trailingIcon="x"
                active
                onPress={() => removeRule(rule.id)}
                accessibilityLabel={`Remove filter: ${label}`}
              />
            );
          })}
        </ScrollView>
      )}

      {isSearching && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={tokens.accent} />
        </View>
      )}

      <FlashList
        data={items}
        renderItem={renderItem}
        extraData={selectedId}
        keyExtractor={item => item.key}
        getItemType={item => item.kind}
        stickyHeaderIndices={stickyHeaderIndices}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressBackgroundColor={tokens.bg}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {emptyState.title ? (
              <Text style={[type.h2, { color: tokens.textH }]}>{emptyState.title}</Text>
            ) : null}
            <Text style={[type.body, styles.centeredText, { color: tokens.text2 }]}>{emptyState.text}</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: tabBarInset + 24 }}
      />

    </View>
  );

  if (useSplitView) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'left', 'right']}>
        <SplitView
          sidebar={sidebar}
          detail={selectedParticipant ? (
            <ParticipantDetailContent
              // A new participant gets a fresh gate: it re-checks the unlock
              // and starts the detail state over.
              key={selectedParticipant.participant_event_id}
              participant={selectedParticipant}
              topInset={16}
              bottomInset={tabBarInset + 24}
            />
          ) : null}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'left', 'right']}>
      {sidebar}
    </SafeAreaView>
  );
}

/**
 * The header's filter button: opens the filter sheet (saved views are chips
 * in the row under the search). Tinted when a filter or sort is in force.
 */
function FilterButton({
  activeCount,
  onOpenSheet,
}: {
  activeCount: number;
  onOpenSheet: () => void;
}) {
  const { tokens, hitTarget } = useTheme();
  const active = activeCount > 0;
  const color = active ? tokens.accent : tokens.text;
  const label = active ? `Filter and sort, ${activeCount} active` : 'Filter and sort';
  return (
    <PressableSurface
      onPress={onOpenSheet}
      rippleColor={tokens.text}
      rippleAlpha={0.1}
      style={styles.filterSurface}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.filterButton, { width: hitTarget, height: hitTarget }]}>
        <Icon name="filter" size={22} color={color} />
        {active ? <View style={[styles.filterDot, { backgroundColor: tokens.accent, borderColor: tokens.bg }]} /> : null}
      </View>
    </PressableSurface>
  );
}

/** A name-sorted list's letter, pinned to the top while its names scroll by. */
function SectionHeader({ letter }: { letter: string }) {
  const { tokens, type } = useTheme();
  return (
    <View style={[styles.sectionHeader, { backgroundColor: tokens.bg }]}>
      <Text
        style={[type.label, { color: tokens.text2 }]}
        accessibilityRole="header"
        maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
      >
        {letter}
      </Text>
    </View>
  );
}

interface ToolChipProps {
  label: string;
  icon?: IconName;
  /** The leading icon's colour, when it isn't the label's. */
  iconColor?: string;
  trailingIcon?: IconName;
  active?: boolean;
  /** A tab in a single-choice row; otherwise a button. */
  role?: 'tab' | 'button';
  onPress: () => void;
  accessibilityLabel?: string;
}

/** A compact outlined chip for the filter toolbar (Material filter-chip shape). */
function ToolChip({
  label,
  icon,
  iconColor,
  trailingIcon,
  active = false,
  role = 'button',
  onPress,
  accessibilityLabel,
}: ToolChipProps) {
  const { tokens, type, radii } = useTheme();
  const color = active ? tokens.accent : tokens.text;
  return (
    <PressableSurface
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      rippleColor={color}
      hitSlop={{ top: 6, bottom: 6 }}
      style={[
        styles.chip,
        {
          borderRadius: radii.item,
          borderColor: active ? tokens.accent : tokens.input,
          backgroundColor: active ? tokens.selected : tokens.bg,
        },
      ]}
      contentStyle={styles.chipContent}
    >
      {icon ? <Icon name={icon} size={16} color={iconColor ?? color} /> : null}
      <Text
        style={[type.label, styles.chipText, { color }]}
        numberOfLines={1}
        maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
      >
        {label}
      </Text>
      {trailingIcon ? <Icon name={trailingIcon} size={14} color={color} /> : null}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    flex: 1,
  },
  toolbar: {
    flexGrow: 0,
    marginBottom: 12,
  },
  toolbarContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterSurface: { borderRadius: radii.pill },
  filterButton: { alignItems: 'center', justifyContent: 'center' },
  filterDot: {
    position: 'absolute',
    top: 9,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: radii.pill,
    borderWidth: 2,
  },
  chip: { borderWidth: 1, maxWidth: 260 },
  chipContent: {
    // 32 including the 1px border.
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  chipText: {
    flexShrink: 1,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
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
  centeredText: {
    textAlign: 'center',
    maxWidth: 300,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    padding: 32,
    paddingTop: 64,
    gap: 8,
  },
});
