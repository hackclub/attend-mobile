import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon, Spinner, type IconName } from './ui';
import { useReduceMotion } from '../hooks/useReduceMotion';
import type { ScannerResult } from '../services/scannerCore';
import { overlayTokens, typography, useTheme, type ThemeTokens } from '../theme';
import { firstName } from '../services/kioskGreeting';

/** Where the bloom starts: the scan frame, in window coordinates. */
export interface WelcomeOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Look {
  icon: IconName;
  /** The existing outcome label, small above the greeting. */
  label: string;
  title: string;
  detail?: string;
  color: string;
}

function lookFor(result: ScannerResult, tokens: ThemeTokens): Look {
  const first = firstName(result.participant);
  const hello = (greeting: string) => (first ? `${greeting}, ${first}!` : `${greeting}!`);
  switch (result.outcome) {
    case 'scanned':
      return { icon: 'check', label: 'Scanned', title: hello('Welcome'), detail: "You're checked in.", color: tokens.success };
    case 'already_scanned':
      return {
        icon: 'check',
        label: 'Already scanned',
        title: hello('Welcome back'),
        detail: result.message || "You're already checked in.",
        color: tokens.warning,
      };
    case 'queued':
      return {
        icon: 'check',
        label: 'Saved offline',
        title: hello('Welcome'),
        detail: "Saved on this device; it'll sync once it's back online.",
        color: tokens.inactive,
      };
    case 'not_scanned':
    default:
      return {
        icon: 'x',
        label: 'Not scanned',
        title: 'Couldn’t check in',
        detail: result.message || 'Please see a staff member.',
        color: tokens.error,
      };
  }
}

/**
 * Kiosk mode's answer to a scan, big enough to read from across the desk: a
 * colour blooms out of the scan frame to fill the screen, a tick (or a cross)
 * springs in, and the attendee is greeted by their first name. It stays until
 * `result` clears, then fades away. While a scan is still being confirmed
 * there's only a small "hold steady" note.
 */
export function KioskWelcome({ result, origin }: { result: ScannerResult | null; origin: WelcomeOrigin | null }) {
  const { tokens, type } = useTheme();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  // What's on screen: the last result, kept while it animates away.
  const [shown, setShown] = useState<ScannerResult | null>(null);
  const bloom = useSharedValue(0);
  const mark = useSharedValue(0);
  const words = useSharedValue(0);
  const fade = useSharedValue(0);

  const final = result && result.outcome !== 'confirming' ? result : null;
  const key = final?.attemptId ?? null;

  useEffect(() => {
    if (final) {
      setShown(final);
      fade.set(1);
      if (reduceMotion) {
        bloom.set(1);
        mark.set(1);
        words.set(1);
        fade.set(0);
        fade.set(withTiming(1, { duration: 180 }));
        return;
      }
      bloom.set(0);
      mark.set(0);
      words.set(0);
      bloom.set(withTiming(1, { duration: 420, easing: Easing.bezier(0.2, 0, 0, 1) }));
      mark.set(withDelay(140, withSpring(1, { damping: 12, stiffness: 180, mass: 0.8 })));
      words.set(withDelay(220, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) })));
      return;
    }
    // Cleared (or a new scan is being confirmed): fade what's there away.
    fade.set(
      withTiming(0, { duration: 260 }, (finished) => {
        if (finished) scheduleOnRN(setShown, null);
      })
    );
    // Only on a new result, or its clearing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The bloom: a circle centred on the scan frame that grows from the frame's
  // size to cover the whole screen.
  const cx = origin ? origin.x + origin.width / 2 : width / 2;
  const cy = origin ? origin.y + origin.height / 2 : height / 2;
  const reach = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
  const diameter = reach * 2;
  const startScale = (origin ? Math.min(origin.width, origin.height) : 120) / diameter;

  const look = shown ? lookFor(shown, tokens) : null;

  const bloomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: startScale + (1 - startScale) * bloom.value }],
    opacity: interpolate(bloom.value, [0, 0.15], [0, 1], 'clamp'),
  }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: interpolate(mark.value, [0, 0.4], [0, 1], 'clamp'),
    transform: [{ scale: 0.4 + 0.6 * mark.value }],
  }));
  const wordsStyle = useAnimatedStyle(() => ({
    opacity: words.value,
    transform: [{ translateY: (1 - words.value) * 16 }],
  }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const confirming = result?.outcome === 'confirming';

  return (
    <>
      {look ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, fadeStyle]}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          accessible
          accessibilityLabel={[look.label, look.title, look.detail].filter(Boolean).join('. ')}
        >
          <Animated.View
            style={[
              styles.bloom,
              {
                width: diameter,
                height: diameter,
                borderRadius: diameter / 2,
                left: cx - diameter / 2,
                top: cy - diameter / 2,
                backgroundColor: look.color,
              },
              bloomStyle,
            ]}
          />
          <View style={styles.content}>
            <Animated.View style={[styles.mark, markStyle]}>
              <Icon name={look.icon} size={96} color={look.color} />
            </Animated.View>
            <Animated.View style={[styles.words, wordsStyle]}>
              <Text style={[type.label, styles.label]}>{look.label.toUpperCase()}</Text>
              <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit>
                {look.title}
              </Text>
              {look.detail ? (
                <Text style={[type.body, styles.detail]} numberOfLines={3}>
                  {look.detail}
                </Text>
              ) : null}
            </Animated.View>
          </View>
        </Animated.View>
      ) : null}
      {confirming && !look ? (
        <View style={styles.confirmingWrap} pointerEvents="none">
          <View style={[styles.confirming, { backgroundColor: tokens.bg, borderColor: tokens.div2 }]}>
            <Spinner size="small" color={tokens.info} />
            <Text style={[type.label, { color: tokens.textH }]}>Hold steady</Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

const MARK = 168;

const styles = StyleSheet.create({
  bloom: { position: 'absolute' },
  content: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 28, paddingHorizontal: 32 },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    backgroundColor: overlayTokens.on,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { alignItems: 'center', gap: 8 },
  label: { color: overlayTokens.on, opacity: 0.85, letterSpacing: 1.5 },
  title: {
    ...typography.h1,
    fontSize: typography.h1.fontSize * 1.4,
    lineHeight: typography.h1.lineHeight * 1.4,
    color: overlayTokens.on,
    textAlign: 'center',
  },
  detail: { color: overlayTokens.on, opacity: 0.9, textAlign: 'center', maxWidth: 420 },
  confirmingWrap: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 88 },
  confirming: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
});
