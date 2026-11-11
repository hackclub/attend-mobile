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
  ActionMenu,
  Icon,
  SegmentedControl,
  TextField,
  PressableSurface,
  type IconName,
  type MenuAction,
  RefreshControl,
} from '../components/ui';
import { CHROME_MAX_FONT_SCALE } from '../components/ui/fontScale';
import {
  applyFilters,
  applySort,
  getField,
  getSortField,
  ruleIsComplete,
  operatorNeedsValue,
  OPERATOR_LABELS,
  PRESET_VIEWS,
  type FilterContext,
} from '../services/participantFilters';
import type { AppStackParamList, Participant, ScanContext } from '../types';
import { useTabBarInset } from '../hooks/useTabBarInset';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

// The three preset views, shown as the segmented control.
const SEGMENT_LABELS: Record<string, string> = {
  'preset-everyone': 'Everyone',
  'preset-checked-in': 'Checked in',
  'preset-not-checked-in': 'Not checked in',
};

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
    savedViews,
    allViews,
    activeViewId,
    applyView,
    saveView,
    deleteView,
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
    if (text.length >= 2) {
      search(text);
    } else if (text.length === 0) {
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

  // Browsing shows only people who are still attending. Server search results
  // can still surface withdrawn registrations, which the row flags with a badge.
  const baseParticipants = searchResults ?? activeParticipants;

  // Options (status, diet, etc.) derive from the full active roster, not the current search subset
  const filterContext = useMemo<FilterContext>(
    () => ({ scanContexts, participants: activeParticipants }),
    [scanContexts, activeParticipants],
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

  // One stable renderItem and callback, so the memoised rows only re-render
  // when their own selection or position changes.
  const selectedId = useSplitView ? selectedParticipant?.participant_event_id ?? null : null;
  const lastIndex = filteredParticipants.length - 1;
  const renderParticipant = useCallback(
    ({ item, index }: ListRenderItemInfo<Participant>) => (
      <ParticipantRow
        participant={item}
        onPress={handleParticipantPress}
        selected={selectedId !== null && selectedId === item.participant_event_id}
        first={index === 0}
        last={index === lastIndex}
      />
    ),
    [handleParticipantPress, selectedId, lastIndex],
  );

  const viewCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const view of allViews) {
      counts[view.id] = applyFilters(baseParticipants, view.rules, view.conjunction, filterContext).length;
    }
    return counts;
  }, [allViews, baseParticipants, filterContext]);

  const segmentOptions = useMemo(
    () => PRESET_VIEWS.map(view => ({
      value: view.id,
      label: SEGMENT_LABELS[view.id] ?? view.name,
      count: viewCounts[view.id] ?? 0,
    })),
    [viewCounts],
  );

  const handleSegmentChange = useCallback(
    (viewId: string) => {
      const view = allViews.find(v => v.id === viewId);
      if (view) applyView(view);
    },
    [allViews, applyView],
  );

  const claimFilterSheet = filterSheet.useOpener({
    rules,
    onRulesChange: setRules,
    conjunction,
    onConjunctionChange: setConjunction,
    sort,
    onSortChange: setSort,
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
  // A preset is already shown by the segmented control, so its rules and sort
  // don't get chips of their own.
  const presetActive = activeViewId !== null && activeViewId in SEGMENT_LABELS;
  const customRules = presetActive ? [] : activeRules;
  const customSort = presetActive ? null : sort;
  // Only what's in force shows as chips (tap one to remove it); everything
  // else is behind the header's filter button.
  const hasToolbar = customRules.length > 0 || Boolean(customSort);

  const emptyState = searchQuery.length >= 2 ? (
    { title: 'No results', text: `No participants found matching "${searchQuery}"` }
  ) : searchQuery.length > 0 ? (
    { title: null, text: 'Type at least 2 characters to search' }
  ) : activeRules.length > 0 ? (
    { title: 'No participants', text: 'No participants match the current filters' }
  ) : (
    { title: 'No participants', text: 'Pull to refresh or search by name/email' }
  );

  const sidebar = (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[type.h1, styles.title, { color: tokens.textH }]} accessibilityRole="header" numberOfLines={1}>
            Participants
          </Text>
          <FilterButton
            activeCount={customRules.length + (customSort ? 1 : 0)}
            onOpenSheet={openFilterSheet}
            savedViews={savedViews.map(view => ({
              key: view.id,
              title: view.name,
              checked: activeViewId === view.id,
              onSelect: () => applyView(view),
            }))}
          />
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

        <SegmentedControl
          options={segmentOptions}
          value={activeViewId ?? ''}
          onChange={handleSegmentChange}
          accessibilityLabel="View"
          role="tab"
        />
      </View>

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
              active
              onPress={openFilterSheet}
              accessibilityLabel={`Sorted by ${sortField?.label ?? 'field'}, ${customSort.direction === 'asc' ? 'ascending' : 'descending'}`}
            />
          )}
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
        data={filteredParticipants}
        renderItem={renderParticipant}
        extraData={selectedId}
        keyExtractor={(item, index) => item.participant_id || item.participant_event_id || `item-${index}`}
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
 * The header's filter button. It opens the filter sheet, or with saved views,
 * a menu of them plus "Filter and sort…" (the sheet can't apply a view).
 * Tinted when a filter or sort is in force.
 */
function FilterButton({
  activeCount,
  onOpenSheet,
  savedViews,
}: {
  activeCount: number;
  onOpenSheet: () => void;
  savedViews: Omit<MenuAction, 'iosIcon'>[];
}) {
  const { tokens, hitTarget } = useTheme();
  const active = activeCount > 0 || savedViews.some(view => view.checked);
  const color = active ? tokens.accent : tokens.text;
  const label = activeCount > 0 ? `Filter and sort, ${activeCount} active` : 'Filter and sort';
  const glyph = (
    <View style={[styles.filterButton, { width: hitTarget, height: hitTarget }]}>
      <Icon name="filter" size={22} color={color} />
      {active ? <View style={[styles.filterDot, { backgroundColor: tokens.accent, borderColor: tokens.bg }]} /> : null}
    </View>
  );

  if (savedViews.length === 0) {
    return (
      <PressableSurface
        onPress={onOpenSheet}
        rippleColor={tokens.text}
        rippleAlpha={0.1}
        style={styles.filterSurface}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {glyph}
      </PressableSurface>
    );
  }

  return (
    <ActionMenu
      accessibilityLabel={label}
      title="Saved views"
      actions={[
        ...savedViews,
        { key: 'filter-sheet', title: 'Filter and sort…', onSelect: onOpenSheet, iosIcon: 'line.3.horizontal.decrease' },
      ]}
    >
      {glyph}
    </ActionMenu>
  );
}

interface ToolChipProps {
  label: string;
  icon?: IconName;
  trailingIcon?: IconName;
  active?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

/** A compact outlined chip for the filter toolbar (Material filter-chip shape). */
function ToolChip({ label, icon, trailingIcon, active = false, onPress, accessibilityLabel }: ToolChipProps) {
  const { tokens, type, radii } = useTheme();
  const color = active ? tokens.accent : tokens.text;
  return (
    <PressableSurface
      onPress={onPress}
      accessibilityRole="button"
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
      {icon ? <Icon name={icon} size={16} color={color} /> : null}
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
