import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { switcherOverlay } from '../navigation/switcherOverlay';
import { useIsUnderSheet } from '../navigation/useIsUnderSheet';
import { bannerHeight } from '../services/eventBanner';
import { statusBarStyleEntry } from '../services/statusBarStyle';
import { easedFade, linearGradient, useTheme, withAlpha } from '../theme';

export interface BannerStatusBar {
  /** The page's scroll offset: hand it to BannerScrollView's `scrollOffset`. */
  scrollOffset: SharedValue<number>;
  /** Render after the ScrollView, inside a container that fills the screen. */
  scrim: ReactNode;
}

/**
 * The status bar over a screen that opens with the event banner. The banner
 * is a dark photo or fill in both schemes, so at rest the status bar is light
 * over it. As the page scrolls the banner's lower edge up towards the status
 * bar, a page-coloured scrim fades in behind it, following the scroll on the
 * UI thread (it's there as the banner leaves, and gone as it comes back),
 * and the status bar switches to the scheme's style once the scrim is mostly
 * in. The scrim fades out across the lower part of the status bar, so
 * content scrolls away under it rather than being cut off at a hard edge.
 */
export function useBannerStatusBar(pageColor: string): BannerStatusBar {
  const { barStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollOffset = useSharedValue(0);
  const [scrolled, setScrolled] = useState(false);

  // Where the banner's bottom reaches the status bar's: the scrim is fully in
  // by then, having faded in over the FADE_RANGE before it.
  const covered = Math.max(0, bannerHeight(width, insets.top) - insets.top);
  const fadeFrom = Math.max(0, covered - FADE_RANGE);
  const amount = (y: number) => {
    'worklet';
    return interpolate(y, [fadeFrom, covered], [0, 1], Extrapolation.CLAMP);
  };
  useAnimatedReaction(
    () => amount(scrollOffset.value) > 0.5,
    (now, was) => {
      if (now !== was) scheduleOnRN(setScrolled, now);
    },
    [fadeFrom, covered]
  );

  // While the event switcher is up (a switch landing here, under it) it sets
  // the status bar itself; this screen's style applies again once it closes.
  const overlayOpen = useSyncExternalStore(
    switcherOverlay.subscribe,
    () => switcherOverlay.get().open,
    () => false
  );
  const isFocused = useIsFocused();
  // A drawer over the screen leaves the banner showing above it, under the
  // status bar: its style stays. Anything else that covers it sets its own.
  const { checkUnderSheet } = useIsUnderSheet();
  // This screen's style, while it shows: off the stack, the app's default.
  const [statusBar] = useState(statusBarStyleEntry);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      statusBar.clear();
    };
  }, [statusBar]);
  useFocusEffect(
    useCallback(() => {
      if (!switcherOverlay.get().open) statusBar.set(scrolled ? barStyle : 'light');
      // Cleared as it goes, then put back a frame on if all that covered it
      // was a drawer (as the screen blurs, the drawer isn't in the root state
      // yet). Clearing late instead could cover the next screen's own style.
      return () => {
        statusBar.clear();
        requestAnimationFrame(() => {
          if (mounted.current && checkUnderSheet()) statusBar.set(scrolled ? barStyle : 'light');
        });
      };
    }, [barStyle, checkUnderSheet, scrolled, statusBar]),
  );
  useEffect(() => {
    if (isFocused && !overlayOpen) statusBar.set(scrolled ? barStyle : 'light');
  }, [barStyle, isFocused, overlayOpen, scrolled, statusBar]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: amount(scrollOffset.value) }));
  const scrim = (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.scrim,
        {
          height: insets.top + SCRIM_TAIL,
          backgroundImage: scrimGradient(pageColor, insets.top * SOLID_SHARE, insets.top + SCRIM_TAIL),
        },
        scrimStyle,
      ]}
    />
  );

  return { scrollOffset, scrim };
}

/** How far (pt of scroll) the scrim takes to fade in, ending as the banner leaves the status bar. */
const FADE_RANGE = 72;
/** How much of the status bar's height the scrim holds its peak for. */
const SOLID_SHARE = 0.25;
/** The scrim's strongest opacity: the page shows through a little, never a solid bar. */
const PEAK_ALPHA = 0.8;
/** How far below the status bar the scrim's fade reaches. */
const SCRIM_TAIL = 48;
/** Stops along the fade; enough that it reads as a curve, not bands. */
const FADE_STEPS = 24;

/** Strongest at the top, then eased out to nothing. */
function scrimGradient(color: string, solid: number, height: number): string {
  return linearGradient([
    `${withAlpha(color, PEAK_ALPHA)} 0px`,
    ...easedFade(color, { from: PEAK_ALPHA, to: 0, start: solid, end: height, steps: FADE_STEPS }),
  ]);
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
});
