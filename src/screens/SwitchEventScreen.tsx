import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { eventHomeState, passHomeState } from '../navigation/routes';
import { resetRoot } from '../navigation/rootNavigation';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AccountButton } from '../components/AccountSheet';
import { EventCard } from '../components/EventBanner';
import { EmptyState, GroupToggle, ErrorView, LoadingView, Screen, TextField } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useSwitcherEvents } from '../hooks/useSwitcherEvents';
import { eventPhaseLabel } from '../services/eventDates';
import {
  SWITCHER_SEARCH_THRESHOLD,
  filterSwitcherEvents,
  switcherEventCount,
} from '../services/eventSwitcher';
import { eventRoleLabel } from '../services/eventRoles';
import { collapsibleGroup } from '../services/collapsibleGroup';
import { useTheme } from '../theme';
import type { Event, AppStackParamList, Ticket } from '../types';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const joinMeta = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

/**
 * Every event the user can open: the ones they organize, which open the
 * Overview, and the ones they attend, which open that ticket. Ended events of
 * either kind sit in a Past group, collapsed until asked for (or searched).
 *
 * Presented as a modal from the Overview banner. `embedded` renders the same
 * list in place of the Overview while no event is chosen yet.
 */
export function SwitchEventScreen({ embedded = false }: { embedded?: boolean }) {
  const switcher = useSwitcherEvents();
  return <SwitchEventList embedded={embedded} switcher={switcher} />;
}

/**
 * The switcher's list, given the events to show. The Overview renders it
 * embedded with the `useSwitcherEvents` it already holds, so the events load
 * once rather than once per component.
 */
export function SwitchEventList({
  embedded = false,
  switcher,
}: {
  embedded?: boolean;
  switcher: ReturnType<typeof useSwitcherEvents>;
}) {
  const { tokens, type, spacing } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const { state, selectEvent } = useApp();
  const { groups: allGroups, isLoading, loadFailed, refresh } = switcher;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [pastOpen, setPastOpen] = useState(false);
  // Opened from a pass, that ticket is the current entry, not the event.
  const currentTicketId = (route.params as { currentTicketId?: string } | undefined)?.currentTicketId;
  const currentId = currentTicketId ? undefined : state.currentEvent?.id;
  // Global admins see every event; past a handful, offer a search.
  const searchable = switcherEventCount(allGroups) > SWITCHER_SEARCH_THRESHOLD;
  const groups = useMemo(
    () => (searchable ? filterSwitcherEvents(allGroups, query) : allGroups),
    [allGroups, query, searchable]
  );

  // An organized event opens on its Overview, every tab back at its root so
  // nothing from the last event stays pushed. An attended event opens its
  // pass as the home, with no Overview under it.
  const pickEvent = useCallback((event: Event) => {
    void selectEvent(event);
    if (!embedded || currentTicketId) resetRoot(navigation, eventHomeState());
  }, [currentTicketId, embedded, navigation, selectEvent]);

  const pickTicket = useCallback((ticket: Ticket) => {
    resetRoot(navigation, passHomeState(ticket));
  }, [navigation]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  }, [refresh]);

  const searching = searchable && query.trim().length > 0;
  const past = collapsibleGroup(pastOpen, searching);
  const empty = switcherEventCount(allGroups) === 0;
  const noMatches = !empty && switcherEventCount(groups) === 0;
  return (
    <Screen
      title={embedded ? 'Choose an event' : 'Switch event'}
      back={false}
      modal={!embedded}
      close={!embedded}
      action={<AccountButton size={44} />}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      contentContainerStyle={{ gap: spacing.md }}
    >
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
          <Text style={[type.label, styles.groupLabel, { color: tokens.text2 }]} accessibilityRole="header">
            Organizing
          </Text>
          {groups.organising.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              meta={joinMeta(eventPhaseLabel(event, undefined, 'in'), eventRoleLabel(event.role))}
              selected={event.id === currentId}
              onPress={() => pickEvent(event)}
            />
          ))}
        </>
      ) : null}

      {groups.attending.length > 0 ? (
        <>
          <Text style={[type.label, styles.groupLabel, { color: tokens.text2 }]} accessibilityRole="header">
            Attending
          </Text>
          {groups.attending.map((ticket) => (
            <EventCard
              key={ticket.id}
              event={ticket.event}
              meta={joinMeta(eventPhaseLabel(ticket.event, undefined, 'in'), 'Attendee')}
              selected={ticket.id === currentTicketId}
              onPress={() => pickTicket(ticket)}
              accessibilityHint="Opens your ticket"
            />
          ))}
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
            ? groups.past.map((entry) =>
              entry.kind === 'organising' ? (
                <EventCard
                  key={`event-${entry.event.id}`}
                  event={entry.event}
                  meta={joinMeta(eventPhaseLabel(entry.event, undefined, 'in'), eventRoleLabel(entry.event.role))}
                  selected={entry.event.id === currentId}
                  onPress={() => pickEvent(entry.event)}
                />
              ) : (
                <EventCard
                  key={`ticket-${entry.ticket.id}`}
                  event={entry.ticket.event}
                  meta={joinMeta(eventPhaseLabel(entry.ticket.event, undefined, 'in'), 'Attendee')}
                  selected={entry.ticket.id === currentTicketId}
                  onPress={() => pickTicket(entry.ticket)}
                  accessibilityHint="Opens your ticket"
                />
              )
            )
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
          onRetry={() => void refresh()}
        />
      ) : (
        <EmptyState title="No events available" />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupLabel: { marginTop: 8 },
});
