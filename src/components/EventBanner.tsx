import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { GestureDetector, usePanGesture, type PanGestureActiveEvent } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  measure,
  scrollTo,
  useAnimatedRef,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  SWITCHER_CLOSE_TIMING,
  SWITCHER_FLICK_VELOCITY,
  SWITCHER_OPEN_THRESHOLD,
  SWITCHER_PULL_DISTANCE,
  SWITCHER_SPRING,
  DEBUG_SWITCHER,
  closeSwitcherOverlay,
  openSwitcherFromPull,
  rubberBand,
  switcherOverlay,
  switcherOverpull,
  switcherProgress,
  switcherDetentTick,
  switcherPullTick,
  switcherSourceRect,
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
  onReady,
}: {
  event: Event;
  children?: ReactNode;
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
  onReady?: () => void;
}) {
  return (
    <View style={{ height }}>
      <EventCover event={event} onReady={onReady} />
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
  const [laidOutHeight, setLaidOutHeight] = useState(height);
  const label = [event.name, eyebrow, meta].filter(Boolean).join('. ');
  const viewRef = useRef<React.ComponentRef<typeof View> | null>(null);
  const canSwitch = !!switcher?.enabled;

  // Registered while mounted, so the overlay can sit over it, grow out of it,
  // or land on it after a switch; again whenever what it shows changes.
  const key = switcher?.key;
  const current = switcher?.current;
  // Read when used rather than registered: they're new on every render.
  const switchToRef = useRef(switcher?.switchTo);
  const accessoryRef = useRef(accessory);
  useLayoutEffect(() => {
    switchToRef.current = switcher?.switchTo;
    accessoryRef.current = accessory;
  });
  useEffect(() => {
    if (!key || !current) return;
    return switcherOverlay.registerBanner({
      key,
      event,
      eyebrow: eyebrow ?? undefined,
      eyebrowIcon,
      meta: meta ?? undefined,
      topInset,
      height: laidOutHeight,
      blendInto,
      get accessory() {
        return accessoryRef.current;
      },
      enabled: canSwitch,
      current,
      switchTo: (home, before) => switchToRef.current?.(home, before),
      measure: () =>
        new Promise((resolve) => {
          const view = viewRef.current;
          if (!view) return resolve(null);
          const rect = (view as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect?.();
          if (rect && rect.width > 0) return resolve({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
          // A banner on a screen that's mounted but not shown (detached) may
          // never answer; give up rather than wait for ever.
          const timer = setTimeout(() => resolve(null), 250);
          view.measureInWindow((x, y, w, h) => {
            clearTimeout(timer);
            resolve(w > 0 && h > 0 ? { x, y, width: w, height: h } : null);
          });
        }),
    });
  }, [blendInto, canSwitch, current, event, eyebrow, eyebrowIcon, key, laidOutHeight, meta, topInset]);

  // Both the pull's ref (measured on the UI thread) and this one.
  const pullRef = pull?.bannerRef;
  const setRef = useCallback(
    (view: React.ComponentRef<typeof View> | null) => {
      viewRef.current = view;
      if (pullRef) (pullRef as unknown as (v: unknown) => void)(view);
    },
    [pullRef]
  );

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
    <Animated.View
      ref={setRef}
      collapsable={false}
      style={[styles.hero, style]}
      onLayout={(e) => setLaidOutHeight(e.nativeEvent.layout.height)}
    >
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
    </Animated.View>
  );

  return pull ? <GestureDetector gesture={pull.gesture}>{banner}</GestureDetector> : banner;
}

/** The page a banner sits over (see BannerScrollView), for its pull to scroll. */
export interface BannerPage {
  scrollRef: AnimatedRef<Animated.ScrollView>;
  /** Its scroll offset, kept by its scroll handler. */
  scrollY: SharedValue<number>;
  /** How far it can scroll. */
  maxScroll: SharedValue<number>;
  /** A fling started from the banner, decaying; the page's own drag stops it. */
  fling: SharedValue<number>;
  /** Whether it's scrolled to its top. */
  atTop: SharedValue<boolean>;
}

/**
 * Every vertical drag that starts on a banner, for the screen that holds it
 * (BannerScrollView). The banner sits over its page rather than in it, so
 * the page's scroll view never sees these touches and can't take them from
 * the switcher. The drag scrolls the page itself, flinging on release like a
 * scroll; once the page is at its top, pulling on down opens the switcher,
 * following the finger both ways (`switcherProgress`), with a tick as it
 * passes the point where letting go opens it. Let go past it (or flicked
 * down) it springs open; short of it, or dragged back, it springs back.
 */
export function useSwitcherPull(switcher: BannerSwitcher | undefined, page: BannerPage) {
  const key = switcher?.key;
  const canSwitch = !!switcher?.enabled;
  const bannerRef = useAnimatedRef<Animated.View>();
  const { scrollRef, scrollY, maxScroll, fling } = page;
  const past = useSharedValue(false);
  const full = useSharedValue(false);
  const active = useSharedValue(false);
  const opened = useSharedValue(false);
  const startScroll = useSharedValue(0);
  const velocity = useSharedValue(0);
  const markOpen = useCallback(() => {
    if (key) openSwitcherFromPull(key);
  }, [key]);
  const callbacks = {
    onBegin: () => {
      'worklet';
      cancelAnimation(fling);
      const m = measure(bannerRef);
      if (m) switcherSourceRect.value = { x: m.pageX, y: m.pageY, width: m.width, height: m.height };
    },
    onActivate: () => {
      'worklet';
      active.value = true;
      opened.value = false;
      past.value = false;
      full.value = false;
      startScroll.value = scrollY.value;
      if (DEBUG_SWITCHER) console.log('[sw] pull activate', 'scrollY', scrollY.value, 'progress', switcherProgress.value);
    },
    onUpdate: (e: PanGestureActiveEvent) => {
      'worklet';
      velocity.value = e.velocityY;
      // The page takes the drag until it's at its top; past that, the pull.
      const target = startScroll.value - e.translationY;
      scrollTo(scrollRef, 0, Math.min(Math.max(0, target), Math.max(maxScroll.value, 0)), false);
      if (!canSwitch) return;
      const pulled = Math.max(0, -target);
      // Not marked open (taking touches, hiding the app from screen readers)
      // until it's let go: changing either under a finger cancels the pull.
      if (pulled > 0) opened.value = true;
      const progress = Math.min(1, pulled / SWITCHER_PULL_DISTANCE);
      switcherProgress.value = progress;
      // Past fully open, the list stretches on down after the finger.
      switcherOverpull.value = rubberBand(pulled - SWITCHER_PULL_DISTANCE);
      const isPast = progress >= SWITCHER_OPEN_THRESHOLD;
      if (isPast !== past.value) {
        past.value = isPast;
        if (isPast) scheduleOnRN(switcherPullTick);
      }
      // A light tap at fully open, where the stretch takes over.
      const isFull = progress >= 1;
      if (isFull !== full.value) {
        full.value = isFull;
        if (isFull) scheduleOnRN(switcherDetentTick);
      }
    },
    // On release, cancel or failure alike (onFinalize runs for all of them).
    onFinalize: () => {
      'worklet';
      if (DEBUG_SWITCHER) console.log('[sw] pull finalize active', active.value, 'opened', opened.value, 'progress', switcherProgress.value, 'vy', velocity.value);
      if (!active.value) return;
      active.value = false;
      if (!opened.value) {
        // A scroll: carried on with the finger's speed, as the page would.
        if (Math.abs(velocity.value) > 50) {
          fling.value = scrollY.value;
          fling.value = withDecay({ velocity: -velocity.value, clamp: [0, Math.max(maxScroll.value, 0)] });
        }
        return;
      }
      opened.value = false;
      switcherOverpull.value = withSpring(0, SWITCHER_SPRING);
      // By where the finger left it, cancelled or not (the system can cancel
      // the pull as the overlay appears over the banner): dragged back short
      // of the threshold, it closes.
      const opening =
        switcherProgress.value >= SWITCHER_OPEN_THRESHOLD || velocity.value > SWITCHER_FLICK_VELOCITY;
      if (opening) {
        scheduleOnRN(markOpen);
        switcherProgress.value = withSpring(1, SWITCHER_SPRING);
      } else {
        switcherProgress.value = withTiming(0, SWITCHER_CLOSE_TIMING, (finished) => {
          if (finished) scheduleOnRN(closeSwitcherOverlay);
        });
      }
    },
  };
  const gesture = usePanGesture({
    // Vertical either way: down opens (or scrolls back up the page), up scrolls.
    activeOffsetY: [-3, 3],
    failOffsetX: [-16, 16],
    onBegin: callbacks.onBegin,
    onActivate: callbacks.onActivate,
    onUpdate: callbacks.onUpdate,
    onFinalize: callbacks.onFinalize,
  });
  // The same pull from anywhere on the page (see BannerScrollView's
  // `pullAnywhere`): only downward, and only with the page at its top, so
  // everything else scrolls the page as usual. It activates within 3dp,
  // before the page's scroll view would take the drag.
  const pageGesture = usePanGesture({
    enabled: canSwitch ? page.atTop : false,
    activeOffsetY: 3,
    failOffsetY: -3,
    failOffsetX: [-16, 16],
    onBegin: callbacks.onBegin,
    onActivate: callbacks.onActivate,
    onUpdate: callbacks.onUpdate,
    onFinalize: callbacks.onFinalize,
  });
  return { gesture, pageGesture, bannerRef };
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
