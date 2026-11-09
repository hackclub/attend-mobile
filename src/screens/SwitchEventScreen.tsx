import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AccountButton, AccountSheet } from '../components/AccountSheet';
import { EventCard } from '../components/EventBanner';
import { Button } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useSwitcherEvents } from '../hooks/useSwitcherEvents';
import { eventPhaseLabel } from '../services/eventDates';
import { eventRoleLabel } from '../services/eventRoles';
import { useTheme } from '../theme';
import type { Event, RootStackParamList, Ticket } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const CONTENT_MAX_WIDTH = 620;

const joinMeta = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

/**
 * Every event the user can open: the ones they organize, which open the
 * Overview, and the ones they attend, which open that ticket. Past events are
 * left out.
 *
 * Presented as a modal from the Overview banner. `embedded` renders the same
 * list in place of the Overview while no event is chosen yet.
 */
export function SwitchEventScreen({ embedded = false }: { embedded?: boolean }) {
  const { tokens, type, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { state, selectEvent } = useApp();
  const { groups, isLoading, refresh } = useSwitcherEvents();
  const [accountOpen, setAccountOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const currentId = state.currentEvent?.id;

  const pickEvent = useCallback((event: Event) => {
    void selectEvent(event);
    if (!embedded) navigation.goBack();
  }, [embedded, navigation, selectEvent]);

  const pickTicket = useCallback((ticket: Ticket) => {
    if (embedded) {
      navigation.navigate('TicketDetail', { ticket });
    } else {
      navigation.dispatch(StackActions.replace('TicketDetail', { ticket }));
    }
  }, [embedded, navigation]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  }, [refresh]);

  const empty = groups.organising.length === 0 && groups.attending.length === 0;
  // A modal sheet on iOS starts below the status bar; full screen elsewhere.
  const topPad = embedded ? insets.top + spacing.lg : spacing.xl;

  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md },
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={tokens.accent} />
        }
      >
        <View style={styles.header}>
          <Text style={[type.h1, styles.title, { color: tokens.textH }]} accessibilityRole="header">
            {embedded ? 'Choose an event' : 'Switch event'}
          </Text>
          <AccountButton size={44} onPress={() => setAccountOpen(true)} />
          {embedded ? null : (
            <Button variant="icon" icon="x" title="Close" onPress={() => navigation.goBack()} />
          )}
        </View>

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
                onPress={() => pickTicket(ticket)}
                accessibilityHint="Opens your ticket"
              />
            ))}
          </>
        ) : null}

        {empty ? (
          <View style={styles.empty}>
            {isLoading ? <ActivityIndicator color={tokens.accent} /> : null}
            <Text style={[type.body, { color: tokens.text2 }]}>
              {isLoading ? 'Loading events...' : 'No events available'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <AccountSheet visible={accountOpen} onClose={() => setAccountOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1 },
  groupLabel: { marginTop: 8 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 48 },
});
