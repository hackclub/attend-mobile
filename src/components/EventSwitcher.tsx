import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AccountButton } from './AccountSheet';
import { EventCard } from './EventBanner';
import { EmptyState, ErrorView, GroupToggle, LoadingView, Screen, TextField } from './ui';
import { useApp } from '../context/AppContext';
import type { useSwitcherEvents } from '../hooks/useSwitcherEvents';
import { passHomeState } from '../navigation/routes';
import { resetRoot } from '../navigation/rootNavigation';
import { collapsibleGroup } from '../services/collapsibleGroup';
import { eventPhaseLabel } from '../services/eventDates';
import { eventRoleLabel } from '../services/eventRoles';
import {
  SWITCHER_SEARCH_THRESHOLD,
  filterSwitcherEvents,
  switcherEventCount,
  type SwitcherGroups,
} from '../services/eventSwitcher';
import { useTheme } from '../theme';
import type { Event, Ticket } from '../types';

const joinMeta = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

export interface EventSwitcherBodyProps {
  groups: SwitcherGroups;
  isLoading: boolean;
  loadFailed: boolean;
  onRetry: () => void;
  /** Marked as current. */
  currentEventId?: string;
  currentTicketId?: string;
  onPickEvent: (event: Event) => void;
  onPickTicket: (ticket: Ticket) => void;
}

/**
 * Every event the user can open: the ones they organize, which open the
 * Overview, and the ones they attend, which open that ticket. Ended events of
 * either kind sit in a Past group, collapsed until asked for (or searched).
 * Past a handful of events (global admins see them all) there's a search.
 *
 * The switcher drawer's body, and the Overview's while no event is chosen.
 */
export function EventSwitcherBody({
  groups: allGroups,
  isLoading,
  loadFailed,
  onRetry,
  currentEventId,
  currentTicketId,
  onPickEvent,
  onPickTicket,
}: EventSwitcherBodyProps) {
  const { tokens, type, spacing } = useTheme();
  const [query, setQuery] = useState('');
  const [pastOpen, setPastOpen] = useState(false);
  const searchable = switcherEventCount(allGroups) > SWITCHER_SEARCH_THRESHOLD;
  const groups = useMemo(
    () => (searchable ? filterSwitcherEvents(allGroups, query) : allGroups),
    [allGroups, query, searchable]
  );
  const searching = searchable && query.trim().length > 0;
  const past = collapsibleGroup(pastOpen, searching);
  const empty = switcherEventCount(allGroups) === 0;
  const noMatches = !empty && switcherEventCount(groups) === 0;

  const eventCard = (event: Event) => (
    <EventCard
      key={`event-${event.id}`}
      event={event}
      meta={joinMeta(eventPhaseLabel(event, undefined, 'in'), eventRoleLabel(event.role))}
      selected={event.id === currentEventId}
      onPress={() => onPickEvent(event)}
    />
  );
  const ticketCard = (ticket: Ticket) => (
    <EventCard
      key={`ticket-${ticket.id}`}
      event={ticket.event}
      meta={joinMeta(eventPhaseLabel(ticket.event, undefined, 'in'), 'Attendee')}
      selected={ticket.id === currentTicketId}
      onPress={() => onPickTicket(ticket)}
      accessibilityHint="Opens your ticket"
    />
  );
  const label = (text: string) => (
    <Text style={[type.label, styles.groupLabel, { color: tokens.text2 }]} accessibilityRole="header">
      {text}
    </Text>
  );

  return (
    <View style={{ gap: spacing.md }}>
      {searchable ? (
        <TextField
          icon="search"
          placeholder="Search events"
          value={query}
          onChangeText={setQuery}
          clearable
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search events"
        />
      ) : null}

      {groups.organising.length > 0 ? (
        <>
          {label('Organizing')}
          {groups.organising.map(eventCard)}
        </>
      ) : null}

      {groups.attending.length > 0 ? (
        <>
          {label('Attending')}
          {groups.attending.map(ticketCard)}
        </>
      ) : null}

      {groups.past.length > 0 ? (
        <>
          <GroupToggle
            label="Past"
            count={groups.past.length}
            open={past.expanded}
            onToggle={past.toggleable ? () => setPastOpen((open) => !open) : undefined}
            style={styles.groupLabel}
          />
          {past.expanded
            ? groups.past.map((entry) => (entry.kind === 'organising' ? eventCard(entry.event) : ticketCard(entry.ticket)))
            : null}
        </>
      ) : null}

      {noMatches ? <EmptyState title={`No events match “${query.trim()}”`} /> : null}

      {!empty ? null : isLoading ? (
        <LoadingView />
      ) : loadFailed ? (
        // A failed load is not an empty list: say so and offer a retry.
        <ErrorView
          title="Couldn’t load your events"
          message="Check your connection and try again."
          onRetry={onRetry}
        />
      ) : (
        <EmptyState title="No events available" />
      )}
    </View>
  );
}

/**
 * The Overview while no event is chosen: the switcher's list in its place,
 * with the events the Overview already loaded. Picking an organized event
 * shows its Overview here; a ticket opens that pass as the home.
 */
export function SwitchEventList({ switcher }: { switcher: ReturnType<typeof useSwitcherEvents> }) {
  const navigation = useNavigation();
  const { state, selectEvent } = useApp();
  const { groups, isLoading, loadFailed, refresh } = switcher;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  }, [refresh]);

  return (
    <Screen
      title="Choose an event"
      back={false}
      action={<AccountButton size={44} />}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
    >
      <EventSwitcherBody
        groups={groups}
        isLoading={isLoading}
        loadFailed={loadFailed}
        onRetry={() => void refresh()}
        currentEventId={state.currentEvent?.id}
        onPickEvent={(event) => void selectEvent(event)}
        onPickTicket={(ticket) => resetRoot(navigation, passHomeState(ticket))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupLabel: { marginTop: 8 },
});
