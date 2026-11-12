import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  BackHandler,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';
import { BannerBlend, BannerText, EventCover } from './EventBanner';
import { Button, EmptyState, ErrorView, GroupToggle, Icon, PressableSurface, TextField } from './ui';
import { CHROME_MAX_FONT_SCALE } from './ui/fontScale';
import { useApp } from '../context/AppContext';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useSwitcherEvents } from '../hooks/useSwitcherEvents';
import { eventHomeState, passHomeState } from '../navigation/routes';
import {
  SWITCHER_FLICK_VELOCITY,
  SWITCHER_OPEN_THRESHOLD,
  SWITCHER_PULL_DISTANCE,
  SWITCHER_SPRING,
  bannerKey,
  switcherOverlay,
  switcherProgress,
  type Rect,
  type SwitcherBanner,
} from '../navigation/switcherOverlay';
import { eventPhaseLabel } from '../services/eventDates';
import { eventRoleLabel } from '../services/eventRoles';
import {
  SWITCHER_SEARCH_THRESHOLD,
  filterSwitcherEvents,
  switcherEventCount,
} from '../services/eventSwitcher';
import { haptics } from '../services/haptics';
import {
  bannerTargetTop,
  contentHeight,
  currentIsPast,
  currentRowIndex,
  initialScrollOffset,
  rowHeight,
  rowOffsets,
  switcherMetrics,
  switcherRows,
  type SwitcherRow,
} from '../services/switcherLayout';
import { easedFade, linearGradient, overlayTokens, radii, typography, useTheme } from '../theme';
import type { Event } from '../types';

const HEADER_BAR = 56;
const SEARCH_BAR = 64;
const SIDE = 16;
/** How far the other cards travel in as it opens. */
const CARD_SLIDE = 48;
/** How long a switch waits for the new screen's banner before just fading. */
const LANDING_WAIT_MS = 1500;
const FADE_MS = 220;

/**
 * The event switcher overlay, mounted over the whole app while open (see
 * navigation/switcherOverlay). Nothing renders while it's closed.
 */
export function SwitcherOverlayHost() {
  const state = useSyncExternalStore(switcherOverlay.subscribe, switcherOverlay.get, switcherOverlay.get);
  if (state.status === 'closed') return null;
  return <SwitcherOverlay source={state.source} sourceRect={state.sourceRect} animateIn={state.animateIn} />;
}

/** Whether the overlay is up, e.g. to hide the app under it from screen readers. */
export function useSwitcherOverlayOpen(): boolean {
  return useSyncExternalStore(
    switcherOverlay.subscribe,
    () => switcherOverlay.get().status !== 'closed',
    () => false
  );
}

const joinMeta = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

function rowEvent(row: SwitcherRow): Event | null {
  if (row.kind === 'event') return row.event;
  if (row.kind === 'ticket') return row.ticket.event;
  return null;
}

function rowMeta(row: SwitcherRow): string {
  if (row.kind === 'event') return joinMeta(eventPhaseLabel(row.event, undefined, 'in'), eventRoleLabel(row.event.role));
  if (row.kind === 'ticket') return joinMeta(eventPhaseLabel(row.ticket.event, undefined, 'in'), 'Attendee');
  return '';
}

/** What the morphing card shows: the banner at one end, a card at the other. */
interface HeroContent {
  event: Event;
  eyebrow?: string;
  eyebrowIcon?: SwitcherBanner['eyebrowIcon'];
  bannerMeta?: string;
  cardMeta: string;
  topInset: number;
  blendInto?: string;
}

const heroFromBanner = (banner: SwitcherBanner, cardMeta: string): HeroContent => ({
  event: banner.event,
  eyebrow: banner.eyebrow,
  eyebrowIcon: banner.eyebrowIcon,
  bannerMeta: banner.meta,
  cardMeta,
  topInset: banner.topInset,
  blendInto: banner.blendInto,
});

