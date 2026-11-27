import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountButton } from './AccountSheet';
import { EventCard } from './EventBanner';
import { EmptyState, ErrorView, GroupToggle, LoadingView, Screen, TextField } from './ui';
import { useApp } from '../context/AppContext';
import type { useSwitcherEvents } from '../hooks/useSwitcherEvents';
import { passHomeState } from '../navigation/routes';
import { resetRoot } from '../navigation/rootNavigation';
import { switcherOverlay } from '../navigation/switcherOverlay';
import { useIsUnderSheet } from '../navigation/useIsUnderSheet';
import { bannerHeight } from '../services/eventBanner';
import { collapsibleGroup } from '../services/collapsibleGroup';
import { eventPhaseLabel } from '../services/eventDates';
import { eventRoleLabel } from '../services/eventRoles';
import { haptics } from '../services/haptics';
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
      onPress={() => {
        haptics.selection();
        onPickEvent(event);
      }}
    />
  );
  const ticketCard = (ticket: Ticket) => (
    <EventCard
      key={`ticket-${ticket.id}`}
      event={ticket.event}
      meta={joinMeta(eventPhaseLabel(ticket.event, undefined, 'in'), 'Attendee')}
      selected={ticket.id === currentTicketId}
      onPress={() => {
        haptics.selection();
        onPickTicket(ticket);
      }}
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

/** The home switcher's key in the overlay (it has no banner of its own). */
const HOME_KEY = 'home';

/**
 * Where every launch and sign-in lands, for organizers and attendees alike:
 * the event switcher overlay itself, open as the home screen (no tab bar, no
 * way to close it), so it looks and behaves exactly like the switcher pulled
 * down from a banner. Picking an event lands on its Overview or pass the
 * same way, the card growing into the new banner.
 *
 * The overlay is shown while this screen is focused, and goes the moment it
 * isn't (a link opened over it, signing out) unless a pick is under way. A
 * drawer over it (the account sheet) doesn't count: the overlay stays, under
 * the drawer, rather than leaving its blank screen showing.
 */
export function EventSwitcherScreen() {
  const navigation = useNavigation();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { checkUnderSheet } = useIsUnderSheet();

  useFocusEffect(
    useCallback(() => {
      switcherOverlay.openHome({
        key: HOME_KEY,
        event: null,
        topInset: insets.top,
        // Where the picked card grows to: the new screen's banner, at the top.
        height: bannerHeight(width, insets.top),
        enabled: true,
        current: {},
        // The new banner's avatar, carried in by the growing card.
        accessory: <AccountButton onBanner />,
        measure: () => Promise.resolve(null),
        switchTo: (home, before) => {
          before?.();
          resetRoot(navigation, home);
        },
      });
      // (Checked a frame on: as the screen blurs, the drawer isn't in the
      // root state yet.)
      return () => {
        requestAnimationFrame(() => {
          if (!checkUnderSheet()) switcherOverlay.dismissHome();
        });
      };
    }, [checkUnderSheet, insets.top, navigation, width])
  );
  // Gone for good (signed out, a reset elsewhere): never left up.
  useEffect(() => () => switcherOverlay.dismissHome(), []);

  // Under the overlay, only ever seen at its edges as the app scales back.
  return <View style={[styles.fill, { backgroundColor: tokens.bg }]} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  groupLabel: { marginTop: 8 },
});
