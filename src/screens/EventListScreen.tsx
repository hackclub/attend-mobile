import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTabBarInset, useTopTabBarInset } from '../hooks/useTabBarInset';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { SplitView } from '../components/SplitView';
import { api } from '../services/api';
import { syncService } from '../services/sync';
import { EventPass, PASS_HEIGHT, PASS_STRIP } from '../components/EventPass';
import { VersionFooter } from '../components/VersionFooter';
import { ScreenHeader, SearchField, useUiStyles } from '../components/ui';
import { CONTENT_MAX_WIDTH, EventHome, HOME_TOP_BAR } from './EventHome';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { Event, MainTabParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<MainTabParamList, 'Events'>;
type ViewHandle = React.ComponentRef<typeof View>;

type Mode = 'picker' | 'home';

// A pass moving between its slot in the stack and the top of the event home,
// as in Wallet: the pass itself travels, the passes below it drop off the
// bottom of the screen, and everything above it fades.
interface Transition {
  eventId: string;
  index: number;
  // How far the pass travels from its slot to the event home.
  rise: number;
  // How far each pass below it drops to clear the screen, by event id.
  drops: Record<string, number>;
}

const SPRING = { damping: 26, stiffness: 240, mass: 1, useNativeDriver: true } as const;
// Breathing room kept around a slot brought into view before a pass returns.
const SLOT_MARGIN = 12;

// An event is considered finished once its end date has passed (matches the
// backend's Event#completed? which compares ends_at.to_date < Date.current).
function isFinished(event: Event): boolean {
  if (!event.ends_at) return false;
  const ends = new Date(event.ends_at);
  if (isNaN(ends.getTime())) return false;
  const today = new Date();
  const endDay = new Date(ends.getFullYear(), ends.getMonth(), ends.getDate());
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return endDay < startOfToday;
}

function measureY(view: ViewHandle | null): Promise<number | null> {
  return new Promise((resolve) => {
    if (!view) {
      resolve(null);
      return;
    }
    view.measureInWindow((_x, y) => resolve(y));
  });
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * The Events tab. Events sit in a stack of passes, like Apple Wallet; tapping
 * one lifts it to the top and opens that event's homepage, and tapping the
 * pass there drops it back into its slot. With an event already selected the
 * tab opens straight onto its homepage.
 */
export function EventListScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ui = useUiStyles();
  const insets = useSafeAreaInsets();
  // Content starts below the status bar, and below the tab bar where an iPad
  // floats it along the top.
  const topInset = insets.top + useTopTabBarInset();
  const tabBarInset = useTabBarInset();
  // Wide enough for two panes: the stack as a sidebar, the event home beside it.
  const { useSplitView: isSplit } = useResponsiveLayout();
  const navigation = useNavigation<NavigationProp>();
  const { state, selectEvent, setEvents: setContextEvents, logout } = useApp();

  const [events, setEvents] = useState<Event[]>(state.events);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<Mode>(state.currentEvent ? 'home' : 'picker');
  const [transition, setTransition] = useState<Transition | null>(null);

  // 0 with the stack showing, 1 with the event home showing.
  const [progress] = useState(() => new Animated.Value(state.currentEvent ? 1 : 0));
  const rootRef = useRef<ViewHandle>(null);
  const homePassRef = useRef<ViewHandle>(null);
  const pickerScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  // Where each slot sits in the stack, and the stack in the scroll content —
  // layout positions, so they hold while passes are mid-flight.
  const slotOffsets = useRef(new Map<string, number>());
  const stackOffset = useRef(0);
  const pickerScroll = useRef({ y: 0, viewport: 0, content: 0 });
  // Until the user opens or closes a pass, follow the selected event: a
  // session restored with an event already chosen lands on its homepage.
  const hasNavigated = useRef(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      reduceMotion.current = enabled;
    }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reduceMotion.current = enabled;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!state.currentEvent && mode === 'home' && !transition) {
      setMode('picker');
      progress.setValue(0);
    } else if (state.currentEvent && mode === 'picker' && !transition && !hasNavigated.current) {
      setMode('home');
      progress.setValue(1);
    }
  }, [state.currentEvent, mode, transition, progress]);

  const loadEvents = useCallback(async () => {
    const cacheGeneration = syncService.getCacheGeneration();
    try {
      const cached = await syncService.getCachedEvents();
      if (cached.length > 0) {
        setEvents(cached);
      }

      const fresh = await api.getEvents();
      setEvents(fresh);
      // Share them with the app state too: each event carries the caller's role
      // on it, which decides what the other tabs offer for the selected event.
      setContextEvents(fresh);
      await syncService.cacheEvents(fresh, cacheGeneration);
    } catch {
      const cached = await syncService.getCachedEvents();
      if (cached.length > 0) {
        setEvents(cached);
      }
    } finally {
      setIsLoading(false);
    }
  }, [setContextEvents]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadEvents();
    setIsRefreshing(false);
  }, [loadEvents]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const matchesSearch = (event: Event) => {
    if (!trimmedQuery) return true;
    const haystack = [event.name, event.location_city, event.slug]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return trimmedQuery.split(/\s+/).every((term) => haystack.includes(term));
  };

  const visibleEvents = events.filter((event) => !isFinished(event) && matchesSearch(event));

  // A slot's top edge in the scroll content, or null before it has laid out.
  const slotContentY = (eventId: string): number | null => {
    const offset = slotOffsets.current.get(eventId);
    return offset === undefined ? null : stackOffset.current + offset;
  };

  // Everything the passes need to move between `slotScreenY` (the chosen
  // pass's slot, on screen) and `homeY` (where the event home shows it).
  const planTransition = (index: number, slotScreenY: number, homeY: number): Transition => {
    const event = visibleEvents[index];
    const scrollY = pickerScroll.current.y;
    const viewport = pickerScroll.current.viewport;
    const drops: Record<string, number> = {};
    visibleEvents.slice(index + 1).forEach((below, offset) => {
      const y = slotContentY(below.id);
      const screenY = y === null ? viewport : y - scrollY;
      // Land just past the bottom edge, a little apart, so they leave as a pile.
      drops[below.id] = Math.max(0, viewport - screenY) + 24 + offset * 6;
    });
    return { eventId: event.id, index, rise: homeY - slotScreenY, drops };
  };

  const openEvent = (event: Event, index: number) => {
    if (transition) return;
    hasNavigated.current = true;
    void selectEvent(event);

    const contentY = slotContentY(event.id);
    if (reduceMotion.current || contentY === null) {
      setMode('home');
      progress.setValue(1);
      return;
    }

    setTransition(planTransition(index, contentY - pickerScroll.current.y, topInset + HOME_TOP_BAR));
    setMode('home');
    Animated.spring(progress, { toValue: 1, ...SPRING }).start(() => setTransition(null));
  };

  // Beside the event home in a split view, a pass just switches which event
  // the home shows. Left in 'home' mode so a scene that narrows back to one
  // pane lands on that event, not the stack.
  const choosePass = (event: Event) => {
    hasNavigated.current = true;
    void selectEvent(event);
    setMode('home');
    progress.setValue(1);
  };

  const showAllEvents = async () => {
    if (transition || !state.currentEvent) return;
    hasNavigated.current = true;
    const eventId = state.currentEvent.id;
    const index = visibleEvents.findIndex((event) => event.id === eventId);
    let contentY = index === -1 ? null : slotContentY(eventId);

    if (reduceMotion.current || contentY === null) {
      setMode('picker');
      progress.setValue(0);
      return;
    }

    // The stack is hidden while the home shows, so if the slot has scrolled
    // out of view it can be brought back without anyone seeing it jump.
    const { y: scrollY, viewport, content } = pickerScroll.current;
    const visibleHeight = index === visibleEvents.length - 1 ? PASS_HEIGHT : PASS_STRIP;
    const top = scrollY + topInset + SLOT_MARGIN;
    const bottom = scrollY + viewport - tabBarInset - SLOT_MARGIN;
    let target = scrollY;
    if (contentY < top) target = contentY - topInset - SLOT_MARGIN;
    else if (contentY + visibleHeight > bottom) {
      target = contentY + visibleHeight - viewport + tabBarInset + SLOT_MARGIN;
    }
    target = Math.min(Math.max(0, content - viewport), Math.max(0, target));
    if (target !== scrollY) {
      pickerScrollRef.current?.scrollTo({ y: target, animated: false });
      pickerScroll.current.y = target;
      await nextFrame();
    }
    contentY = slotContentY(eventId) ?? contentY;

    const [rootY, homeY] = await Promise.all([
      measureY(rootRef.current),
      measureY(homePassRef.current),
    ]);
    if (rootY === null || homeY === null) {
      setMode('picker');
      progress.setValue(0);
      return;
    }

    setTransition(planTransition(index, contentY - target, homeY - rootY));
    Animated.spring(progress, { toValue: 0, ...SPRING }).start(() => {
      setMode('picker');
      setTransition(null);
    });
  };

  const clamp = 'clamp' as const;
  const fadeAway = progress.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: clamp });
  const fadeIn = progress.interpolate({ inputRange: [0.3, 1], outputRange: [0, 1], extrapolate: clamp });
  // The home's content rides along beneath the travelling pass, so the page
  // reads as the pass opening up rather than a second screen fading in.
  const homeShift = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-(transition?.rise ?? 0), 0],
  });
  const showPicker = mode === 'picker' || !!transition;

  const slotMotion = (event: Event, index: number) => {
    if (!transition) return null;
    if (event.id === transition.eventId) {
      return {
        transform: [{
          translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, transition.rise] }),
        }],
      };
    }
    if (index > transition.index) {
      return {
        transform: [{
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, transition.drops[event.id] ?? 0],
            extrapolateLeft: clamp,
          }),
        }],
      };
    }
    return { opacity: fadeAway };
  };

  // In a split view the stack sits beside the event home and nothing moves
  // between them, so the stack's own fades stay at rest.
  const pickerFade = isSplit ? 1 : fadeAway;

  const stackList = (
  <ScrollView
    ref={pickerScrollRef}
    contentContainerStyle={[
      styles.pickerContent,
      { paddingTop: topInset, paddingBottom: tabBarInset + 24 },
    ]}
    keyboardDismissMode="on-drag"
    keyboardShouldPersistTaps="handled"
    scrollEventThrottle={16}
    onScroll={(e) => { pickerScroll.current.y = e.nativeEvent.contentOffset.y; }}
    onLayout={(e) => { pickerScroll.current.viewport = e.nativeEvent.layout.height; }}
    onContentSizeChange={(_, height) => { pickerScroll.current.content = height; }}
    refreshControl={
      <RefreshControl
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        tintColor={colors.text.accent}
        progressViewOffset={topInset}
      />
    }
  >
    <Animated.View collapsable={false} style={{ opacity: pickerFade }}>
      <ScreenHeader
        title="Events"
        subtitle={state.auth.user?.name || state.auth.user?.email}
        right={
          <View style={styles.headerActions}>
            {state.auth.user?.is_participant && (
              <TouchableOpacity
                onPress={() => navigation.getParent()?.navigate('ParticipantMain' as never)}
                style={ui.headerAction}
              >
                <Ionicons name="ticket-outline" size={15} color={colors.gray[700]} />
                <Text style={ui.headerActionText}>Tickets</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleLogout} style={ui.headerAction}>
              <Text style={[ui.headerActionText, ui.headerActionTextDestructive]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {state.sync.pendingScans > 0 && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncText}>
            {state.sync.pendingScans} scan{state.sync.pendingScans !== 1 ? 's' : ''} pending sync
          </Text>
        </View>
      )}

      <SearchField
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search events"
      />
    </Animated.View>

    <View
      style={styles.stack}
      onLayout={(e) => { stackOffset.current = e.nativeEvent.layout.y; }}
    >
      {visibleEvents.map((event, index) => {
        const selected = state.currentEvent?.id === event.id;
        return (
          <Animated.View
            key={event.id}
            collapsable={false}
            onLayout={(e) => { slotOffsets.current.set(event.id, e.nativeEvent.layout.y); }}
            style={[
              styles.slot,
              index > 0 && styles.slotStacked,
              { zIndex: index },
              slotMotion(event, index),
            ]}
          >
            <Pressable
              onPress={() => (isSplit ? choosePass(event) : openEvent(event, index))}
              accessibilityRole="button"
              accessibilityLabel={`${event.name}${selected ? ', selected' : ''}`}
              accessibilityHint={isSplit ? "Shows the event" : "Opens the event"}
            >
              <EventPass event={event} selected={selected} />
            </Pressable>
          </Animated.View>
        );
      })}
    </View>

    {visibleEvents.length === 0 ? (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          {isLoading
            ? 'Loading events...'
            : trimmedQuery
              ? `No events match “${searchQuery.trim()}”`
              : 'No events available'}
        </Text>
      </View>
    ) : null}

    <Animated.View collapsable={false} style={{ opacity: pickerFade }}>
      <VersionFooter />
    </Animated.View>
  </ScrollView>
  );

  if (isSplit) {
    return (
      <View style={styles.container}>
        <SplitView
          sidebarWidth={380}
          sidebar={stackList}
          detail={state.currentEvent ? (
            <EventHome
              // A fresh home per event, so switching starts it at the top.
              key={state.currentEvent.id}
              event={state.currentEvent}
              topInset={topInset}
              bottomInset={tabBarInset}
              wide
            />
          ) : null}
          placeholder={<NoEventChosen />}
        />
        <View
          pointerEvents="none"
          style={[styles.statusBarBackdrop, { height: insets.top }]}
        />
      </View>
    );
  }

  return (
    <View ref={rootRef} style={styles.container} collapsable={false}>
      <View
        // Never flattened away: if this view came and went with its opacity,
        // the scroll view inside would be rebuilt, losing its place and
        // re-arming pull-to-refresh. Same for the animated wrappers below.
        collapsable={false}
        style={[StyleSheet.absoluteFill, !showPicker && styles.hidden]}
        pointerEvents={mode === 'picker' && !transition ? 'auto' : 'none'}
        importantForAccessibility={mode === 'picker' ? 'auto' : 'no-hide-descendants'}
        accessibilityElementsHidden={mode !== 'picker'}
      >
        {stackList}
      </View>

      {mode === 'home' && state.currentEvent ? (
        <Animated.View
          collapsable={false}
          style={[StyleSheet.absoluteFill, { opacity: fadeIn, transform: [{ translateY: homeShift }] }]}
          pointerEvents={transition ? 'none' : 'auto'}
        >
          <EventHome
            ref={homePassRef}
            event={state.currentEvent}
            hidePass={!!transition}
            topInset={topInset}
            bottomInset={tabBarInset}
            onShowAllEvents={showAllEvents}
          />
        </Animated.View>
      ) : null}

      {/* Keeps the clock legible over whatever scrolls up beneath it. */}
      <View
        pointerEvents="none"
        style={[styles.statusBarBackdrop, { height: insets.top }]}
      />
    </View>
  );
}

function NoEventChosen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.placeholder}>
      <View style={styles.placeholderIcon}>
        <Ionicons name="calendar-outline" size={44} color={colors.gray[400]} />
      </View>
      <Text style={styles.placeholderTitle}>No event selected</Text>
      <Text style={styles.placeholderText}>
        Choose an event to see its check-in progress and tools.
      </Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  placeholderIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 6,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hidden: {
    opacity: 0,
  },
  pickerContent: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH + 32,
    alignSelf: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncBanner: {
    backgroundColor: colors.orange,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  syncText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  stack: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  slot: {
    height: PASS_HEIGHT,
  },
  // Each pass tucks under the next, leaving only its top strip in view.
  slotStacked: {
    marginTop: -(PASS_HEIGHT - PASS_STRIP),
  },
  statusBarBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: `${colors.background}F2`,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text.secondary,
  },
});