function SwitcherOverlay({
  source,
  sourceRect,
  animateIn,
}: {
  source: SwitcherBanner;
  sourceRect: Rect;
  animateIn: boolean;
}) {
  const { tokens, type, barStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const { selectEvent } = useApp();
  const { groups: allGroups, isLoading, loadFailed, refresh } = useSwitcherEvents();
  const current = source.current;
  const progress = switcherProgress;

  // Layout, all in fixed heights (services/switcherLayout).
  const metrics = useMemo(() => switcherMetrics(width, insets.bottom), [width, insets.bottom]);
  const cardWidth = width - SIDE * 2;
  const searchable = switcherEventCount(allGroups) > SWITCHER_SEARCH_THRESHOLD;
  const headerHeight = insets.top + HEADER_BAR;
  const viewportTop = headerHeight + (searchable ? SEARCH_BAR : 0);
  const viewportHeight = height - viewportTop;

  const [query, setQuery] = useState('');
  const searching = searchable && query.trim().length > 0;
  // Past starts open when the current event is a past one.
  const [pastOpen, setPastOpen] = useState(() => currentIsPast(allGroups, current));
  const groups = useMemo(
    () => (searchable ? filterSwitcherEvents(allGroups, query) : allGroups),
    [allGroups, query, searchable]
  );
  const rows = useMemo(
    () => switcherRows(groups, current, { pastOpen, searching, loading: isLoading }),
    [current, groups, isLoading, pastOpen, searching]
  );
  const offsets = useMemo(() => rowOffsets(rows, metrics), [rows, metrics]);
  const currentIndex = currentRowIndex(rows);

  // Opens scrolled so the current card sits where the banner was.
  const [initialOffset] = useState(() => {
    if (currentIndex < 0) return 0;
    const targetTop = bannerTargetTop(
      { bannerTop: sourceRect.y + source.topInset, bannerBottom: sourceRect.y + sourceRect.height, viewportTop },
      metrics.cardHeight
    );
    return initialScrollOffset({
      cardTop: offsets[currentIndex],
      targetTop,
      contentHeight: contentHeight(rows, metrics),
      viewportHeight,
    });
  });

  const scrollY = useSharedValue(initialOffset);
  // The current card's top in the list, or -1 when it isn't listed (still
  // loading, filtered out by a search, in a collapsed Past).
  const currentTop = useSharedValue(currentIndex >= 0 ? offsets[currentIndex] : -1);
  useEffect(() => {
    currentTop.set(currentIndex >= 0 ? offsets[currentIndex] : -1);
  }, [currentIndex, currentTop, offsets]);

  // The morphing card: between `bannerRect` (progress 0) and a card (1),
  // the current one's live place in the list unless `landingCard` is set.
  const heroOn = useSharedValue(reduceMotion || currentIndex < 0 ? 0 : 1);
  const bannerRect = useSharedValue<Rect>(sourceRect);
  const landingCard = useSharedValue<Rect | null>(null);
  const [hero, setHero] = useState<HeroContent>(() => {
    const row = currentIndex >= 0 ? rows[currentIndex] : null;
    return heroFromBanner(source, row ? rowMeta(row) : '');
  });
  // The card a switch is growing out of, hidden under the hero meanwhile.
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (reduceMotion) heroOn.set(0);
  }, [heroOn, reduceMotion]);

  // A tap plays the opening by itself; a pull is already driving it.
  useEffect(() => {
    if (!animateIn) return;
    progress.set(reduceMotion ? withTiming(1, { duration: FADE_MS }) : withSpring(1, SWITCHER_SPRING));
  }, [animateIn, progress, reduceMotion]);

  // Status bar: the page's style once the overlay covers the banner, the
  // banner's light one again as it goes. The banner sets light only while
  // it's under the status bar.
  const bannerUnderStatusBar = sourceRect.y + sourceRect.height > insets.top + 1;
  const restoreStyle = bannerUnderStatusBar ? 'light' : barStyle;
  useAnimatedReaction(
    () => progress.value > 0.5,
    (covered, was) => {
      if (covered !== was) scheduleOnRN(setStatusBarStyle, covered ? barStyle : restoreStyle);
    },
    [barStyle, restoreStyle]
  );

  const isCurrentOnScreen = useCallback(() => {
    if (currentTop.value < 0) return false;
    const top = viewportTop + currentTop.value - scrollY.value;
    return top + metrics.cardHeight > viewportTop && top < height;
  }, [currentTop, height, metrics.cardHeight, scrollY, viewportTop]);

  /** Back into the banner, or a fade when the current card is off-screen. */
  const close = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    heroOn.set(!reduceMotion && isCurrentOnScreen() ? 1 : 0);
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(switcherOverlay.closed);
    };
    progress.set(
      reduceMotion || !heroOn.get() ? withTiming(0, { duration: FADE_MS }, done) : withSpring(0, SWITCHER_SPRING, done)
    );
  }, [heroOn, isCurrentOnScreen, progress, reduceMotion]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  /**
   * Switches under the overlay, then grows the picked card into the new
   * screen's banner (or fades, if that banner doesn't turn up).
   */
  const pick = useCallback(
    async (row: SwitcherRow, index: number) => {
      if (row.kind !== 'event' && row.kind !== 'ticket') return;
      if (row.current) {
        close();
        return;
      }
      if (busy.current) return;
      busy.current = true;
      haptics.selection();
      const cardRect: Rect = {
        x: SIDE,
        y: viewportTop + offsets[index] - scrollY.value,
        width: cardWidth,
        height: metrics.cardHeight,
      };
      setPickedKey(row.key);
      // Fully covered while the screens change under it.
      progress.set(1);

      const event = row.kind === 'event' ? row.event : row.ticket.event;
      if (row.kind === 'event') source.switchTo(eventHomeState(), () => void selectEvent(row.event));
      else source.switchTo(passHomeState(row.ticket));
      // The new screen sets the banner's status bar as it focuses; it's
      // still under the overlay.
      requestAnimationFrame(() => setStatusBarStyle(barStyle));

      const key = row.kind === 'event' ? bannerKey.event(row.event) : bannerKey.ticket(row.ticket);
      const target = await switcherOverlay.waitForBanner(key, LANDING_WAIT_MS);
      const targetRect = target && !reduceMotion ? await target.measure() : null;
      const done = (finished?: boolean) => {
        'worklet';
        if (finished) scheduleOnRN(switcherOverlay.closed);
      };
      if (target && targetRect) {
        setHero({ ...heroFromBanner(target, rowMeta(row)), event });
        bannerRect.set(targetRect);
        landingCard.set(cardRect);
        heroOn.set(1);
        // A frame for the hero to render the picked event before it moves.
        requestAnimationFrame(() => {
          progress.set(withSpring(0, SWITCHER_SPRING, done));
        });
      } else {
        heroOn.set(0);
        progress.set(withTiming(0, { duration: FADE_MS }, done));
      }
    },
    [
      bannerRect, barStyle, cardWidth, close, heroOn, landingCard, metrics.cardHeight, offsets, progress,
      reduceMotion, scrollY, selectEvent, source, viewportTop,
    ]
  );

  // Pulling the header back up closes it, following the finger.
  const pullUp = usePanGesture({
    activeOffsetY: -8,
    failOffsetY: 8,
    onActivate: () => {
      'worklet';
      if (currentTop.value < 0 || reduceMotion) {
        heroOn.set(0);
        return;
      }
      const top = viewportTop + currentTop.value - scrollY.value;
      heroOn.set(top + metrics.cardHeight > viewportTop && top < height ? 1 : 0);
    },
    onUpdate: (e) => {
      'worklet';
      progress.set(Math.min(1, Math.max(0, 1 + e.translationY / SWITCHER_PULL_DISTANCE)));
    },
    onDeactivate: (e) => {
      'worklet';
      if (progress.value < 1 - SWITCHER_OPEN_THRESHOLD || e.velocityY < -SWITCHER_FLICK_VELOCITY) {
        progress.set(
          withSpring(0, SWITCHER_SPRING, (finished) => {
            if (finished) scheduleOnRN(switcherOverlay.closed);
          })
        );
      } else {
        progress.set(withSpring(1, SWITCHER_SPRING));
      }
    },
  });

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const listRef = useRef<Animated.FlatList<SwitcherRow>>(null);
  const scrolledInitially = useRef(false);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6], [0, 1], Extrapolation.CLAMP),
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.3, 1], [0, 1], Extrapolation.CLAMP),
  }));
  // With the hero off (reduced motion, a fade) the list fades as a whole.
  const listStyle = useAnimatedStyle(() => ({
    opacity: heroOn.value ? 1 : interpolate(progress.value, [0, 0.8], [0, 1], Extrapolation.CLAMP),
  }));

  const renderItem = ({ item, index }: ListRenderItemInfo<SwitcherRow>) => {
    if (item.kind === 'header') {
      return (
        <RowFade progress={progress} heroOn={heroOn} style={[styles.header, { height: metrics.headerHeight }]}>
          <Text style={[type.label, { color: tokens.text2 }]} accessibilityRole="header">
            {item.label}
          </Text>
        </RowFade>
      );
    }
    if (item.kind === 'past') {
      return (
        <RowFade progress={progress} heroOn={heroOn} style={[styles.header, { height: metrics.toggleHeight }]}>
          <GroupToggle
            label="Past"
            count={item.count}
            open={item.open}
            onToggle={item.toggleable ? () => setPastOpen((open) => !open) : undefined}
          />
        </RowFade>
      );
    }
    const slide = currentIndex < 0 ? 1 : index < currentIndex ? -1 : 1;
    return (
      <CardRow
        row={item}
        height={metrics.cardHeight}
        gap={metrics.cardGap}
        progress={progress}
        heroOn={heroOn}
        slide={reduceMotion ? 0 : slide * CARD_SLIDE}
        // The card the hero stands in for stays hidden while it does.
        isHeroCard={item.key === pickedKey || (pickedKey === null && item.kind !== 'placeholder' && item.current)}
        onPress={() => void pick(item, index)}
      />
    );
  };

  const empty = switcherEventCount(allGroups) === 0;
  const footer = !empty ? (
    searching && switcherEventCount(groups) === 0 ? <EmptyState title={`No events match “${query.trim()}”`} /> : null
  ) : isLoading ? null : loadFailed ? (
    <ErrorView
      title="Couldn’t load your events"
      message="Check your connection and try again."
      onRetry={() => void refresh()}
    />
  ) : (
    <EmptyState title="No events available" />
  );

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: tokens.bg }, backdropStyle]}
      />

      <Animated.View style={[styles.list, { top: viewportTop }, listStyle]}>
        <Animated.FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderItem}
          getItemLayout={(_, index) => ({
            length: rowHeight(rows[index], metrics),
            offset: offsets[index] - metrics.paddingTop,
            index,
          })}
          contentContainerStyle={{ paddingTop: metrics.paddingTop, paddingBottom: metrics.paddingBottom }}
          contentOffset={{ x: 0, y: initialOffset }}
          onLayout={() => {
            // Android may not apply contentOffset; this lands before the
            // cards have faded in.
            if (scrolledInitially.current) return;
            scrolledInitially.current = true;
            if (initialOffset > 0) listRef.current?.scrollToOffset({ offset: initialOffset, animated: false });
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListFooterComponent={footer ?? undefined}
          initialNumToRender={12}
          windowSize={7}
        />
      </Animated.View>

      <GestureDetector gesture={pullUp}>
        <Animated.View style={[styles.top, { backgroundColor: tokens.bg }, chromeStyle]}>
          <View style={[styles.headerBar, { paddingTop: insets.top, height: headerHeight }]}>
            <Text
              style={[type.h2, styles.title, { color: tokens.textH }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
            >
              Switch event
            </Text>
            <Button variant="plain-icon" icon="close" title="Close" onPress={close} />
          </View>
          {searchable ? (
            <View style={styles.search}>
              <TextField
                icon="search"
                placeholder="Search events"
                value={query}
                onChangeText={setQuery}
                clearable
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Search events"
              />
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>

      <Hero
        content={hero}
        progress={progress}
        heroOn={heroOn}
        bannerRect={bannerRect}
        landingCard={landingCard}
        currentTop={currentTop}
        scrollY={scrollY}
        viewportTop={viewportTop}
        card={{ x: SIDE, width: cardWidth, height: metrics.cardHeight }}
      />
    </View>
  );
}

/** A header row, fading in with the list. */
function RowFade({
  progress,
  heroOn,
  style,
  children,
}: {
  progress: SharedValue<number>;
  heroOn: SharedValue<number>;
  style: React.ComponentProps<typeof View>['style'];
  children: React.ReactNode;
}) {
  const animated = useAnimatedStyle(() => ({
    opacity: heroOn.value ? interpolate(progress.value, [0.4, 1], [0, 1], Extrapolation.CLAMP) : 1,
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

function CardRow({
  row,
  height,
  gap,
  progress,
  heroOn,
  slide,
  isHeroCard,
  onPress,
}: {
  row: SwitcherRow;
  height: number;
  gap: number;
  progress: SharedValue<number>;
  heroOn: SharedValue<number>;
  slide: number;
  isHeroCard: boolean;
  onPress: () => void;
}) {
  const animated = useAnimatedStyle(() => {
    const moving = heroOn.value === 1 && progress.value < 0.999;
    if (isHeroCard) return { opacity: moving ? 0 : 1, transform: [{ translateY: 0 }] };
    if (!heroOn.value) return { opacity: 1, transform: [{ translateY: 0 }] };
    return {
      opacity: interpolate(progress.value, [0.15, 0.85], [0, 1], Extrapolation.CLAMP),
      transform: [{ translateY: (1 - progress.value) * slide }],
    };
  });
  return (
    <Animated.View style={[{ height, marginBottom: gap, paddingHorizontal: SIDE }, animated]}>
      {row.kind === 'placeholder' ? <PlaceholderCard /> : <SwitcherCard row={row} onPress={onPress} />}
    </Animated.View>
  );
}

function PlaceholderCard() {
  const { tokens, radii: r } = useTheme();
  return (
    <View
      style={[styles.fill, { backgroundColor: tokens.shaded, borderRadius: r.container }]}
      accessibilityLabel="Loading events"
    />
  );
}

/** A full-width cover card: the event's photo, or an accent gradient. */
function SwitcherCard({ row, onPress }: { row: SwitcherRow; onPress: () => void }) {
  const { radii: r } = useTheme();
  const event = rowEvent(row);
  if (!event || (row.kind !== 'event' && row.kind !== 'ticket')) return null;
  const meta = rowMeta(row);
  return (
    <PressableSurface
      onPress={onPress}
      rippleColor={overlayTokens.on}
      rippleAlpha={0.18}
      rippleForeground
      pressedOpacity={0.8}
      pressScale={0.98}
      style={[styles.fill, styles.card, { borderRadius: r.container }]}
      contentStyle={styles.cardContent}
      accessibilityRole="button"
      accessibilityState={{ selected: row.current }}
      accessibilityLabel={[event.name, meta, row.current ? 'Current' : null].filter(Boolean).join('. ')}
      accessibilityHint={row.kind === 'ticket' ? 'Opens your ticket' : undefined}
    >
      <CardCover event={event} />
      {row.current ? (
        <View style={styles.currentMark}>
          <Icon name="check" size={14} color={overlayTokens.ink} />
        </View>
      ) : null}
      <CardText name={event.name} meta={meta} />
    </PressableSurface>
  );
}

/** A card's fill: the cover photo when there is one, else an accent gradient. */
function CardCover({ event }: { event: Event }) {
  if (event.banner_url) return <EventCover event={event} />;
  return <AccentCover />;
}

function AccentCover() {
  const { tokens } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tokens.accent }]}>
      <View style={[StyleSheet.absoluteFill, styles.accentShade]} />
    </View>
  );
}

function CardText({ name, meta }: { name: string; meta: string }) {
  const { type } = useTheme();
  return (
    <View style={styles.cardText}>
      <Text style={[styles.cardName, styles.onCard]} numberOfLines={1} maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}>
        {name}
      </Text>
      {meta ? (
        <Text style={[type.small, styles.onCard]} numberOfLines={1} maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The morphing card: the banner at progress 0, a card at 1. The banner's
 * text fades out as the card's fades in, and so does its dark-mode blend.
 */
function Hero({
  content,
  progress,
  heroOn,
  bannerRect,
  landingCard,
  currentTop,
  scrollY,
  viewportTop,
  card,
}: {
  content: HeroContent;
  progress: SharedValue<number>;
  heroOn: SharedValue<number>;
  bannerRect: SharedValue<Rect>;
  landingCard: SharedValue<Rect | null>;
  currentTop: SharedValue<number>;
  scrollY: SharedValue<number>;
  viewportTop: number;
  card: { x: number; width: number; height: number };
}) {
  const box = useAnimatedStyle(() => {
    const p = progress.value;
    const from = bannerRect.value;
    const to = landingCard.value ?? {
      x: card.x,
      y: viewportTop + currentTop.value - scrollY.value,
      width: card.width,
      height: card.height,
    };
    return {
      opacity: heroOn.value === 1 && p < 0.999 ? 1 : 0,
      left: from.x + (to.x - from.x) * p,
      top: from.y + (to.y - from.y) * p,
      width: from.width + (to.width - from.width) * p,
      height: from.height + (to.height - from.height) * p,
      borderRadius: radii.container * p,
    };
  });
  const bannerLayer = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
  }));
  const cardLayer = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 1], [0, 1], Extrapolation.CLAMP),
  }));
  const { event } = content;
  return (
    <Animated.View pointerEvents="none" style={[styles.hero, box]} importantForAccessibility="no-hide-descendants">
      <EventCover event={event} />
      {event.banner_url ? null : (
        <Animated.View style={[StyleSheet.absoluteFill, cardLayer]}>
          <AccentCover />
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, bannerLayer]}>
        {content.blendInto ? <BannerBlend into={content.blendInto} /> : null}
        <View style={styles.heroBannerText}>
          <BannerText
            name={event.name}
            eyebrow={content.eyebrow}
            eyebrowIcon={content.eyebrowIcon}
            meta={content.bannerMeta}
            chevron
          />
        </View>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.cardContent, cardLayer]}>
        <CardText name={event.name} meta={content.cardMeta} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingLeft: SIDE + 4, paddingRight: 8 },
  title: { flex: 1 },
  search: { height: SEARCH_BAR, paddingHorizontal: SIDE, justifyContent: 'center' },
  header: { paddingHorizontal: SIDE + 4, justifyContent: 'flex-end', paddingBottom: 8 },
  card: { overflow: 'hidden' },
  cardContent: { justifyContent: 'flex-end' },
  cardText: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 12,
    gap: 2,
    backgroundImage: linearGradient(easedFade(overlayTokens.ink, { from: 0, to: 0.55, start: 0, end: 100, unit: '%' })),
  },
  cardName: { ...typography.h3 },
  onCard: { color: overlayTokens.on },
  currentMark: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    backgroundColor: overlayTokens.on,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentShade: {
    backgroundImage: linearGradient(easedFade(overlayTokens.ink, { from: 0, to: 0.45, start: 0, end: 100, unit: '%' })),
  },
  hero: { position: 'absolute', overflow: 'hidden' },
  heroBannerText: { position: 'absolute', left: 16, right: 16, bottom: 16 },
});
