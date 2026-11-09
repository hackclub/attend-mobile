import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../services/api';
import { eventPhaseLabel } from '../services/eventDates';
import { groupTickets, ticketBadge } from '../services/eventSwitcher';
import { VersionFooter } from '../components/VersionFooter';
import { AccountButton } from '../components/AccountSheet';
import { EventCard } from '../components/EventBanner';
import { useTheme } from '../theme';
import { EmptyState, ErrorView, GroupToggle, LoadingView, QuickActionTile, Screen } from '../components/ui';
import type { AppStackParamList, Ticket } from '../types';

type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'MyTickets'>;

const joinMeta = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

/**
 * A participant's home: every ticket as an event card (even just one),
 * upcoming first and ended ones collapsed under Past. A card pushes that
 * event's pass.
 */
export function MyTicketsScreen() {
  const { tokens, type, spacing } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      const fresh = await api.getMyTickets();
      setTickets(fresh);
      setLoadFailed(false);
    } catch (error) {
      // Keep whatever we already have on screen; a transient error shouldn't
      // wipe the list.
      console.error('Failed to load tickets:', error);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // The unread count on the Messages tile, refreshed whenever the list is
  // back in view (reading a message clears it).
  const [unread, setUnread] = useState(0);
  useFocusEffect(
    useCallback(() => {
      api.getInbox().then((page) => setUnread(page.unread_count)).catch(() => {});
    }, []),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadTickets();
    setIsRefreshing(false);
  }, [loadTickets]);

  // Sign out, appearance and notifications live in the shared Account sheet.

  const { upcoming, past } = useMemo(() => groupTickets(tickets), [tickets]);

  // Every ticket opens its pass; an unfinished registration's pass says so
  // and links to the onboarding site.
  const card = (ticket: Ticket) => (
    <EventCard
      key={ticket.id}
      event={ticket.event}
      meta={joinMeta(eventPhaseLabel(ticket.event, undefined, 'in'), ticket.event.location_city)}
      badge={ticketBadge(ticket)}
      onPress={() => navigation.navigate('TicketDetail', { ticket })}
      accessibilityHint="Opens your pass"
    />
  );

  return (
    <>
      <Screen
        title="My tickets"
        action={<AccountButton />}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <View style={styles.quickActions}>
          <QuickActionTile
            icon="mail"
            tint="sky"
            label="Messages"
            subLabel={unread > 0 ? `${unread} unread` : undefined}
            onPress={() => navigation.navigate('Inbox')}
          />
          <QuickActionTile
            icon="shield-exclamation"
            tint="red"
            label="Report an incident"
            onPress={() => navigation.navigate('IncidentReport')}
          />
        </View>

        {upcoming.length > 0 ? (
          <View style={{ gap: spacing.md }}>
            <Text style={[type.label, { color: tokens.text2 }]} accessibilityRole="header">
              Upcoming
            </Text>
            {upcoming.map(card)}
          </View>
        ) : null}

        {past.length > 0 ? (
          <View style={{ gap: spacing.md }}>
            <GroupToggle
              label="Past"
              count={past.length}
              open={pastOpen}
              onToggle={() => setPastOpen((open) => !open)}
            />
            {pastOpen ? past.map(card) : null}
          </View>
        ) : null}

        {tickets.length > 0 ? null : isLoading ? (
          <LoadingView />
        ) : loadFailed ? (
          <ErrorView
            title="Couldn’t load your tickets"
            message="Check your connection and try again."
            onRetry={() => void handleRefresh()}
          />
        ) : (
          <EmptyState
            icon="ticket"
            title="No tickets yet"
            message="When you register for an event, your ticket will appear here."
          />
        )}

        <VersionFooter />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  quickActions: { flexDirection: 'row', gap: 12 },
});
