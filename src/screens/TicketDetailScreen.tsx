import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Linking, ImageBackground } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { WalletButtons } from '../components/WalletButtons';
import { api } from '../services/api';
import { colors } from '../theme/colors';
import type { RootStackParamList, Ticket } from '../types';

type TicketDetailRoute = RouteProp<RootStackParamList, 'TicketDetail'>;

function formatStart(iso?: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
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

// Live "starts in" countdown. Returns a human label that ticks each second.
function useCountdown(startsAt?: string, endsAt?: string): { label: string; sub: string } {
  const [, force] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    ref.current = setInterval(() => force((n) => n + 1), 1000);
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, []);

  if (!startsAt) return { label: '', sub: '' };
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start;

  if (now >= start && now <= end) return { label: 'Happening now', sub: 'Enjoy the event!' };
  if (now > end) return { label: 'Event ended', sub: '' };

  const diff = start - now;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  let label: string;
  if (days > 0) label = `${days}d ${hours}h ${mins}m`;
  else if (hours > 0) label = `${hours}h ${mins}m ${secs}s`;
  else label = `${mins}m ${secs}s`;

  return { label, sub: 'until doors open' };
}

export function TicketDetailScreen() {
  const route = useRoute<TicketDetailRoute>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
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

  const event = ticket.event;
  const start = formatStart(event.starts_at);
  const countdown = useCountdown(event.starts_at, event.ends_at);
  const venue = event.location_address || event.location_city || event.location_country || 'TBA';

  const hasCoords = event.location_latitude != null && event.location_longitude != null;
  const hasDestination =
    hasCoords || !!(event.location_address || event.location_city);

  // Open Apple Maps with driving directions to the venue (coords preferred,
  // else a text query of the address).
  const openDirections = () => {
    const dest = hasCoords
      ? `${event.location_latitude},${event.location_longitude}`
      : encodeURIComponent(
          [event.location_address, event.location_city, event.location_country]
            .filter(Boolean)
            .join(', ')
        );
    Linking.openURL(`http://maps.apple.com/?daddr=${dest}`).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 }]}>
        {/* Header row */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Boarding-pass card */}
        <View style={styles.pass}>
          {/* Event banner strip with the logo badge (when the event has art) */}
          {event.banner_url ? (
            <View style={styles.bannerStrip}>
              <Image source={{ uri: event.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View style={[StyleSheet.absoluteFill, styles.bannerStripScrim]} />
              {event.logo_url ? (
                <Image source={{ uri: event.logo_url }} style={styles.bannerLogo} resizeMode="cover" />
              ) : null}
            </View>
          ) : null}

          {/* Colored top band */}
          <View style={styles.passTop}>
            <View style={styles.passTopRow}>
              <Text style={styles.passLabel}>ATTENDEE PASS</Text>
              <Text style={styles.passConf}>{ticket.short_code}</Text>
            </View>

            <View style={styles.passBrandRow}>
              {event.logo_url && !event.banner_url ? (
                <Image source={{ uri: event.logo_url }} style={styles.passLogo} resizeMode="cover" />
              ) : null}
              <Text style={styles.passEventName} numberOfLines={2}>
                {event.name}
              </Text>
            </View>

            <Text style={styles.passName}>{ticket.attendee_name}</Text>

            {ticket.confirmed ? (
              <>
                <View style={styles.qrBox}>
                  <QRCode value={ticket.qr_payload} size={190} backgroundColor="white" color={colors.black} />
                </View>
                <Text style={styles.scanHint}>Show this at check-in</Text>
                <View style={styles.walletWrap}>
                  <WalletButtons ticket={ticket} />
                </View>
              </>
            ) : (
              <View style={styles.pendingBox}>
                <Ionicons name="hourglass-outline" size={28} color={colors.white} />
                <Text style={styles.pendingText}>
                  Your pass unlocks once you finish registration.
                </Text>
                <TouchableOpacity
                  style={styles.pendingButton}
                  activeOpacity={0.85}
                  onPress={() => Linking.openURL(ticket.onboarding_url)}
                >
                  <Text style={styles.pendingButtonText}>Complete registration</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Dashed separator (inside the band so the banner runs through it) */}
            <View style={styles.perforation}>
              <View style={styles.dashRow}>
                {Array.from({ length: 26 }).map((_, i) => (
                  <View key={i} style={styles.dash} />
                ))}
              </View>
            </View>
          </View>

          {/* Info tiles: location + start */}
          <View style={styles.passBottom}>
            <View style={styles.tile}>
              <View style={styles.tileHead}>
                <Ionicons name="location-outline" size={16} color={colors.red} />
                <Text style={styles.tileLabel}>VENUE</Text>
              </View>
              <Text style={styles.tileValue} numberOfLines={2}>{venue}</Text>
              {event.location_city && event.location_address ? (
                <Text style={styles.tileSub}>{event.location_city}</Text>
              ) : null}
            </View>
            <View style={styles.tileDivider} />
            <View style={styles.tile}>
              <View style={styles.tileHead}>
                <Ionicons name="time-outline" size={16} color={colors.red} />
                <Text style={styles.tileLabel}>STARTS</Text>
              </View>
              <Text style={styles.tileValue}>{start.time || 'TBA'}</Text>
              {start.date ? <Text style={styles.tileSub}>{start.date}</Text> : null}
            </View>
          </View>

          {/* Directions */}
          {hasDestination ? (
            <TouchableOpacity style={styles.directionsButton} activeOpacity={0.85} onPress={openDirections}>
              <Ionicons name="navigate" size={17} color={colors.white} />
              <Text style={styles.directionsText}>Get directions</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Countdown */}
        {countdown.label ? (
          <View style={styles.countdownCard}>
            <Ionicons name="airplane" size={18} color={colors.blue} style={styles.countdownIcon} />
            <View>
              <Text style={styles.countdownValue}>{countdown.label}</Text>
              {countdown.sub ? <Text style={styles.countdownSub}>{countdown.sub}</Text> : null}
            </View>
            {ticket.checked_in ? (
              <View style={styles.checkedInTag}>
                <Text style={styles.checkedInTagText}>Checked in</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Messages from organizers */}
        <MessagesCard messages={ticket.messages} />

        {/* Inbound travel */}
        <TravelCard travel={ticket.travel_inbound} />

        {/* Safety */}
        <SafetyCard />
      </ScrollView>
    </View>
  );
}

function formatFlightWhen(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function TravelCard({ travel }: { travel?: Ticket['travel_inbound'] }) {
  if (!travel) return null;

  const legs = travel.legs && travel.legs.length > 0 ? travel.legs : null;
  const hasSummary =
    travel.carrier || travel.flight_number || travel.departure_city || travel.arrival_city;
  if (!legs && !hasSummary) return null;

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Ionicons name="airplane" size={16} color={colors.green} />
        <Text style={styles.sectionTitle}>Arriving</Text>
      </View>

      {legs
        ? legs.map((leg, i) => (
            <View key={i} style={styles.travelRow}>
              <Text style={styles.travelCode}>{leg.flight_code || 'Flight'}</Text>
              <Text style={styles.travelRoute}>
                {[leg.departure_airport, leg.arrival_airport].filter(Boolean).join('  →  ')}
              </Text>
              {formatFlightWhen(leg.departure_time) ? (
                <Text style={styles.travelWhen}>{formatFlightWhen(leg.departure_time)}</Text>
              ) : null}
            </View>
          ))
        : (
          <View style={styles.travelRow}>
            <Text style={styles.travelCode}>
              {[travel.carrier, travel.flight_number].filter(Boolean).join(' ') || 'Journey'}
            </Text>
            <Text style={styles.travelRoute}>
              {[travel.departure_city, travel.arrival_city].filter(Boolean).join('  →  ')}
            </Text>
            {formatFlightWhen(travel.departure_time || travel.arrival_time) ? (
              <Text style={styles.travelWhen}>
                {formatFlightWhen(travel.departure_time || travel.arrival_time)}
              </Text>
            ) : null}
          </View>
        )}
    </View>
  );
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

function MessagesCard({ messages }: { messages?: Ticket['messages'] }) {
  if (!messages || messages.length === 0) return null;

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Ionicons name="chatbubble-ellipses" size={16} color={colors.blue} />
        <Text style={styles.sectionTitle}>Messages</Text>
      </View>

      {messages.map((m, i) => (
        <View key={m.id} style={[styles.messageRow, i > 0 && styles.messageRowBorderTop]}>
          <View style={styles.messageMetaRow}>
            <Text style={styles.messageSender}>{m.sender_name || 'Event team'}</Text>
            {formatMessageWhen(m.delivered_at) ? (
              <Text style={styles.messageWhen}>{formatMessageWhen(m.delivered_at)}</Text>
            ) : null}
          </View>
          {m.subject ? <Text style={styles.messageSubject}>{m.subject}</Text> : null}
          <Text style={styles.messageBody}>{m.body}</Text>
        </View>
      ))}
    </View>
  );
}

const HOTLINE = '+18556254225';
const HOTLINE_DISPLAY = '+1 (855) 625 4225';
const INCIDENT_URL = 'https://hack.club/incident';

function SafetyCard() {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Ionicons name="shield-checkmark" size={16} color={colors.red} />
        <Text style={styles.sectionTitle}>Safety</Text>
      </View>

      <TouchableOpacity style={styles.safetyRow} activeOpacity={0.7} onPress={() => Linking.openURL(INCIDENT_URL)}>
        <Ionicons name="flag-outline" size={22} color={colors.text.secondary} />
        <View style={styles.safetyTextWrap}>
          <Text style={styles.safetyTitle}>Report an incident</Text>
          <Text style={styles.safetySubtitle}>hack.club/incident</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
      </TouchableOpacity>

      <View style={styles.safetyDivider} />

      <TouchableOpacity style={styles.safetyRow} activeOpacity={0.7} onPress={() => Linking.openURL(`tel:${HOTLINE}`)}>
        <Ionicons name="call-outline" size={22} color={colors.green} />
        <View style={styles.safetyTextWrap}>
          <Text style={styles.safetyTitle}>24/7 event hotline</Text>
          <Text style={styles.safetySubtitle}>{HOTLINE_DISPLAY}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
      </TouchableOpacity>
    </View>
  );
}

const BAND = colors.red;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16 },
  header: { height: 40, justifyContent: 'center', marginBottom: 8 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[100],
    marginLeft: -4,
  },
  pass: {
    borderRadius: 24,
    backgroundColor: colors.white,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 5,
  },
  passTop: { backgroundColor: BAND, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 0, alignItems: 'center', overflow: 'hidden' },
  bannerStrip: { height: 128, backgroundColor: colors.gray[200], justifyContent: 'flex-end' },
  bannerStripScrim: { backgroundColor: 'rgba(0,0,0,0.15)' },
  bannerLogo: {
    width: 52,
    height: 52,
    borderRadius: 12,
    margin: 14,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.white,
  },
  passTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginBottom: 14 },
  passLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  passConf: { color: colors.white, fontSize: 13, fontWeight: '800', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  passBrandRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 10, marginBottom: 4 },
  passLogo: { width: 40, height: 40, borderRadius: 9, backgroundColor: colors.white },
  passEventName: { flex: 1, color: colors.white, fontSize: 22, fontWeight: '800' },
  passName: {
    alignSelf: 'stretch',
    color: 'rgba(255,255,255,0.95)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 18,
  },
  qrBox: { backgroundColor: colors.white, padding: 14, borderRadius: 16 },
  scanHint: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
  },
  walletWrap: { marginTop: 16, alignItems: 'center' },
  pendingBox: { alignItems: 'center', paddingVertical: 12 },
  pendingText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  pendingButton: { backgroundColor: colors.white, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  pendingButtonText: { color: colors.red, fontSize: 15, fontWeight: '700' },
  perforation: { alignSelf: 'stretch', height: 22, justifyContent: 'center', marginTop: 16 },
  dashRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dash: { width: 7, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.6)' },
  passBottom: { flexDirection: 'row', backgroundColor: colors.white, paddingVertical: 18, paddingHorizontal: 4 },
  tile: { flex: 1, paddingHorizontal: 18 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  tileLabel: { fontSize: 11, fontWeight: '700', color: colors.text.muted, letterSpacing: 1 },
  tileValue: { fontSize: 18, fontWeight: '800', color: colors.text.primary },
  tileSub: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  tileDivider: { width: 1, backgroundColor: colors.gray[100] },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.red,
    borderRadius: 12,
    paddingVertical: 13,
    marginHorizontal: 20,
    marginTop: -2,
    marginBottom: 20,
  },
  directionsText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  countdownIcon: { marginRight: 12 },
  countdownValue: { fontSize: 22, fontWeight: '800', color: colors.text.primary, fontVariant: ['tabular-nums'] },
  countdownSub: { fontSize: 13, color: colors.text.secondary, marginTop: 1 },
  checkedInTag: { marginLeft: 'auto', backgroundColor: colors.green, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  checkedInTagText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  travelRow: { backgroundColor: colors.gray[50], borderRadius: 10, padding: 12, marginBottom: 8 },
  travelCode: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  travelRoute: { fontSize: 14, color: colors.text.secondary, marginTop: 2 },
  travelWhen: { fontSize: 13, color: colors.text.muted, marginTop: 2 },
  messageRow: { paddingVertical: 12 },
  messageRowBorderTop: { borderTopWidth: 1, borderTopColor: colors.gray[100] },
  messageMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  messageSender: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
  messageWhen: { fontSize: 12, color: colors.text.muted },
  messageSubject: { fontSize: 14, fontWeight: '600', color: colors.text.primary, marginBottom: 2 },
  messageBody: { fontSize: 14, color: colors.text.secondary, lineHeight: 20 },
  safetyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  safetyTextWrap: { flex: 1 },
  safetyTitle: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  safetySubtitle: { fontSize: 13, color: colors.text.secondary, marginTop: 1 },
  safetyDivider: { height: 1, backgroundColor: colors.gray[100] },
});
