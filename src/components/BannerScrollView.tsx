import React, { useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GestureDetector } from 'react-native-gesture-handler';
import { EventBanner, useSwitcherPull } from './EventBanner';
import { bannerHeight } from '../services/eventBanner';

type EventBannerProps = Omit<ComponentProps<typeof EventBanner>, 'pull' | 'style'>;

/**
 * A page that opens with the event banner. The banner sits over the page,
 * moved with its scroll on the UI thread, rather than inside it: touches that
 * start on the banner never reach the page's scroll view or pull-to-refresh,
 * so pulling the banner down always opens the event switcher, at any speed,
 * and its drag scrolls the page itself (see useSwitcherPull). Pull-to-refresh
 * works from the content below.
 */
export function BannerScrollView({
  banner,
  refreshControl,
  onScrollY,
  pullAnywhere = false,
  contentContainerStyle,
  children,
}: {
  banner: EventBannerProps;
  /**
   * Pulling down anywhere on the page, while it's at its top, opens the
   * event switcher too. Not with a refreshControl, which wants that pull.
   */
  pullAnywhere?: boolean;
  /** Its spinner shows below the banner (see `bannerOffset`). */
  refreshControl?: ReactElement<{ progressViewOffset?: number }>;
  /** The scroll offset as it changes, e.g. for the status bar. */
  onScrollY?: (y: number) => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const maxScroll = useSharedValue(0);
  const fling = useSharedValue(0);
  const atTop = useSharedValue(true);
  const [height, setHeight] = useState(() => bannerHeight(width, banner.topInset ?? 0));

  const pull = useSwitcherPull(banner.switcher, { scrollRef, scrollY, maxScroll, fling, atTop });

  // A fling from the banner moves the page while it decays.
  useAnimatedReaction(
    () => fling.value,
    (y, was) => {
      if (was === null || y === was) return;
      scrollTo(scrollRef, 0, y, false);
    }
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      atTop.value = e.contentOffset.y <= 0.5;
      maxScroll.value = e.contentSize.height - e.layoutMeasurement.height;
      if (onScrollY) scheduleOnRN(onScrollY, e.contentOffset.y);
    },
    // The page's own drag stops a fling from the banner.
    onBeginDrag: () => {
      cancelAnimation(fling);
    },
  });

  const bannerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -scrollY.value }] }));

  return (
    <View style={styles.fill}>
      <MaybePull gesture={pullAnywhere ? pull.pageGesture : null}>
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={contentContainerStyle}
          refreshControl={
            refreshControl
              ? React.cloneElement(refreshControl, { progressViewOffset: height })
              : undefined
          }
        >
          {/* The banner's place in the page. */}
          <View style={{ height }} />
          {children}
        </Animated.ScrollView>
      </MaybePull>
      <Animated.View
        style={[styles.banner, bannerStyle]}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      >
        <EventBanner {...banner} pull={pull} />
      </Animated.View>
    </View>
  );
}

/** The page in the pull's detector, when there's one. */
function MaybePull({
  gesture,
  children,
}: {
  gesture: ReturnType<typeof useSwitcherPull>['pageGesture'] | null;
  children: ReactElement;
}) {
  if (!gesture) return children;
  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.fill} collapsable={false}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  banner: { position: 'absolute', top: 0, left: 0, right: 0 },
});
