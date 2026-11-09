import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabBarHeightContext } from 'react-native-bottom-tabs';
import { setStatusBarStyle } from 'expo-status-bar';
import { AccountButton } from '../components/AccountSheet';
import { EventBanner, eventBannerText } from '../components/EventBanner';
import { EventStatusCard } from '../components/EventStatusCard';
import { TicketPass } from '../components/TicketPass';
import { WalletButtons } from '../components/WalletButtons';
import { rootNavigation } from '../navigation/rootNavigation';
import {
  startTicketActivity,
  stopTicketActivity,
  isTicketActivityRunning,
  openLiveUpdateSettings,
} from '../../modules/activity-controller/src';
import { api } from '../services/api';
import { eventStatus } from '../services/eventStatus';
import { resolveTabBarInset } from '../hooks/useTabBarInset';
import { typography, useTheme } from '../theme';
import {
  Button,
  Container,
  ListRow,
  QuickActionTile,
} from '../components/ui';
import type { AppStackParamList, Ticket } from '../types';

type TicketDetailRoute = RouteProp<AppStackParamList, 'TicketDetail'>;
type Nav = NativeStackNavigationProp<AppStackParamList, 'TicketDetail'>;

const HOTLINE = '+18556254225';
const HOTLINE_DISPLAY = '+1 (855) 625 4225';

