import React, { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { Portal } from './Portal';
import { useReduceMotion } from '../hooks/useReduceMotion';
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
/** The tile's QR, in points. */
const TILE_QR = 184;

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
  // The tile's QR, measured on tap so the full-screen one grows out of it,
  // and hidden while that one stands in for it.
  const qrRef = useRef<React.ComponentRef<typeof View>>(null);
  const [qrOrigin, setQrOrigin] = useState<QrOrigin | null>(null);
  const [tileHidden, setTileHidden] = useState(false);
  const enlarge = () => {
    const view = qrRef.current;
    if (!view) return setEnlarged(true);
    view.measureInWindow((x, y, width, height) => {
      setQrOrigin(width > 0 ? { x, y, width, height } : null);
      setEnlarged(true);
    });
  };

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
                onPress={enlarge}
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
                <View ref={qrRef} collapsable={false} style={tileHidden ? styles.hidden : null}>
                  <QRCode value={ticket.qr_payload} size={TILE_QR} backgroundColor={QR_PAPER} color={QR_INK} />
                </View>
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
        <EnlargedQr
          ticket={ticket}
          visible={enlarged}
          origin={qrOrigin}
          onShown={() => setTileHidden(true)}
          onClosed={() => {
            setTileHidden(false);
            setEnlarged(false);
          }}
        />
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

/** Where the tile's QR is on screen, for the full-screen one to grow out of. */
interface QrOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How far a drag down goes before letting go closes the full-screen QR. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
const OPEN_TIMING = { duration: 320, easing: Easing.bezier(0.2, 0, 0, 1) };
const CLOSE_TIMING = { duration: 260, easing: Easing.bezier(0.3, 0, 0.2, 1) };

/**
 * The QR alone on white, as large as the screen allows and at full
 * brightness. It grows out of the tile's QR, and shrinks back into it on
 * close; a drag down follows the finger and, let go far enough, closes it.
 */
function EnlargedQr({
  ticket,
  visible,
  origin,
  onShown,
  onClosed,
}: {
  ticket: Ticket;
  visible: boolean;
  origin: QrOrigin | null;
  /** Once it covers the tile's QR (which then hides). */
  onShown: () => void;
  /** Once it has shrunk away. */
  onClosed: () => void;
}) {
  const { type, hitTarget } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const size = Math.min(width - 48, height - 260, 420);
  useBrightnessBoost(visible);

  // Laid out centred, a little above the middle to leave room for the name.
  const cx = width / 2;
  const cy = height / 2 - 40;
  const morph = !!origin && !reduceMotion;
  const ox = morph ? origin!.x + origin!.width / 2 : cx;
  const oy = morph ? origin!.y + origin!.height / 2 : cy;
  const startScale = morph ? origin!.width / size : 1;

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const closing = useSharedValue(false);

  const close = () => {
    if (closing.get()) return;
    closing.set(true);
    drag.set(withTiming(0, CLOSE_TIMING));
    progress.set(
      withTiming(0, CLOSE_TIMING, (finished) => {
        if (finished) scheduleOnRN(onClosed);
      })
    );
  };

  // Opens as soon as it's drawn, over the tile's QR (which then hides).
  useEffect(() => {
    if (!visible) return;
    closing.set(false);
    drag.set(0);
    progress.set(0);
    progress.set(withTiming(1, OPEN_TIMING));
    const frame = requestAnimationFrame(onShown);
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => {
      cancelAnimationFrame(frame);
      sub.remove();
    };
    // Only as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const velocity = useSharedValue(0);
  const pull = usePanGesture({
    activeOffsetY: 8,
    failOffsetY: -8,
    onUpdate: (e) => {
      'worklet';
      velocity.value = e.velocityY;
      drag.value = Math.max(0, e.translationY);
    },
    onFinalize: () => {
      'worklet';
      if (closing.value) return;
      if (drag.value > DISMISS_DISTANCE || velocity.value > DISMISS_VELOCITY) {
        scheduleOnRN(close);
      } else {
        drag.value = withSpring(0, { damping: 22, stiffness: 260 });
      }
    },
  });

  const dragFade = () => {
    'worklet';
    return 1 - Math.min(0.5, drag.value / 600);
  };
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value * dragFade() }));
  const qr = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: morph ? 1 : p,
      transform: [
        { translateX: (ox - cx) * (1 - p) },
        { translateY: (oy - cy) * (1 - p) + drag.value },
        { scale: (startScale + (1 - startScale) * p) * (1 - Math.min(0.15, drag.value / 1200)) },
      ],
    };
  });
  const chrome = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 1], [0, 1], 'clamp') * dragFade(),
  }));

  if (!visible) return null;
  return (
    // Over the whole app, in its window rather than a Modal's (see Portal).
    <Portal>
      <StatusBar barStyle="dark-content" />
      <View style={StyleSheet.absoluteFill}>
        <GestureDetector gesture={pull}>
          <View style={styles.fill}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: QR_PAPER }, backdrop]} />
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false} />
            <Animated.View
              pointerEvents="none"
              style={[styles.bigQr, { width: size, height: size, left: cx - size / 2, top: cy - size / 2 }, qr]}
              accessible
              accessibilityRole="image"
              accessibilityLabel="Check-in QR code"
            >
              <QRCode value={ticket.qr_payload} size={size} backgroundColor={QR_PAPER} color={QR_INK} />
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[styles.bigName, { top: cy + size / 2 + 20 }, chrome]}
            >
              <Text style={[type.h1, styles.center, { color: QR_INK }]} numberOfLines={2}>
                {ticket.attendee_name}
              </Text>
              <Text style={[type.label, styles.code, { color: lightTokens.muted }]}>{ticket.short_code}</Text>
            </Animated.View>
            <Animated.View style={[styles.close, { top: insets.top + 8, width: hitTarget, height: hitTarget }, chrome]}>
              <Pressable
                onPress={close}
                android_ripple={ripple(QR_INK, { alpha: STATE_LAYER_ALPHA, borderless: true, radius: hitTarget / 2 })}
                style={({ pressed }) => [styles.fill, styles.centred, pressedStyle(pressed)]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="x" size={24} color={QR_INK} />
              </Pressable>
            </Animated.View>
          </View>
        </GestureDetector>
      </View>
    </Portal>
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
  fill: { flex: 1 },
  centred: { alignItems: 'center', justifyContent: 'center' },
  hidden: { opacity: 0 },
  bigQr: { position: 'absolute' },
  bigName: { position: 'absolute', left: 24, right: 24, alignItems: 'center', gap: 8 },
  close: { position: 'absolute', right: 12 },
});
