import React, { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedProps, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  SWITCHER_FLICK_VELOCITY,
  SWITCHER_OPEN_THRESHOLD,
  SWITCHER_PULL_DISTANCE,
  SWITCHER_CLOSE_TIMING,
  SWITCHER_SPRING,
  closeSwitcherOverlay,
  rubberBand,
  switcherOverlay,
  switcherProgress,
  switcherPullTick,
  switcherOverpull,
  switcherBannerHeld,
  openSwitcherUnseen,
  releaseUnusedSwitcher,
  type SwitcherBanner,
} from '../navigation/switcherOverlay';
import type { SwitcherCurrent } from '../services/switcherLayout';
import { useEventPassColor } from '../hooks/useEventPassColor';
import { Badge, Icon, OverlayIconButton, PressableSurface, pressedStyle, ripple, type BadgeColor, type IconName } from './ui';
import { easedFade, hackClubColors, linearGradient, overlayTokens, radii, typography, useTheme, withAlpha } from '../theme';
import { CHROME_MAX_FONT_SCALE } from './ui/fontScale';
import { bannerHeight } from '../services/eventBanner';
import type { Event } from '../types';

export { eventBannerText } from '../services/eventBanner';

const ON_BANNER = overlayTokens.on;
/** How tall the band is where a banner fades into a dark page, behind its text. */
const BLEND_HEIGHT = 120;

/**
 * The band at a banner's bottom edge that fades into the page under it, so
 * the banner doesn't end in a hard line. Only into a dark page: fading to
 * white would wash out the white text, so in light mode the banner keeps a
 * clean edge. Draw it after the cover and before the text.
 */
export function BannerBlend({ into, height = BLEND_HEIGHT }: { into: string; height?: number }) {
  const { scheme } = useTheme();
  if (scheme !== 'dark') return null;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.blend,
        { height, backgroundImage: linearGradient(easedFade(into, { from: 0, to: 1, start: 0, end: 100, unit: '%', steps: 32 })) },
      ]}
    />
  );
}

/**
 * The fill behind an event's name: its banner image when it has one, else its
 * logo's colour, else Hack Club red, under faint diagonal stripes.
 */
