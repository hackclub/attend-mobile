import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, Text, View, useWindowDimensions, type ListRenderItemInfo } from 'react-native';
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
import { GestureDetector, useCompetingGestures, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';
import { BannerBlend, BannerChevron, BannerFace } from './EventBanner';
import { Button, EmptyState, ErrorView, Icon, PressableSurface, TextField } from './ui';
import { CHROME_MAX_FONT_SCALE } from './ui/fontScale';
import { useApp } from '../context/AppContext';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useSwitcherEvents } from '../hooks/useSwitcherEvents';
import { eventHomeState, passHomeState } from '../navigation/routes';
import {
  SWITCHER_CLOSE_TIMING,
  SWITCHER_FLICK_VELOCITY,
  SWITCHER_OPEN_THRESHOLD,
  SWITCHER_PULL_DISTANCE,
  SWITCHER_SPRING,
  bannerKey,
  closeSwitcherOverlay,
  rubberBand,
  switcherOverlay,
  switcherOverpull,
  switcherProgress,
  switcherStretch,
  type Rect,
  type SwitcherBanner,
} from '../navigation/switcherOverlay';
import { bannerHeight, eventBannerText } from '../services/eventBanner';
import { eventRoleLabel } from '../services/eventRoles';
import { SWITCHER_SEARCH_THRESHOLD, filterSwitcherEvents, switcherEventCount } from '../services/eventSwitcher';
import { haptics } from '../services/haptics';
import {
  SWITCHER_CARD_INSET,
  cardHeightOf,
  centreTargetTop,
  centredPaddingTop,
  contentHeight,
  currentRowIndex,
  initialScrollOffset,
  rowHeight,
  rowOffsets,
  switcherCardScale,
  switcherMetrics,
  switcherRows,
  type SwitcherMetrics,
  type SwitcherRow,
} from '../services/switcherLayout';
import { overlayTokens, radii, useTheme, withAlpha } from '../theme';
import type { Event } from '../types';

const HEADER_BAR = 56;
const SEARCH_BAR = 64;
const SIDE = SWITCHER_CARD_INSET;
/** How far the other cards travel in as it opens. */
const CARD_SLIDE = 56;
/** How long a switch waits for the new screen's banner before just fading. */
const LANDING_WAIT_MS = 1500;
/** How long it waits for the picked event's photo before growing anyway. */
const PHOTO_WAIT_MS = 300;
const FADE_MS = 220;
/** A pull on the list this far (before resistance) closes the overlay. */
const LIST_CLOSE_DISTANCE = 110;
/** How much a full stretch fades the overlay, as a hint it's closing. */
const STRETCH_FADE = 0.35;
/** Greys out an ended event's card. */
const PAST_TINT = withAlpha(overlayTokens.ink, 0.45);
const PAST_FILTER = [{ grayscale: 1 }];

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

/** A card's event and what its banner would say. */
function rowFace(row: SwitcherRow): { event: Event; text: ReturnType<typeof eventBannerText> } | null {
  if (row.kind === 'event') return { event: row.event, text: eventBannerText(row.event, eventRoleLabel(row.event.role)) };
  if (row.kind === 'ticket') return { event: row.ticket.event, text: eventBannerText(row.ticket.event, 'Attendee') };
  return null;
}

/**
 * The morphing card: a banner, laid out where it is on screen but cropped
 * from the top to the card's shape (the crop shows the real banner under
 * it), so a uniform scale takes it exactly onto the card.
 */
interface HeroState {
  event: Event;
  eyebrow?: string | null;
  eyebrowIcon?: SwitcherBanner['eyebrowIcon'];
  meta?: string | null;
  topInset: number;
  blendInto?: string;
  accessory?: React.ReactNode;
  /** The banner's full height, and how much of its top is cropped. */
  faceHeight: number;
  crop: number;
  /** Laid out here: the banner's rect, less the crop. */
  box: Rect;
  /**
   * Its height (unscaled) once it's the card: the box's for a full card; an
   * ended event's shorter card is reached by animating the height.
   */
  endHeight: number;
  /** Turning into an ended event's (grey) card. */
  grey: boolean;
}

