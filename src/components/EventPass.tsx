import React, { forwardRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { HackClubFlag } from './HackClubFlag';
import { useEventPassColor } from '../hooks/useEventPassColor';
import { passColorsFor, WALLET_PASS_RED } from '../services/eventPassColors';
import { eventRoleLabel } from '../services/eventRoles';
import type { Event } from '../types';

// A pass is drawn at one fixed size everywhere it appears, so the card that
// flies out of the stack lands exactly on top of the one in the event home.
export const PASS_HEIGHT = 200;
// How much of each pass shows in the stack before the next one covers it:
// the logo, the name and the date, like a pass in Wallet.
export const PASS_STRIP = 76;
export const PASS_RADIUS = 16;

// Shown in the event's timezone so the date matches the event schedule, with
// the year only when it isn't this year.
export function formatEventDate(dateString?: string, timezone?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
      timeZone: timezone || undefined,
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

interface EventPassProps {
  event: Event;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The front of an event's pass: its banner, or a fill in its logo's main
 * colour, with the logo, name and date along the top as in Apple Wallet.
 */
export const EventPass = forwardRef<React.ComponentRef<typeof View>, EventPassProps>(function EventPass(
  { event, selected, style },
  ref
) {
  const hasBanner = !!event.banner_url;
  const logoColor = useEventPassColor(event.logo_url, !hasBanner);
  const palette = hasBanner
    ? passColorsFor('#000000')
    : passColorsFor(logoColor ?? WALLET_PASS_RED);
  const date = formatEventDate(event.starts_at, event.timezone);
  const role = eventRoleLabel(event.role);

  return (
    <View ref={ref} collapsable={false} style={[styles.shadow, style]}>
      <View style={[styles.pass, { backgroundColor: palette.background }]}>
        {hasBanner ? (
          <>
            <Image
              source={{ uri: event.banner_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={120}
              accessible={false}
            />
            {/* Darker along the top and bottom, where the type sits. */}
            <View style={styles.bannerScrim} />
            <View style={styles.bannerTopBand} />
          </>
        ) : null}

        <View style={styles.strip}>
          {event.logo_url ? (
            <Image
              source={{ uri: event.logo_url }}
              style={styles.logo}
              contentFit="cover"
              transition={120}
              accessible={false}
            />
          ) : (
            <View style={styles.flag}>
              <HackClubFlag width={44} />
            </View>
          )}
          <Text
            style={[styles.name, { color: palette.foreground }]}
            numberOfLines={1}
          >
            {event.name}
          </Text>
          {selected ? (
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={palette.foreground}
              accessibilityLabel="Selected event"
            />
          ) : null}
          {date ? (
            <View style={styles.headerField}>
              <Text style={[styles.label, { color: palette.label }]}>Date</Text>
              <Text style={[styles.headerValue, { color: palette.foreground }]}>
                {date.toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.fields}>
          {event.location_city ? (
            <View style={styles.field}>
              <Text style={[styles.label, { color: palette.label }]}>Location</Text>
              <Text style={[styles.value, { color: palette.foreground }]} numberOfLines={1}>
                {event.location_city}
              </Text>
            </View>
          ) : null}
          {role ? (
            <View style={styles.field}>
              <Text style={[styles.label, { color: palette.label }]}>Your role</Text>
              <Text style={[styles.value, { color: palette.foreground }]} numberOfLines={1}>
                {role}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  shadow: {
    height: PASS_HEIGHT,
    borderRadius: PASS_RADIUS,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 6,
  },
  pass: {
    flex: 1,
    borderRadius: PASS_RADIUS,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  bannerScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
  },
  bannerTopBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: PASS_STRIP,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  strip: {
    height: PASS_STRIP,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  flag: {
    width: 44,
    height: 42,
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerField: {
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  headerValue: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 1,
  },
  fields: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  field: {
    flexShrink: 1,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
});