export function EventCover({
  event,
  children,
  transition = 150,
  onReady,
}: {
  event: Event;
  children?: ReactNode;
  /**
   * The photo's fade-in. 0 where covers mount mid-animation (the switcher):
   * the fade shows the fill colour under the photo for a moment.
   */
  transition?: number;
  /** Once it's drawn: the photo is on screen, or there's no photo. */
  onReady?: () => void;
}) {
  const { tokens } = useTheme();
  const logoColor = useEventPassColor(event.logo_url, !event.banner_url && !!event.logo_url);
  // Under a photo, a dark fill: it shows for a frame or two while the photo
  // decodes, and red there flashed.
  const fill = event.banner_url
    ? overlayTokens.cameraStage
    : event.logo_url
      ? logoColor ?? tokens.brand
      : tokens.brand;
  const hasPhoto = !!event.banner_url;
  useEffect(() => {
    if (!hasPhoto) onReady?.();
  }, [hasPhoto, onReady]);
  const patternId = `stripes-${event.id}`;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]}>
      {event.banner_url ? (
        <>
          <Image
            source={{ uri: event.banner_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={transition}
            onDisplay={onReady}
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
      {/* Darkens towards the bottom, where the name and dates sit. */}
      <View style={[StyleSheet.absoluteFill, styles.bottomShade]} />
      {children}
    </View>
  );
}

/** What makes a banner the way into the event switcher overlay. */
export interface BannerSwitcher {
  /** `bannerKey.event(...)` or `bannerKey.ticket(...)`. */
  key: string;
  current: SwitcherCurrent;
  /** Its screen's root reset, run under the overlay when switching. */
  switchTo: SwitcherBanner['switchTo'];
  /** With one event or none to switch to, it doesn't respond. */
  enabled: boolean;
}

interface EventBannerProps {
  event: Event;
  /** Small line above the name, e.g. "Day 1 of 2". */
  eyebrow?: string | null;
  eyebrowIcon?: IconName;
  /** Line under the name: dates, city, role. */
  meta?: string | null;
  /**
   * Makes it the way into the event switcher: pull it down, or tap it. It
   * registers with the overlay either way, so a switch can land on it.
   */
  switcher?: BannerSwitcher;
  /** Its screen's `useSwitcherPull(switcher)`, which makes it pullable. */
  pull?: ReturnType<typeof useSwitcherPull>;
  /** Space above the content for the status bar and a top tab bar. */
  topInset?: number;
  /** Top-right slot, e.g. the account avatar. Sits outside the pressable area. */
  accessory?: ReactNode;
  /** Shows a back button top left, for a banner on a pushed screen. */
  onBack?: () => void;
  /**
   * The page colour under the banner. On a dark page the bottom edge then
   * fades into it, behind the text, instead of ending in a hard line.
   */
  blendInto?: string;
  style?: StyleProp<ViewStyle>;
}

/** The round chevron after the banner's name, the sign it opens the switcher. */
export function BannerChevron({ style }: { style?: React.ComponentProps<typeof Animated.View>['style'] }) {
  return (
    <Animated.View style={[styles.chevron, style]}>
      <Icon name="chevron-down" size={16} color={ON_BANNER} />
    </Animated.View>
  );
}

/** The banner's eyebrow, name and meta, pinned to the bottom of what holds it. */
export function BannerText({
  name,
  eyebrow,
  eyebrowIcon = 'calendar',
  meta,
  chevron = false,
}: {
  name: string;
  eyebrow?: string | null;
  eyebrowIcon?: IconName;
  meta?: string | null;
  /** True for the plain chevron, or one to show instead (e.g. fading). */
  chevron?: boolean | ReactNode;
}) {
  const { type } = useTheme();
  return (
    <>
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
          {name}
        </Text>
        {chevron === true ? <BannerChevron /> : chevron || null}
      </View>
      {meta ? (
        <Text style={[type.body, styles.onBanner, styles.meta]} maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}>
          {meta}
        </Text>
      ) : null}
    </>
  );
}

/**
 * A banner's picture: the cover with the text pinned to its bottom, `height`
 * tall (status bar space included). The switcher's cards are this, scaled.
 */
export function BannerFace({
  event,
  height,
  topInset,
  eyebrow,
  eyebrowIcon,
  meta,
  chevron,
  children,
  transition,
  onReady,
}: {
  event: Event;
  height: number;
  topInset: number;
  eyebrow?: string | null;
  eyebrowIcon?: IconName;
  meta?: string | null;
  chevron?: boolean | ReactNode;
  /** Drawn between the cover and the text, e.g. the dark-mode fade. */
  children?: ReactNode;
  /** See EventCover. */
  transition?: number;
  /** See EventCover. */
  onReady?: () => void;
}) {
  return (
    <View style={{ height }}>
      <EventCover event={event} transition={transition} onReady={onReady} />
      {children}
      <View style={[styles.heroContent, { minHeight: height, paddingTop: topInset + 56 }]}>
        <BannerText name={event.name} eyebrow={eyebrow} eyebrowIcon={eyebrowIcon} meta={meta} chevron={chevron} />
      </View>
    </View>
  );
}

/**
 * An event's home header, shared by the Overview and the attendee's pass: the
 * event's photo at a 16:9 ratio with its name, day count and dates pinned to
 * the bottom, and (with `switcher`) the way into the event switcher.
 */
export function EventBanner({
  event,
  eyebrow,
  eyebrowIcon = 'calendar',
  meta,
  switcher,
  pull,
  topInset = 0,
  accessory,
  onBack,
  blendInto,
  style,
}: EventBannerProps) {
  const { width } = useWindowDimensions();
  // The banner is the same height with or without the blend, so switching
  // theme doesn't move the page.
  const height = bannerHeight(width, topInset);
  const label = [event.name, eyebrow, meta].filter(Boolean).join('. ');
  const viewRef = useRef<React.ComponentRef<typeof View>>(null);
  const canSwitch = !!switcher?.enabled;

  // Registered while mounted, so the overlay can grow out of it, or land on
  // it after a switch. The latest props are read through a ref.
  const latest = useRef({ event, eyebrow, eyebrowIcon, meta, topInset, blendInto, accessory, switcher });
  useLayoutEffect(() => {
    latest.current = { event, eyebrow, eyebrowIcon, meta, topInset, blendInto, accessory, switcher };
  });
  const key = switcher?.key;
  useEffect(() => {
    if (!key) return;
    const read = () => latest.current;
    return switcherOverlay.registerBanner({
      key,
      get event() { return read().event; },
      get eyebrow() { return read().eyebrow ?? undefined; },
      get eyebrowIcon() { return read().eyebrowIcon; },
      get meta() { return read().meta ?? undefined; },
      get topInset() { return read().topInset; },
      get blendInto() { return read().blendInto; },
      get accessory() { return read().accessory; },
      get current() { return read().switcher?.current ?? {}; },
      switchTo: (home, before) => read().switcher?.switchTo(home, before),
      measure: () =>
        new Promise((resolve) => {
          const view = viewRef.current;
          if (!view) return resolve(null);
          // Synchronous where the new architecture offers it, so the overlay
          // mounts the moment a finger goes down.
          const rect = (view as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect?.();
          if (rect && rect.width > 0) return resolve({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
          view.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, width: w, height: h } : null));
        }),
    });
  }, [key]);

  const face = (
    <BannerFace
      event={event}
      height={height}
      topInset={topInset}
      eyebrow={eyebrow}
      eyebrowIcon={eyebrowIcon}
      meta={meta}
      chevron={canSwitch}
    >
      {blendInto ? <BannerBlend into={blendInto} /> : null}
    </BannerFace>
  );

  const banner = (
    <View ref={viewRef} collapsable={false} style={[styles.hero, style]}>
      {canSwitch && key ? (
        <Pressable
          onPress={() => void switcherOverlay.open(key, true)}
          android_ripple={ripple(withAlpha(overlayTokens.on, 0.18), { foreground: true })}
          style={({ pressed }) => pressedStyle(pressed, 0.8)}
          accessibilityRole="button"
          accessibilityLabel="Switch event"
          accessibilityValue={{ text: label }}
        >
          {face}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={label}>{face}</View>
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

  return pull ? <GestureDetector gesture={pull}>{banner}</GestureDetector> : banner;
}

/**
 * Pulling a banner down to open the switcher, for its screen to hold: the
 * screen's ScrollView and RefreshControl wait for it (`requireToFail`), so a
 * pull that starts on the banner opens the switcher rather than scrolling or
 * refreshing. It follows the finger (`switcherProgress`), with a tick as it
 * passes the point where letting go opens it; let go past it (or flicked)
 * it springs open, short of it back. Only downward: a tap, or an upward drag
 * that scrolls the page, never starts it.
 */
export function useSwitcherPull(switcher: BannerSwitcher | undefined) {
  const key = switcher?.key;
  const past = useSharedValue(false);
  const active = useSharedValue(false);
  const velocity = useSharedValue(0);
  // Mounted (unseen) as the finger goes down, so it's there to follow the
  // first movement.
  const prepare = useCallback(() => {
    if (key) openSwitcherUnseen(key);
  }, [key]);
  return usePanGesture({
    enabled: !!switcher?.enabled,
    activeOffsetY: 3,
    failOffsetY: -3,
    failOffsetX: [-16, 16],
    onBegin: () => {
      'worklet';
      switcherBannerHeld.value = true;
      scheduleOnRN(prepare);
    },
    onActivate: () => {
      'worklet';
      active.value = true;
      past.value = false;
    },
    onUpdate: (e) => {
      'worklet';
      velocity.value = e.velocityY;
      const progress = Math.min(1, Math.max(0, e.translationY / SWITCHER_PULL_DISTANCE));
      switcherProgress.value = progress;
      // Past fully open, the list stretches on down after the finger.
      switcherOverpull.value = rubberBand(e.translationY - SWITCHER_PULL_DISTANCE);
      const isPast = progress >= SWITCHER_OPEN_THRESHOLD;
      if (isPast !== past.value) {
        past.value = isPast;
        if (isPast) scheduleOnRN(switcherPullTick);
      }
    },
    // On release, cancel or failure alike (onFinalize runs for all of them).
    onFinalize: () => {
      'worklet';
      switcherBannerHeld.value = false;
      if (!active.value) {
        // A tap or a scroll: the tap opens it itself, a scroll leaves it.
        scheduleOnRN(releaseUnusedSwitcher);
        return;
      }
      active.value = false;
      switcherOverpull.value = withSpring(0, SWITCHER_SPRING);
      // By how far it got, cancelled or not: the system can cancel the pull
      // as the overlay appears over the banner.
      const opening =
        switcherProgress.value >= SWITCHER_OPEN_THRESHOLD || velocity.value > SWITCHER_FLICK_VELOCITY;
      if (opening) {
        switcherProgress.value = withSpring(1, SWITCHER_SPRING);
      } else {
        switcherProgress.value = withTiming(0, SWITCHER_CLOSE_TIMING, (finished) => {
          if (finished) scheduleOnRN(closeSwitcherOverlay);
        });
      }
    },
  });
}

/**
 * The banner's screen's ScrollView props that keep it still while a finger
 * is down on the banner (see `switcherBannerHeld`). For an Animated
 * (Reanimated) ScrollView's `animatedProps`.
 */
export function useBannerHeldScrollProps() {
  return useAnimatedProps(() => ({ scrollEnabled: !switcherBannerHeld.value }));
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
      pressScale={0.98}
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
  photoScrim: { backgroundColor: withAlpha(overlayTokens.ink, 0.3) },
  bottomShade: {
    backgroundImage: linearGradient(easedFade(overlayTokens.ink, { from: 0, to: 0.6, start: 35, end: 100, unit: '%' })),
  },
  blend: { position: 'absolute', left: 0, right: 0, bottom: 0 },
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