function heroFor(banner: SwitcherBanner, rect: Rect, cardHeight: number, cardWidth: number, grey: boolean): HeroState {
  const scale = cardWidth / rect.width;
  // The status bar space above the photo, which cards leave out.
  const crop = Math.min(banner.topInset, rect.height);
  return {
    event: banner.event,
    eyebrow: banner.eyebrow,
    eyebrowIcon: banner.eyebrowIcon,
    meta: banner.meta,
    topInset: banner.topInset,
    blendInto: banner.blendInto,
    accessory: banner.accessory,
    faceHeight: rect.height,
    crop,
    box: { x: rect.x, y: rect.y + crop, width: rect.width, height: rect.height - crop },
    endHeight: cardHeight / scale,
    grey,
  };
}

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
  const stretch = switcherStretch;
  const overpull = switcherOverpull;

  // Layout, all in fixed heights (services/switcherLayout). A card is the
  // banner scaled to the card's width, its status bar space cropped off.
  const cardScale = switcherCardScale(width);
  const cardWidth = width - SIDE * 2;
  const face = { width, height: bannerHeight(width, source.topInset), scale: cardScale, topInset: source.topInset };
  const searchable = switcherEventCount(allGroups) > SWITCHER_SEARCH_THRESHOLD;
  const headerHeight = insets.top + HEADER_BAR;
  const viewportTop = headerHeight + (searchable ? SEARCH_BAR : 0);
  const viewportHeight = height - viewportTop;

  const [query, setQuery] = useState('');
  const searching = searchable && query.trim().length > 0;
  const groups = useMemo(
    () => (searchable ? filterSwitcherEvents(allGroups, query) : allGroups),
    [allGroups, query, searchable]
  );
  const rows = useMemo(() => switcherRows(groups, current, { loading: isLoading }), [current, groups, isLoading]);
  // A short list sits in the middle of the screen.
  const metrics: SwitcherMetrics = useMemo(() => {
    const base = switcherMetrics(width, insets.bottom);
    return { ...base, paddingTop: centredPaddingTop(rows, base, viewportHeight) };
  }, [insets.bottom, rows, viewportHeight, width]);
  const offsets = useMemo(() => rowOffsets(rows, metrics), [rows, metrics]);
  const content = contentHeight(rows, metrics);
  const currentIndex = currentRowIndex(rows);
  const currentRow = currentIndex >= 0 ? rows[currentIndex] : null;

  // Opens scrolled so the current card is in the middle of the screen, as
  // near as the list can scroll, so the banner travels down into it.
  const [initialOffset] = useState(() =>
    currentIndex < 0
      ? 0
      : initialScrollOffset({
          cardTop: offsets[currentIndex],
          targetTop: centreTargetTop(viewportHeight, cardHeightOf(rows[currentIndex], metrics)),
          contentHeight: content,
          viewportHeight,
        })
  );

  const scrollY = useSharedValue(initialOffset);
  // The current card's top in the list, or -1 when it isn't listed (still
  // loading, filtered out by a search).
  const currentTop = useSharedValue(currentIndex >= 0 ? offsets[currentIndex] : -1);
  useEffect(() => {
    currentTop.set(currentIndex >= 0 ? offsets[currentIndex] : -1);
  }, [currentIndex, currentTop, offsets]);

  // The morphing card: the banner at `bannerRect` (progress 0), scaled into
  // a card (1): the current one's live place in the list, or `landingCard`.
  const heroOn = useSharedValue(reduceMotion || currentIndex < 0 ? 0 : 1);
  // Hidden until its photo is drawn: until then the real banner under it
  // shows, rather than the fill behind a photo still decoding.
  const heroReady = useSharedValue(0);
  const [hero, setHero] = useState<HeroState>(() =>
    heroFor(
      source,
      sourceRect,
      currentRow ? cardHeightOf(currentRow, metrics) : metrics.cardHeight,
      cardWidth,
      !!currentRow && (currentRow.kind === 'event' || currentRow.kind === 'ticket') && currentRow.past
    )
  );
  const bannerRect = useSharedValue<Rect>(hero.box);
  const landingCard = useSharedValue<Rect | null>(null);
  const heroReadyWaiter = useRef<(() => void) | null>(null);
  const onHeroReady = useCallback(() => {
    heroReady.set(1);
    heroReadyWaiter.current?.();
    heroReadyWaiter.current = null;
  }, [heroReady]);
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

  const currentCardHeight = currentRow ? cardHeightOf(currentRow, metrics) : metrics.cardHeight;
  const isCurrentOnScreen = useCallback(() => {
    const rowTop = currentTop.get();
    if (rowTop < 0) return false;
    const top = viewportTop + rowTop - scrollY.get() + stretch.get() + overpull.get();
    return top + currentCardHeight > viewportTop && top < height;
  }, [currentCardHeight, currentTop, height, overpull, scrollY, stretch, viewportTop]);

  /** Back into the banner, or a fade when the current card is off-screen. */
  const close = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    const morph = !reduceMotion && isCurrentOnScreen();
    heroOn.set(morph ? 1 : 0);
    stretch.set(withTiming(0, SWITCHER_CLOSE_TIMING));
    overpull.set(withTiming(0, SWITCHER_CLOSE_TIMING));
    progress.set(
      withTiming(0, morph ? SWITCHER_CLOSE_TIMING : { duration: FADE_MS }, (finished) => {
        if (finished) scheduleOnRN(closeSwitcherOverlay);
      })
    );
  }, [heroOn, isCurrentOnScreen, overpull, progress, reduceMotion, stretch]);

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
      const pickedHeight = cardHeightOf(row, metrics);
      const cardRect: Rect = {
        x: SIDE,
        y: viewportTop + offsets[index] - scrollY.get() + stretch.get() + overpull.get(),
        width: cardWidth,
        height: pickedHeight,
      };
      setPickedKey(row.key);
      // Fully covered while the screens change under it.
      progress.set(1);
      stretch.set(0);
      overpull.set(0);

      if (row.kind === 'event') source.switchTo(eventHomeState(), () => void selectEvent(row.event));
      else source.switchTo(passHomeState(row.ticket));
      // The new screen sets the banner's status bar as it focuses; it's
      // still under the overlay.
      requestAnimationFrame(() => setStatusBarStyle(barStyle));

      const key = row.kind === 'event' ? bannerKey.event(row.event) : bannerKey.ticket(row.ticket);
      const target = await switcherOverlay.waitForBanner(key, LANDING_WAIT_MS);
      const targetRect = target && !reduceMotion ? await target.measure() : null;
      const finish = (finished?: boolean) => {
        'worklet';
        if (finished) scheduleOnRN(closeSwitcherOverlay);
      };
      if (!target || !targetRect) {
        heroOn.set(0);
        progress.set(withTiming(0, { duration: FADE_MS }, finish));
        return;
      }
      const next = heroFor(target, targetRect, pickedHeight, cardWidth, row.past);
      // The new face mounts hidden; it grows once its photo is drawn.
      heroReady.set(0);
      const ready = new Promise<void>((resolve) => {
        heroReadyWaiter.current = resolve;
        setTimeout(resolve, PHOTO_WAIT_MS);
      });
      setHero(next);
      bannerRect.set(next.box);
      landingCard.set(cardRect);
      heroOn.set(1);
      await ready;
      requestAnimationFrame(() => progress.set(withTiming(0, SWITCHER_CLOSE_TIMING, finish)));
    },
    [
      bannerRect, barStyle, cardWidth, close, heroOn, heroReady, landingCard, metrics, offsets, progress,
      overpull, reduceMotion, scrollY, selectEvent, source, stretch, viewportTop,
    ]
  );

  // Pulling the header up closes it, following the finger.
  const headerActive = useSharedValue(false);
  const headerVelocity = useSharedValue(0);
  const pullUp = usePanGesture({
    activeOffsetY: -6,
    failOffsetY: 6,
    onActivate: () => {
      'worklet';
      headerActive.value = true;
      const rowTop = currentTop.value;
      if (rowTop < 0 || reduceMotion) {
        heroOn.value = 0;
        return;
      }
      const top = viewportTop + rowTop - scrollY.value;
      heroOn.value = top + currentCardHeight > viewportTop && top < height ? 1 : 0;
    },
    onUpdate: (e) => {
      'worklet';
      headerVelocity.value = e.velocityY;
      progress.value = Math.min(1, Math.max(0, 1 + e.translationY / SWITCHER_PULL_DISTANCE));
    },
    onFinalize: (e) => {
      'worklet';
      if (!headerActive.value) return;
      headerActive.value = false;
      const closing =
        !e.canceled &&
        (progress.value < 1 - SWITCHER_OPEN_THRESHOLD || headerVelocity.value < -SWITCHER_FLICK_VELOCITY);
      if (closing) {
        progress.value = withTiming(0, SWITCHER_CLOSE_TIMING, (finished) => {
          if (finished) scheduleOnRN(closeSwitcherOverlay);
        });
      } else {
        progress.value = withSpring(1, SWITCHER_SPRING);
      }
    },
  });

  // Pulling the list down from its top, or up from its end, stretches it
  // after the finger, the overlay starting to fade; letting go far enough
  // closes it back into the banner, as × does. Anywhere else it scrolls.
  const maxScroll = Math.max(0, content - viewportHeight);
  const atTop = useSharedValue(initialOffset <= 0.5);
  const atEnd = useSharedValue(initialOffset >= maxScroll - 0.5);
  const listActive = useSharedValue(false);
  const listVelocity = useSharedValue(0);
  const listRelease = (canceled: boolean) => {
    'worklet';
    if (!listActive.value) return;
    listActive.value = false;
    const pulled = Math.abs(stretch.value);
    const flicked = Math.abs(listVelocity.value) > SWITCHER_FLICK_VELOCITY;
    if (!canceled && (pulled > rubberBand(LIST_CLOSE_DISTANCE) || flicked)) {
      scheduleOnRN(close);
    } else {
      stretch.value = withSpring(0, SWITCHER_SPRING);
    }
  };
  const pullDown = usePanGesture({
    enabled: atTop,
    activeOffsetY: 10,
    failOffsetY: -10,
    failOffsetX: [-24, 24],
    onActivate: () => {
      'worklet';
      listActive.value = true;
    },
    onUpdate: (e) => {
      'worklet';
      listVelocity.value = e.velocityY;
      stretch.value = rubberBand(e.translationY);
    },
    onFinalize: (e) => {
      'worklet';
      listRelease(e.canceled);
    },
  });
  const pullUpList = usePanGesture({
    enabled: atEnd,
    activeOffsetY: -10,
    failOffsetY: 10,
    failOffsetX: [-24, 24],
    onActivate: () => {
      'worklet';
      listActive.value = true;
    },
    onUpdate: (e) => {
      'worklet';
      listVelocity.value = e.velocityY;
      stretch.value = -rubberBand(-e.translationY);
    },
    onFinalize: (e) => {
      'worklet';
      listRelease(e.canceled);
    },
  });
  const listPull = useCompetingGestures(pullDown, pullUpList);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    atTop.value = e.contentOffset.y <= 0.5;
    atEnd.value = e.contentOffset.y + e.layoutMeasurement.height >= e.contentSize.height - 0.5;
  });

  const listRef = useRef<Animated.FlatList<SwitcherRow>>(null);
  const scrolledInitially = useRef(false);

  // A stretch fades the overlay a little, as a hint that letting go closes it.
  const stretchFade = () => {
    'worklet';
    return 1 - STRETCH_FADE * Math.min(1, Math.abs(stretch.value) / rubberBand(LIST_CLOSE_DISTANCE * 2));
  };
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6], [0, 1], Extrapolation.CLAMP) * stretchFade(),
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.3, 1], [0, 1], Extrapolation.CLAMP) * stretchFade(),
  }));
  // With the hero off (reduced motion, a fade) the list fades as a whole.
  const listStyle = useAnimatedStyle(() => ({
    opacity: heroOn.value ? 1 : interpolate(progress.value, [0, 0.8], [0, 1], Extrapolation.CLAMP),
    // A pull past fully open moves it too, without the fade.
    transform: [{ translateY: stretch.value + overpull.value }],
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
    const slide = currentIndex < 0 ? 1 : index < currentIndex ? -1 : 1;
    return (
      <CardRow
        row={item}
        cardHeight={cardHeightOf(item, metrics)}
        gap={metrics.cardGap}
        face={face}
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
    searching && switcherEventCount(groups) === 0 ? <EmptyState title={`No events match “${query.trim()}”`} /> : undefined
  ) : isLoading ? undefined : loadFailed ? (
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

      <GestureDetector gesture={listPull}>
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
            // The list's own stretch would fight this one.
            overScrollMode="never"
            bounces={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListFooterComponent={footer}
            initialNumToRender={8}
            windowSize={7}
          />
        </Animated.View>
      </GestureDetector>

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
        hero={hero}
        onReady={onHeroReady}
        ready={heroReady}
        stretch={stretch}
        overpull={overpull}
        progress={progress}
        heroOn={heroOn}
        bannerRect={bannerRect}
        landingCard={landingCard}
        currentTop={currentTop}
        scrollY={scrollY}
        viewportTop={viewportTop}
        card={{ x: SIDE, width: cardWidth, height: currentCardHeight }}
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

interface FaceSize {
  /** The banner's full size, which a card scales down by `scale`. */
  width: number;
  height: number;
  topInset: number;
  scale: number;
}

function CardRow({
  row,
  cardHeight,
  gap,
  face,
  progress,
  heroOn,
  slide,
  isHeroCard,
  onPress,
}: {
  row: SwitcherRow;
  cardHeight: number;
  gap: number;
  face: FaceSize;
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
    <Animated.View style={[{ height: cardHeight, marginBottom: gap, paddingHorizontal: SIDE }, animated]}>
      {row.kind === 'placeholder' ? (
        <PlaceholderCard />
      ) : (
        <SwitcherCard row={row} face={face} cardHeight={cardHeight} onPress={onPress} />
      )}
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

/**
 * A card: the event's banner scaled down to the card's width, showing its
 * bottom (the photo and text); an ended event's is shorter and greyed out.
 */
function SwitcherCard({
  row,
  face,
  cardHeight,
  onPress,
}: {
  row: SwitcherRow;
  face: FaceSize;
  cardHeight: number;
  onPress: () => void;
}) {
  const { radii: r } = useTheme();
  const content = rowFace(row);
  if (!content || (row.kind !== 'event' && row.kind !== 'ticket')) return null;
  const { event, text } = content;
  return (
    <PressableSurface
      onPress={onPress}
      rippleColor={overlayTokens.on}
      rippleAlpha={0.18}
      rippleForeground
      pressedOpacity={0.8}
      pressScale={0.98}
      style={[styles.fill, styles.card, { borderRadius: r.container }]}
      contentStyle={styles.fill}
      accessibilityRole="button"
      accessibilityState={{ selected: row.current }}
      accessibilityLabel={[event.name, text.eyebrow, text.meta, row.current ? 'Current' : null].filter(Boolean).join('. ')}
      accessibilityHint={row.kind === 'ticket' ? 'Opens your ticket' : undefined}
    >
      <View
        pointerEvents="none"
        style={[
          styles.face,
          {
            top: cardHeight - face.height * face.scale,
            width: face.width,
            height: face.height,
            transform: [{ scale: face.scale }],
          },
          row.past ? { filter: PAST_FILTER } : null,
        ]}
        importantForAccessibility="no-hide-descendants"
      >
        <BannerFace
          event={event}
          height={face.height}
          topInset={face.topInset}
          eyebrow={text.eyebrow}
          eyebrowIcon={text.eyebrowIcon}
          meta={text.meta}
          transition={0}
        />
      </View>
      {row.past ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pastTint]} /> : null}
      {row.current ? (
        <View pointerEvents="none" style={styles.currentMark}>
          <Icon name="check" size={14} color={overlayTokens.ink} />
        </View>
      ) : null}
    </PressableSurface>
  );
}

/**
 * The morphing card: the banner itself at progress 0, scaled and moved into
 * a card at 1, its corners rounding and its dark-mode fade, chevron and
 * avatar fading out on the way. Only its transform and opacity animate, so
 * its photo keeps the same crop throughout.
 */
function Hero({
  hero,
  onReady,
  ready,
  stretch,
  overpull,
  progress,
  heroOn,
  bannerRect,
  landingCard,
  currentTop,
  scrollY,
  viewportTop,
  card,
}: {
  hero: HeroState;
  onReady: () => void;
  ready: SharedValue<number>;
  stretch: SharedValue<number>;
  overpull: SharedValue<number>;
  progress: SharedValue<number>;
  heroOn: SharedValue<number>;
  bannerRect: SharedValue<Rect>;
  landingCard: SharedValue<Rect | null>;
  currentTop: SharedValue<number>;
  scrollY: SharedValue<number>;
  viewportTop: number;
  card: { x: number; width: number; height: number };
}) {
  const endHeight = hero.endHeight;
  const box = useAnimatedStyle(() => {
    const p = progress.value;
    const from = bannerRect.value;
    const to = landingCard.value ?? {
      x: card.x,
      y: viewportTop + currentTop.value - scrollY.value + stretch.value + overpull.value,
      width: card.width,
      height: card.height,
    };
    const scale = 1 + (to.width / from.width - 1) * p;
    const shape = {
      opacity: heroOn.value === 1 && ready.value === 1 && p < 0.999 ? 1 : 0,
      // Corners as the card's once scaled.
      borderRadius: (radii.container * p) / scale,
      transform: [{ translateX: (to.x - from.x) * p }, { translateY: (to.y - from.y) * p }, { scale }],
    };
    // An ended event's card is shorter: the height animates to it, the
    // bottom (its text) staying put.
    return Math.abs(endHeight - from.height) < 0.5 ? shape : { ...shape, height: from.height + (endHeight - from.height) * p };
  });
  const faceShift = useAnimatedStyle(() => {
    const h = bannerRect.value.height;
    return { transform: [{ translateY: (h - endHeight) * progress.value * -1 }] };
  });
  const fadeOut = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
  }));
  const greyIn = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.hero, { left: hero.box.x, top: hero.box.y, width: hero.box.width, height: hero.box.height }, box]}
      importantForAccessibility="no-hide-descendants"
    >
      {/* The whole banner, its cropped top above the box. Keyed by event so
          a switch mounts a fresh photo, which reports when it's drawn. */}
      <Animated.View style={[styles.heroFace, { top: -hero.crop, height: hero.faceHeight }, faceShift]}>
        <BannerFace
          key={hero.event.id}
          event={hero.event}
          height={hero.faceHeight}
          topInset={hero.topInset}
          eyebrow={hero.eyebrow}
          eyebrowIcon={hero.eyebrowIcon}
          meta={hero.meta}
          chevron={<BannerChevron style={fadeOut} />}
          transition={0}
          onReady={onReady}
        >
          {hero.blendInto ? (
            <Animated.View style={[StyleSheet.absoluteFill, fadeOut]}>
              <BannerBlend into={hero.blendInto} />
            </Animated.View>
          ) : null}
        </BannerFace>
      </Animated.View>
      {hero.grey ? <Animated.View style={[StyleSheet.absoluteFill, styles.pastTint, greyIn]} /> : null}
      {hero.accessory ? (
        <Animated.View style={[styles.accessory, { top: hero.topInset + 8 - hero.crop }, fadeOut]}>
          {hero.accessory}
        </Animated.View>
      ) : null}
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
  // The banner at full size, scaled from its top-left corner into the card.
  face: { position: 'absolute', left: 0, transformOrigin: 'top left' },
  pastTint: { backgroundColor: PAST_TINT },
  currentMark: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    backgroundColor: overlayTokens.on,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { position: 'absolute', overflow: 'hidden', transformOrigin: 'top left' },
  heroFace: { position: 'absolute', left: 0, right: 0 },
  accessory: { position: 'absolute', right: 16 },
});
