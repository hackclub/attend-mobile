import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { VersionFooter } from '../components/VersionFooter';
import { AccountButton, AccountSheet } from '../components/AccountSheet';
import { useTheme } from '../theme';
import {
  Badge,
  Button,
  Icon,
  QuickActionTile,
  StatusIndicator,
  PressableSurface,
} from '../components/ui';
import type { RootStackParamList, Ticket } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ParticipantMain'>;

// Dates are shown in the event's timezone, not the device's, so the day
// doesn't shift for travellers.
function formatDate(dateString?: string, timezone?: string) {
  if (!dateString) return '';
  const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' } as const;
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      ...opts,
      timeZone: timezone || undefined,
    });
  } catch {
    try {
      return new Date(dateString).toLocaleDateString(undefined, opts);
    } catch {
      return '';
    }
  }
}

export function MyTicketsScreen() {
  const { tokens, type, spacing } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      const fresh = await api.getMyTickets();
      setTickets(fresh);
    } catch (error) {
      // Keep whatever we already have on screen; a transient error shouldn't
      // wipe the list.
      console.error('Failed to load tickets:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // The unread count on the Messages button, refreshed whenever the list is
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
  const [accountOpen, setAccountOpen] = useState(false);

  // Confirmed → open the native ticket. Unconfirmed → send them to the
  // onboarding website to complete their registration.
  const openTicket = (item: Ticket) => {
    if (item.confirmed) {
      navigation.navigate('TicketDetail', { ticket: item });
    } else {
      Linking.openURL(item.onboarding_url).catch(() => {
        Alert.alert('Something went wrong', 'Could not open registration. Please try again.');
      });
    }
  };

  const header = (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
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
      {tickets.length > 0 ? <Text style={[type.h2, { color: tokens.textH }]}>Tickets</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.shaded }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
        {/* Staff reach this screen by pushing onto the stack, so offer a way
            back to the scanner app. Participant-only users land here as the
            root and have nothing to go back to. */}
        {navigation.canGoBack() ? (
          <Button
            title="Back"
            variant="icon"
            icon="chevron-left"
            onPress={() => navigation.goBack()}
            style={styles.back}
          />
        ) : null}
        <View style={styles.headerText}>
          <Text style={[type.h1, { color: tokens.textH }]} accessibilityRole="header">
            Hack Club Attend
          </Text>
          <Text style={[type.body, { color: tokens.text2 }]} numberOfLines={1}>
            {state.auth.user?.name || state.auth.user?.email}
          </Text>
        </View>
        <AccountButton onPress={() => setAccountOpen(true)} />
      </View>
      <AccountSheet visible={accountOpen} onClose={() => setAccountOpen(false)} />

      <FlatList
        data={tickets}
        renderItem={({ item }) => <TicketCard ticket={item} onPress={() => openTicket(item)} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { padding: spacing.lg, gap: spacing.md }]}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
          />
        }
        ListFooterComponent={<VersionFooter />}
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? (
              <ActivityIndicator color={tokens.accent} />
            ) : (
              <>
                <Icon name="ticket" size={32} color={tokens.muted} />
                <Text style={[type.h3, { color: tokens.textH }]}>No tickets yet</Text>
                <Text style={[type.body, styles.center, { color: tokens.text2 }]}>
                  When you register for an event, your ticket will appear here.
                </Text>
              </>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

function TicketCard({ ticket, onPress }: { ticket: Ticket; onPress: () => void }) {
  const { tokens, type, radii } = useTheme();
  const event = ticket.event;
  const meta = [formatDate(event.starts_at, event.timezone), event.location_city].filter(Boolean).join(' · ');

  return (
    <PressableSurface
      onPress={onPress}
      accessibilityRole={ticket.confirmed ? 'button' : 'link'}
      accessibilityLabel={[event.name, meta, ticket.checked_in ? 'Checked in' : ticket.display_status]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={ticket.confirmed ? 'Opens your pass' : 'Opens registration in the browser'}
      rippleColor={tokens.text}
      pressedOpacity={0.7}
      style={[
        styles.card,
        { backgroundColor: tokens.bg, borderColor: tokens.box, borderRadius: radii.container },
      ]}
    >
      {event.banner_url ? (
        <View style={[styles.banner, { backgroundColor: tokens.div2 }]}>
          <Image source={{ uri: event.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </View>
      ) : null}
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          {event.logo_url ? (
            <Image
              source={{ uri: event.logo_url }}
              style={[styles.logo, { borderColor: tokens.div2 }]}
              resizeMode="cover"
            />
          ) : null}
          <View style={styles.cardTitleText}>
            <Text style={[type.h2, { color: tokens.textH }]} numberOfLines={2}>
              {event.name}
            </Text>
            {meta ? <Text style={[type.body, { color: tokens.text2 }]}>{meta}</Text> : null}
          </View>
          <Icon name={ticket.confirmed ? 'chevron-right' : 'external-link'} size={16} color={tokens.muted} />
        </View>
        <View style={styles.badgeRow}>
          {ticket.checked_in ? (
            <StatusIndicator type="success" label="Checked in" />
          ) : (
            <Badge label={ticket.display_status} color={ticket.confirmed ? 'blue' : 'grey'} />
          )}
          {/* Unconfirmed tickets prompt the attendee to finish registration. */}
          {!ticket.confirmed ? (
            <Text style={[type.body, { color: tokens.accent }]}>Tap to finish registration</Text>
          ) : null}
        </View>
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 4 },
  back: { marginLeft: -10 },
  headerText: { flex: 1, minWidth: 0 },
  quickActions: { flexDirection: 'row', gap: 12 },
  list: { paddingBottom: 100 },
  card: { borderWidth: 1 },
  banner: { height: 96 },
  cardBody: { paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitleText: { flex: 1, minWidth: 0, gap: 2 },
  logo: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, backgroundColor: '#ffffff' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 64, paddingHorizontal: 32 },
  center: { textAlign: 'center' },
});