function formatFlightWhen(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * The attendee's pass for one event. Pushed from the ticket list, and also
 * used as the top-level view of an event the user only attends, so it must
 * not assume there is a screen to go back to or a tab bar below it.
 */
export function TicketDetailScreen() {
  const { tokens, spacing, barStyle } = useTheme();
  const route = useRoute<TicketDetailRoute>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { height: sceneHeight } = useWindowDimensions();
  // Only present when this screen sits inside the native tab navigator.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const bottomInset = Math.max(insets.bottom, resolveTabBarInset(tabBarHeight, sceneHeight));
  const [ticket, setTicket] = useState<Ticket>(route.params.ticket);

  useEffect(() => {
    let cancelled = false;
    api
      .getMyTicket(route.params.ticket.id)
      .then((fresh) => {
        if (!cancelled) setTicket(fresh);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [route.params.ticket.id]);

  // The header band is a dark fill in both schemes, so use light status bar
  // content while this screen is in view.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(barStyle);
    }, [barStyle]),
  );

  // "Now" for the status card and banner, moved on whenever the pass comes
  // back into view. The unread count on the Messages tile refreshes then too
  // (reading a message clears it).
  const [now, setNow] = useState(() => new Date());
  const [unread, setUnread] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      api.getInbox().then((page) => setUnread(page.unread_count)).catch(() => {});
    }, []),
  );

  const event = ticket.event;
  const banner = eventBannerText(event, 'Attendee', now);
  const venue = event.location_address || event.location_city || event.location_country || 'TBA';
  const ended = eventStatus(event, { now })?.phase === 'ended';
  // Pushed from the ticket list it has a way back; as an event's home (an
  // event the user only attends) it has the account avatar instead.
  const canGoBack = navigation.canGoBack();
  // As an organizer's home for an event they attend, the banner switches
  // events like the Overview's does. (Only organizers have the switcher.)
  const canSwitch = !canGoBack && !!rootNavigation(navigation).getState()?.routeNames?.includes('SwitchEvent');

  // Live Activity: let confirmed attendees pin their pass to the Lock Screen.
  // iOS: a Live Activity. Android: an ongoing notification (a Live Update on
  // Android 16+). Whether the OS allows it is handled when the user taps
  // (areLiveActivitiesSupported can read false on simulators, and Android asks
  // for the notification permission then).
  const liveActivitySupported = Platform.OS === 'ios' || Platform.OS === 'android';
  const [liveActivityOn, setLiveActivityOn] = useState(() => isTicketActivityRunning());

  const toggleLiveActivity = async () => {
    if (liveActivityOn) {
      await stopTicketActivity();
      setLiveActivityOn(false);
      return;
    }
    const ok = await startTicketActivity(
      event.name,
      venue,
      ticket.short_code,
      event.starts_at || new Date().toISOString(),
      ticket.checked_in,
    );
    if (!ok) {
      if (Platform.OS === 'android') {
        Alert.alert(
          'Notifications are off',
          'Allow notifications for Attend to show your pass on the Lock Screen.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open settings', onPress: () => openLiveUpdateSettings() },
          ],
        );
      } else {
        Alert.alert(
          'Live Activities are off',
          'Turn on Live Activities for Attend in Settings → Attend to pin your pass to the Lock Screen.',
        );
      }
    }
    setLiveActivityOn(ok);
  };

  const hasCoords = event.location_latitude != null && event.location_longitude != null;
  const hasDestination = hasCoords || !!(event.location_address || event.location_city);

  // Driving directions in the platform's maps app (coords preferred, else a
  // text query of the address).
  const openDirections = () => {
    const dest = hasCoords
      ? `${event.location_latitude},${event.location_longitude}`
      : encodeURIComponent(
          [event.location_address, event.location_city, event.location_country].filter(Boolean).join(', '),
        );
    const url =
      Platform.OS === 'android'
        ? `https://www.google.com/maps/dir/?api=1&destination=${dest}`
        : `http://maps.apple.com/?daddr=${dest}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={[styles.screen, { backgroundColor: tokens.shaded }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + spacing.xxl }}>
        <EventBanner
          event={event}
          eyebrow={banner.eyebrow}
          eyebrowIcon={banner.eyebrowIcon}
          meta={banner.meta}
          topInset={insets.top}
          onBack={canGoBack ? () => navigation.goBack() : undefined}
          onPress={canSwitch ? () => navigation.navigate('SwitchEvent', { currentTicketId: ticket.id }) : undefined}
          accessory={canGoBack ? undefined : <AccountButton onBanner />}
        />

        <View style={[{ padding: spacing.lg, gap: spacing.lg }]}>
          <TicketPass ticket={ticket} pageColor={tokens.shaded} />
          {ticket.confirmed ? <WalletButtons ticket={ticket} /> : null}

          <EventStatusCard
            event={event}
            checkedIn={ticket.checked_in}
            now={now}
            footer={
              hasDestination && !ended ? (
                <Button title="Get directions" icon="location" onPress={openDirections} fullWidth />
              ) : null
            }
          />

          {ticket.confirmed && liveActivitySupported ? (
            <Container flush>
              <ListRow
                icon="lock-closed"
                title="Show on Lock Screen"
                divider={false}
                toggle={{ value: liveActivityOn, onValueChange: toggleLiveActivity }}
              />
            </Container>
          ) : null}

          {/* Messages and incident reports live in this stack, so they push
              over the pass whether it's a ticket from the list or an event's
              home (an organizer's attended event resets to this stack). */}
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

          <TravelCard travel={ticket.travel_inbound} />

          <Container title="Safety" flush>
            <ListRow
              icon="device-mobile"
              title="24/7 event hotline"
              subtitle={HOTLINE_DISPLAY}
              external
              divider={false}
              onPress={() => Linking.openURL(`tel:${HOTLINE}`).catch(() => {})}
            />
          </Container>
        </View>
      </ScrollView>
    </View>
  );
}

function TravelCard({ travel }: { travel?: Ticket['travel_inbound'] }) {
  const { tokens, type } = useTheme();
  if (!travel) return null;

  const legs = travel.legs && travel.legs.length > 0 ? travel.legs : null;
  const hasSummary = travel.carrier || travel.flight_number || travel.departure_city || travel.arrival_city;
  if (!legs && !hasSummary) return null;

  const rows = legs
    ? legs.map((leg) => ({
        code: leg.flight_code || 'Flight',
        when: formatFlightWhen(leg.departure_time),
        route: [leg.departure_airport, leg.arrival_airport].filter(Boolean).join(' → '),
      }))
    : [
        {
          code: [travel.carrier, travel.flight_number].filter(Boolean).join(' ') || 'Journey',
          when: formatFlightWhen(travel.departure_time || travel.arrival_time),
          route: [travel.departure_city, travel.arrival_city].filter(Boolean).join(' → '),
        },
      ];

  return (
    <Container title="Arriving">
      <View style={styles.stack}>
        {rows.map((row, i) => (
          <View key={i}>
            <Text style={[type.body, { color: tokens.text }]}>
              <Text style={[styles.bold, { color: tokens.textH }]}>{row.code}</Text>
              {row.when ? ` · ${row.when}` : ''}
            </Text>
            {row.route ? <Text style={[type.body, { color: tokens.text2 }]}>{row.route}</Text> : null}
          </View>
        ))}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  quickActions: { flexDirection: 'row', gap: 12 },
  stack: { gap: 12 },
  bold: { fontWeight: typography.label.fontWeight },
});
