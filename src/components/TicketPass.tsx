import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { useEventPassColor } from '../hooks/useEventPassColor';
import { useBrightnessBoost } from '../hooks/useBrightnessBoost';
import { useOpenLink } from '../hooks/useOpenLink';
import { passColorsFor } from '../services/eventPassColors';
import { formatEventDay, formatEventTime } from '../services/eventStatus';
import { lightTokens, typography, useTheme } from '../theme';
import { Button, Icon, pressedStyle, ripple, STATE_LAYER_ALPHA } from './ui';
import { DashedDivider } from './ui/DashedDivider';
import type { Ticket } from '../types';

// The QR is always dark on white, whatever the scheme: scanners need the
// contrast, so the tile and the enlarged view use the light tokens.
const QR_PAPER = lightTokens.bg;
const QR_INK = lightTokens.textH;

const NOTCH = 12;

interface TicketPassProps {
  ticket: Ticket;
  /** The page colour behind the pass, which the perforation's notches show. */
  pageColor: string;
}

/**
 * The attendee's pass, drawn like a paper ticket: a header band in the
 * event's colour, the check-in QR, and a stub with the venue and start
 * below a perforation.
 */
export function TicketPass({ ticket, pageColor }: TicketPassProps) {
  const openLink = useOpenLink();
  const { tokens, type, radii, spacing, isDark } = useTheme();
  const event = ticket.event;
  const [enlarged, setEnlarged] = useState(false);

  // The same fill as the event's banner when it has no photo: the logo's
  // colour, else Hack Club red, with type that reads on it.
  const logoColor = useEventPassColor(event.logo_url, !!event.logo_url);
  const band = passColorsFor(event.logo_url ? logoColor ?? tokens.brand : tokens.brand);
  // On a dark page the pass sits a step lighter than the page; on a light
  // one it's white with a hairline edge. The edge runs under the notches,
  // which draw their own, so it follows the cut-outs rather than crossing
  // them (a shadow would outline the full rectangle).
  const surface = isDark ? tokens.div2 : tokens.bg;
  const edge = isDark ? undefined : { borderWidth: 1, borderColor: tokens.div2 };

  const parsedStart = event.starts_at ? new Date(event.starts_at) : null;
  const starts = parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : null;
  // The address, then the city, as on the Lock Screen pass.
  const venue = event.location_address || event.location_city || event.location_country || 'TBA';
  const venueDetail = event.location_address ? event.location_city || undefined : undefined;

  return (
    <View style={{ backgroundColor: surface, borderRadius: radii.container }}>
      <View style={[styles.clip, { borderRadius: radii.container }]}>
        {edge ? <View pointerEvents="none" style={[styles.edge, edge, { borderRadius: radii.container }]} /> : null}
        <View style={[styles.band, { backgroundColor: band.background, gap: spacing.xs }]}>
          <View style={styles.bandTop}>
            <Text style={[type.small, styles.eyebrow, { color: band.label }]} maxFontSizeMultiplier={1.4}>
              ATTENDEE PASS
            </Text>
            <Text
              style={[type.label, styles.code, { color: band.foreground }]}
              selectable
              maxFontSizeMultiplier={1.4}
              accessibilityLabel={`Code ${ticket.short_code.split('').join(' ')}`}
            >
              {ticket.short_code}
            </Text>
          </View>
          <Text style={[type.h1, { color: band.foreground }]} numberOfLines={2}>
            {event.name}
          </Text>
          <Text style={[type.h3, styles.attendee, { color: band.foreground }]} numberOfLines={1}>
            {ticket.attendee_name}
          </Text>
        </View>

        <View style={[styles.body, { gap: spacing.md }]}>
          {ticket.confirmed ? (
            <>
              <Pressable
                onPress={() => setEnlarged(true)}
                android_ripple={ripple(QR_INK, { alpha: STATE_LAYER_ALPHA })}
                style={({ pressed }) => [
                  styles.qrTile,
                  { backgroundColor: QR_PAPER, borderRadius: radii.container },
                  pressedStyle(pressed, 0.8),
                ]}
                accessibilityRole="button"
                accessibilityLabel="Check-in QR code"
                accessibilityHint="Shows it full screen, with the screen turned up"
              >
                <QRCode value={ticket.qr_payload} size={184} backgroundColor={QR_PAPER} color={QR_INK} />
              </Pressable>
              {ticket.checked_in ? <CheckedInChip /> : null}
              <Text style={[type.body, styles.center, { color: tokens.muted }]}>
                Show this at check-in · tap to enlarge
              </Text>
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
                onPress={() => openLink(ticket.onboarding_url)}
              />
            </View>
          )}
        </View>

        <View style={styles.perforation}>
          <View style={[styles.notch, styles.notchLeft, edge, { backgroundColor: pageColor }]} />
          <DashedDivider color={tokens.div} style={styles.dashes} />
          <View style={[styles.notch, styles.notchRight, edge, { backgroundColor: pageColor }]} />
        </View>

        <View style={styles.stub}>
          <StubField label="Venue" value={venue} detail={venueDetail} />
          <StubField
            label="Starts"
            value={starts ? formatEventTime(starts, event.timezone) : 'TBA'}
            detail={starts ? formatEventDay(starts, event.timezone) : undefined}
          />
        </View>
      </View>

      {ticket.confirmed ? (
        <EnlargedQr ticket={ticket} visible={enlarged} onClose={() => setEnlarged(false)} />
      ) : null}
    </View>
  );
}

