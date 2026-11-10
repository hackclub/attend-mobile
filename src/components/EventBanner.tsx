import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { useEventPassColor } from '../hooks/useEventPassColor';
import { Badge, Icon, OverlayIconButton, PressableSurface, pressedStyle, ripple, type BadgeColor, type IconName } from './ui';
import { hackClubColors, overlayTokens, radii, typography, useTheme, withAlpha } from '../theme';
import { CHROME_MAX_FONT_SCALE } from './ui/fontScale';
import { bannerHeight } from '../services/eventBanner';
import type { Event } from '../types';

export { eventBannerText } from '../services/eventBanner';

const ON_BANNER = overlayTokens.on;

/**
 * The fill behind an event's name: its banner image when it has one, else its
 * logo's colour, else Hack Club red, under faint diagonal stripes.
 */
export function EventCover({ event, children }: { event: Event; children?: ReactNode }) {
  const { tokens } = useTheme();
  const logoColor = useEventPassColor(event.logo_url, !event.banner_url && !!event.logo_url);
  const fill = event.logo_url ? logoColor ?? tokens.brand : tokens.brand;
  const patternId = `stripes-${event.id}`;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]}>
      {event.banner_url ? (
        <>
          <Image
            source={{ uri: event.banner_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            accessible={false}
          />
          {/* Keeps white type legible on any photo. */}
          <View style={[StyleSheet.absoluteFill, styles.photoScrim]} />
        </>
      ) : (
        <Svg style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Defs>
            <Pattern
              id={patternId}
              patternUnits="userSpaceOnUse"
              width={32}
              height={32}
              patternTransform="rotate(45)"
            >
              <Rect width={16} height={32} fill={withAlpha(overlayTokens.on, 0.07)} />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${patternId})`} />
        </Svg>
      )}
      {children}
    </View>
  );
}

interface EventBannerProps {
  event: Event;
  /** Small line above the name, e.g. "Day 1 of 2". */
  eyebrow?: string | null;
  eyebrowIcon?: IconName;
  /** Line under the name: dates, city, role. */
  meta?: string | null;
  /** Opens the switcher. Without it the banner isn't pressable and has no chevron. */
  onPress?: () => void;
  /** Space above the content for the status bar and a top tab bar. */
  topInset?: number;
  /** Top-right slot, e.g. the account avatar. Sits outside the pressable area. */
  accessory?: ReactNode;
  /** Shows a back button top left, for a banner on a pushed screen. */
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * An event's home header, shared by the Overview and the attendee's pass: the
 * event's photo at a 16:9 ratio with its name, day count and dates pinned to
 * the bottom, and (when `onPress` is set) the way into the switcher.
 */
export function EventBanner({
  event,
  eyebrow,
  eyebrowIcon = 'calendar',
  meta,
  onPress,
  topInset = 0,
  accessory,
  onBack,
  style,
}: EventBannerProps) {
  const { type } = useTheme();
  const { width } = useWindowDimensions();
  const height = bannerHeight(width, topInset);
  const label = [event.name, eyebrow, meta].filter(Boolean).join('. ');

  const content = (
    <View style={[styles.heroContent, { minHeight: height, paddingTop: topInset + 56 }]}>
      {eyebrow ? (
        <View style={styles.eyebrow}>
          <Icon name={eyebrowIcon} size={16} color={ON_BANNER} />
          <Text style={[type.label, styles.onBanner]} maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}>
            {eyebrow}
          </Text>
        </View>
      ) : null}
      <View style={styles.nameRow}>
        <Text style={[styles.heroName, styles.onBanner]} numberOfLines={2} accessibilityRole="header">
          {event.name}
        </Text>
        {onPress ? (
          <View style={styles.chevron}>
            <Icon name="chevron-down" size={16} color={ON_BANNER} />
          </View>
        ) : null}
      </View>
      {meta ? (
        <Text style={[type.body, styles.onBanner, styles.meta]} maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}>
          {meta}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.hero, style]}>
      <EventCover event={event} />
      {onPress ? (
        <Pressable
          onPress={onPress}
          android_ripple={ripple(withAlpha(overlayTokens.on, 0.18))}
          style={({ pressed }) => pressedStyle(pressed, 0.8)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Switch event"
        >
          {content}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={label}>{content}</View>
      )}
      {onBack ? (
        <OverlayIconButton
          icon="back"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={4}
          style={[styles.back, { top: topInset + 8 }]}
        />
      ) : null}
      {accessory ? <View style={[styles.accessory, { top: topInset + 8 }]}>{accessory}</View> : null}
    </View>
  );
}

interface EventCardProps {
  event: Event;
  /** "Day 1 of 2 · Event Admin". */
  meta?: string | null;
  selected?: boolean;
  /** A status under the meta line, e.g. "Checked in". */
  badge?: { label: string; color: BadgeColor } | null;
  onPress: () => void;
  accessibilityHint?: string;
}

/** One event in the switcher. */
export function EventCard({ event, meta, selected, badge, onPress, accessibilityHint }: EventCardProps) {
  const { type, radii } = useTheme();
  return (
    <PressableSurface
      onPress={onPress}
      // The photo would hide a ripple drawn under it.
      rippleColor={ON_BANNER}
      rippleAlpha={0.18}
      rippleForeground
      pressedOpacity={0.8}
      style={[styles.card, { borderRadius: radii.container }]}
      contentStyle={styles.cardContent}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={[event.name, meta, badge?.label].filter(Boolean).join('. ')}
      accessibilityHint={accessibilityHint}
    >
      <EventCover event={event} />
      {selected ? (
        <View style={styles.selectedMark}>
          <Icon name="check" size={16} color={hackClubColors.red} />
        </View>
      ) : null}
      <View style={styles.cardText}>
        <Text style={[styles.cardName, styles.onBanner]} numberOfLines={2}>{event.name}</Text>
        {meta ? <Text style={[type.body, styles.onBanner]} numberOfLines={1}>{meta}</Text> : null}
        {badge ? <Badge label={badge.label} color={badge.color} style={styles.cardBadge} /> : null}
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  hero: { overflow: 'hidden' },
  // Text pinned to the bottom, so the photo shows above it.
  heroContent: { paddingHorizontal: 16, paddingBottom: 16, justifyContent: 'flex-end' },
  photoScrim: { backgroundColor: withAlpha(overlayTokens.ink, 0.45) },
  onBanner: { color: ON_BANNER },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  // The banner name is display type, a step up from h1.
  heroName: {
    ...typography.h1,
    fontSize: typography.h1.fontSize * 1.25,
    lineHeight: typography.h1.lineHeight * 1.2,
    flexShrink: 1,
  },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: withAlpha(overlayTokens.on, 0.22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { marginTop: 2 },
  accessory: { position: 'absolute', right: 16 },
  back: { position: 'absolute', left: 12 },
  // Clips the cover photo to the card's corners (iOS doesn't clip a Pressable).
  card: { height: 150, overflow: 'hidden' },
  cardContent: { justifyContent: 'flex-end' },
  selectedMark: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: ON_BANNER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 8 },
  cardBadge: { alignSelf: 'flex-start', marginTop: 6 },
  cardName: { ...typography.h1, fontSize: typography.h1.fontSize - 2, lineHeight: typography.h1.lineHeight - 2 },
});
