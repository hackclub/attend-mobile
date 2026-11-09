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
import QRCode from 'react-native-qrcode-svg';
import { AccountButton } from '../components/AccountSheet';
import { EventBanner, eventBannerText } from '../components/EventBanner';
import { WalletButtons } from '../components/WalletButtons';
import { rootNavigation } from '../navigation/rootNavigation';
import {
  startTicketActivity,
  stopTicketActivity,
  isTicketActivityRunning,
  openLiveUpdateSettings,
} from '../../modules/activity-controller/src';
import { api } from '../services/api';
import { resolveTabBarInset } from '../hooks/useTabBarInset';
import { useTheme } from '../theme';
import {
  Button,
  Container,
  Icon,
  KeyValue,
  ListRow,
  StatusIndicator,
  Toggle,
} from '../components/ui';
import type { AppStackParamList, Ticket } from '../types';

type TicketDetailRoute = RouteProp<AppStackParamList, 'TicketDetail'>;
type Nav = NativeStackNavigationProp<AppStackParamList, 'TicketDetail'>;

const HOTLINE = '+18556254225';
const HOTLINE_DISPLAY = '+1 (855) 625 4225';

// Times are shown in the event's timezone (not the device's) so a 9:30 AM
// Pacific event reads as 9:30 AM wherever you open the app.
function formatStart(iso?: string, timezone?: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  try {
    const d = new Date(iso);
    const timeZone = timezone || undefined;
    return {
      date: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone }),
      time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone }),
    };
  } catch {
    // Invalid timezone identifiers throw — fall back to device-local.
    try {
      const d = new Date(iso);
      return {
        date: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      };
    } catch {
      return { date: '', time: '' };
    }
  }
}

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

function formatMessageWhen(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
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

  const event = ticket.event;
  const start = formatStart(event.starts_at, event.timezone);
  const banner = eventBannerText(event, 'Attendee');
  const venue = event.location_address || event.location_city || event.location_country || 'TBA';
  const venueValue =
    event.location_address && event.location_city ? `${event.location_address}, ${event.location_city}` : venue;
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
          <AttendeePass ticket={ticket} />

          {ticket.confirmed && liveActivitySupported ? (
            <Container flush>
              <ListRow
                icon="lock-closed"
                title="Show on Lock Screen"
                divider={false}
                trailing={
                  <Toggle
                    value={liveActivityOn}
                    onValueChange={toggleLiveActivity}
                    accessibilityLabel="Show on Lock Screen"
                  />
                }
              />
            </Container>
          ) : null}

          <View style={styles.infoRow}>
            <InfoBox label="Venue" value={venueValue} />
            <InfoBox label="Starts" value={[start.date, start.time].filter(Boolean).join(' · ') || 'TBA'} />
          </View>
          {hasDestination ? (
            <Button title="Get directions" icon="location" onPress={openDirections} fullWidth />
          ) : null}

          <TravelCard travel={ticket.travel_inbound} />
          <MessagesCard messages={ticket.messages} />

          <Container title="Safety" flush>
            <ListRow
              icon="shield-exclamation"
              title="Report an incident"
              onPress={() => navigation.navigate('IncidentReport')}
            />
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

function AttendeePass({ ticket }: { ticket: Ticket }) {
  const { tokens, type, radii, spacing } = useTheme();
  return (
    <View
      style={[
        styles.pass,
        { backgroundColor: tokens.bg, borderColor: tokens.box, borderRadius: radii.container, gap: spacing.md },
      ]}
    >
      <View style={styles.passTopRow}>
        <Text style={[styles.passLabel, { color: tokens.muted }]}>ATTENDEE PASS</Text>
        <Text style={[type.label, styles.passCode, { color: tokens.text2 }]} selectable>
          {ticket.short_code}
        </Text>
      </View>
      <Text style={[type.h1, styles.center, { color: tokens.textH }]}>{ticket.attendee_name}</Text>
      {ticket.checked_in ? <StatusIndicator type="success" label="Checked in" /> : null}

      {ticket.confirmed ? (
        <>
          <View
            style={[styles.qrBox, { borderColor: tokens.div2 }]}
            accessible
            accessibilityRole="image"
            accessibilityLabel="Check-in QR code"
          >
            {/* Always dark on white: scanners need the contrast in dark mode too. */}
            <QRCode value={ticket.qr_payload} size={188} backgroundColor="#ffffff" color="#0f141a" />
          </View>
          <Text style={[type.body, { color: tokens.text2 }]}>Show this at check-in</Text>
          <WalletButtons ticket={ticket} />
        </>
      ) : (
        <View style={[styles.pending, { gap: spacing.md }]}>
          <Icon name="clock" size={28} color={tokens.muted} />
          <Text style={[type.body, styles.center, { color: tokens.text2 }]}>
            Your pass unlocks once you finish registration.
          </Text>
          <Button
            title="Complete registration"
            variant="primary"
            fullWidth
            onPress={() => Linking.openURL(ticket.onboarding_url).catch(() => {})}
          />
        </View>
      )}
    </View>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  const { tokens, radii } = useTheme();
  return (
    <View style={[styles.infoBox, { backgroundColor: tokens.bg, borderColor: tokens.box, borderRadius: radii.container }]}>
      <KeyValue label={label} value={value} layout="stacked" style={styles.infoKv} />
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

function MessagesCard({ messages }: { messages?: Ticket['messages'] }) {
  const { tokens, type, spacing } = useTheme();
  if (!messages || messages.length === 0) return null;

  return (
    <Container title="Messages">
      <View style={{ gap: spacing.lg }}>
        {messages.map((m) => {
          const when = formatMessageWhen(m.delivered_at);
          return (
            <View key={m.id} style={styles.message}>
              {m.subject ? <Text style={[type.label, { color: tokens.textH }]}>{m.subject}</Text> : null}
              <Text style={[type.body, { color: tokens.text2 }]}>{m.body}</Text>
              <Text style={[type.body, { color: tokens.muted }]}>
                {[m.sender_name || 'Event team', when].filter(Boolean).join(' · ')}
              </Text>
            </View>
          );
        })}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pass: {
    borderWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },
  passTopRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center' },
  passLabel: { flex: 1, fontSize: 12, lineHeight: 20, fontWeight: '700', letterSpacing: 1 },
  passCode: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
  qrBox: { backgroundColor: '#ffffff', padding: 12, borderRadius: 12, borderWidth: 1 },
  pending: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 8 },
  infoRow: { flexDirection: 'row', gap: 12 },
  infoBox: { flex: 1, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 6 },
  infoKv: { flex: 1 },
  stack: { gap: 12 },
  bold: { fontWeight: '700' },
  message: { gap: 4 },
});
