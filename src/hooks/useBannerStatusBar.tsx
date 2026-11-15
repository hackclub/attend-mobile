import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { setStatusBarStyle } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { easedFade, linearGradient, useTheme, withAlpha } from '../theme';
import { useReduceMotion } from './useReduceMotion';

export interface BannerStatusBar {
  /** On the ScrollView (with a scrollEventThrottle). */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** The same, given the scroll offset (e.g. from a Reanimated scroll handler). */
  onScrollY: (y: number) => void;
  /** Render after the ScrollView, inside a container that fills the screen. */
  scrim: ReactNode;
}

/**
 * The status bar over a screen that opens with the event banner. The banner
 * is a dark photo or fill in both schemes, so at rest the status bar is light
 * over it. Once the page scrolls at all, a page-coloured scrim fades in behind
 * the status bar and it switches to the scheme's style. The scrim fades out
 * across the lower part of the status bar, so content scrolls away under it
 * rather than being cut off at a hard edge.
 */
export function useBannerStatusBar(pageColor: string): BannerStatusBar {
  const { barStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [scrolled, setScrolled] = useState(false);

  const onScrollY = useCallback((y: number) => {
    const past = y > SCROLLED_AFTER;
    setScrolled((prev) => (prev === past ? prev : past));
  }, []);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => onScrollY(e.nativeEvent.contentOffset.y),
    [onScrollY]
  );

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(scrolled ? barStyle : 'light');
      return () => setStatusBarStyle(barStyle);
    }, [barStyle, scrolled]),
  );

  // The scrim stays mounted and fades in and out rather than popping.
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const fade = Animated.timing(opacity, {
      toValue: scrolled ? 1 : 0,
      duration: reduceMotion ? 0 : SCRIM_DURATION,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [opacity, scrolled, reduceMotion]);

  const scrim = (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.scrim,
        {
          opacity,
          height: insets.top + SCRIM_TAIL,
          backgroundImage: scrimGradient(pageColor, insets.top * SOLID_SHARE, insets.top + SCRIM_TAIL),
        },
      ]}
    />
  );

  return { onScroll, onScrollY, scrim };
}

/** How far the page scrolls, in pt, before the scrim shows. */
const SCROLLED_AFTER = 2;
/** How much of the status bar's height the scrim holds its peak for. */
const SOLID_SHARE = 0.25;
/** The scrim's strongest opacity: the page shows through a little, never a solid bar. */
const PEAK_ALPHA = 0.8;
/** How far below the status bar the scrim's fade reaches. */
const SCRIM_TAIL = 48;
/** Stops along the fade; enough that it reads as a curve, not bands. */
const FADE_STEPS = 24;
/** How long the scrim takes to fade in or out, in ms. */
const SCRIM_DURATION = 200;

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