function CheckedInChip() {
  const { tokens, type, radii } = useTheme();
  return (
    <View
      style={[styles.chip, { backgroundColor: tokens.successBg, borderColor: tokens.success, borderRadius: radii.pill }]}
      accessible
      accessibilityLabel="You're checked in"
    >
      <Icon name="check-circle" size={16} color={tokens.success} />
      <Text style={[type.label, { color: tokens.success }]} maxFontSizeMultiplier={1.4}>
        You&apos;re checked in
      </Text>
    </View>
  );
}

function StubField({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const { tokens, type } = useTheme();
  return (
    <View style={styles.stubField} accessible accessibilityLabel={[label, value, detail].filter(Boolean).join(', ')}>
      <Text style={[type.small, styles.eyebrow, { color: tokens.accent }]} maxFontSizeMultiplier={1.4}>
        {label.toUpperCase()}
      </Text>
      <Text style={[type.h2, { color: tokens.textH }]} numberOfLines={2}>
        {value}
      </Text>
      {detail ? (
        <Text style={[type.body, { color: tokens.muted }]} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

/** The QR alone on white, as large as the screen allows and at full brightness. */
function EnlargedQr({ ticket, visible, onClose }: { ticket: Ticket; visible: boolean; onClose: () => void }) {
  const { type, hitTarget } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const size = Math.min(width - 48, height - 260, 420);
  useBrightnessBoost(visible);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {visible ? <StatusBar barStyle="dark-content" /> : null}
      <Pressable
        style={[styles.enlarged, { backgroundColor: QR_PAPER, paddingTop: insets.top, paddingBottom: insets.bottom }]}
        onPress={onClose}
        accessible={false}
      >
        <Pressable
          onPress={onClose}
          android_ripple={ripple(QR_INK, { alpha: STATE_LAYER_ALPHA, borderless: true, radius: hitTarget / 2 })}
          style={({ pressed }) => [
            styles.close,
            { top: insets.top + 8, width: hitTarget, height: hitTarget },
            pressedStyle(pressed),
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Icon name="x" size={24} color={QR_INK} />
        </Pressable>
        <View accessible accessibilityRole="image" accessibilityLabel="Check-in QR code">
          <QRCode value={ticket.qr_payload} size={size} backgroundColor={QR_PAPER} color={QR_INK} />
        </View>
        <Text style={[type.h1, styles.center, { color: QR_INK }]} numberOfLines={2}>
          {ticket.attendee_name}
        </Text>
        <Text style={[type.label, styles.code, { color: lightTokens.muted }]}>{ticket.short_code}</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  edge: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  band: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
  bandTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { flex: 1, fontWeight: typography.label.fontWeight, letterSpacing: 1.5 },
  code: { letterSpacing: 1, fontVariant: ['tabular-nums'] },
  attendee: { fontWeight: typography.body.fontWeight },
  body: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16 },
  qrTile: { padding: 16, overflow: 'hidden' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  center: { textAlign: 'center' },
  pending: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 8 },
  perforation: { height: NOTCH * 2, justifyContent: 'center' },
  dashes: { marginHorizontal: NOTCH + 8 },
  notch: { position: 'absolute', top: 0, width: NOTCH * 2, height: NOTCH * 2, borderRadius: NOTCH },
  notchLeft: { left: -NOTCH },
  notchRight: { right: -NOTCH },
  stub: { flexDirection: 'row', gap: 16, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
  stubField: { flex: 1, gap: 2 },
  enlarged: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
  close: { position: 'absolute', right: 12, alignItems: 'center', justifyContent: 'center' },
});
