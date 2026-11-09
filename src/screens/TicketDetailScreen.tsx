import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
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
import { WalletButtons } from '../components/WalletButtons';
import {
  startTicketActivity,
  stopTicketActivity,
  isTicketActivityRunning,
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
  pressedStyle,
  ripple,
} from '../components/ui';
import type { RootStackParamList, Ticket } from '../types';

type TicketDetailRoute = RouteProp<RootStackParamList, 'TicketDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList, 'TicketDetail'>;

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

// Live "starts in" countdown, ticking each second.
function useCountdown(startsAt?: string, endsAt?: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!startsAt) return '';
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start;

  if (now >= start && now <= end) return 'Happening now';
  if (now > end) return 'Event ended';

  const diff = start - now;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  let label: string;
  if (days > 0) label = `${days}d ${hours}h ${mins}m`;
  else if (hours > 0) label = `${hours}h ${mins}m ${secs}s`;
  else label = `${mins}m ${secs}s`;
  return `${label} until doors open`;
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
  const countdown = useCountdown(event.starts_at, event.ends_at);
  const venue = event.location_address || event.location_city || event.location_country || 'TBA';
  const venueValue =
    event.location_address && event.location_city ? `${event.location_address}, ${event.location_city}` : venue;
  const canGoBack = navigation.canGoBack();

  // Live Activity: let confirmed attendees pin their pass to the Lock Screen.
  // Shown on any iOS device; whether the OS actually allows it is handled when
  // the user taps (areLiveActivitiesSupported can read false on simulators).
  const liveActivitySupported = Platform.OS === 'ios';
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
      Alert.alert(
        'Live Activities are off',
        'Turn on Live Activities for Attend in Settings → Attend to pin your pass to the Lock Screen.',
      );
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

  const meta = [start.date, event.location_city].filter(Boolean).join(' · ');

  return (
    <View style={[styles.screen, { backgroundColor: tokens.shaded }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + spacing.xxl }}>
        {/* Event header band */}
        <View style={[styles.hero, { paddingTop: insets.top + 56, backgroundColor: tokens.brand }]}>
          {event.banner_url ? (
            <>
              <Image source={{ uri: event.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View style={[StyleSheet.absoluteFill, styles.heroScrim]} />
            </>
          ) : null}
          {canGoBack ? (
            <Pressable
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              android_ripple={ripple('rgba(255,255,255,0.3)', { borderless: true, radius: 22 })}
              style={({ pressed }) => [styles.back, { top: insets.top + 8 }, pressedStyle(pressed)]}
              hitSlop={8}
            >
              <Icon name="chevron-left" size={22} color="#ffffff" />
            </Pressable>
          ) : null}
          <View style={styles.heroBody}>
            {event.logo_url ? (
              <Image source={{ uri: event.logo_url }} style={styles.heroLogo} resizeMode="cover" />
            ) : null}
            {countdown ? (
              <View style={styles.heroCountdown}>
                <Icon name="clock" size={16} color="#ffffff" />
                <Text style={styles.heroCountdownText}>{countdown}</Text>
              </View>
            ) : null}
            <Text style={styles.heroTitle} numberOfLines={2} accessibilityRole="header">
              {event.name}
            </Text>
            {meta ? <Text style={styles.heroMeta}>{meta}</Text> : null}
          </View>
        </View>

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
  hero: { minHeight: 200, justifyContent: 'flex-end', overflow: 'hidden' },
  heroScrim: { backgroundColor: 'rgba(15,20,26,0.5)' },
  back: {
    position: 'absolute',
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  heroBody: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8, gap: 4 },
  heroLogo: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#ffffff', marginBottom: 8 },
  heroCountdown: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroCountdownText: { color: '#ffffff', fontSize: 14, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroTitle: { color: '#ffffff', fontSize: 30, lineHeight: 36, fontWeight: '700' },
  heroMeta: { color: '#ffffff', fontSize: 14, lineHeight: 20 },
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
