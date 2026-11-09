import React, { useCallback, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { setStatusBarStyle } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

export interface BannerStatusBar {
  /** On the View wrapping the banner, to measure it. */
  onBannerLayout: (e: LayoutChangeEvent) => void;
  /** On the ScrollView (with a scrollEventThrottle). */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Render after the ScrollView, inside a container that fills the screen. */
  scrim: ReactNode;
}

/**
 * The status bar over a screen that opens with the event banner. The banner
 * is a dark photo or fill in both schemes, so the status bar is light over
 * it. Once the banner scrolls out from under the status bar the page shows
 * through, so this switches to the scheme's style over a page-coloured scrim.
 */
export function useBannerStatusBar(pageColor: string): BannerStatusBar {
  const { barStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const [bannerHeight, setBannerHeight] = useState(0);
  const [pastBanner, setPastBanner] = useState(false);

  const onBannerLayout = useCallback((e: LayoutChangeEvent) => {
    setBannerHeight(e.nativeEvent.layout.height);
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const past = bannerHeight > 0 && e.nativeEvent.contentOffset.y >= bannerHeight - insets.top;
      setPastBanner((prev) => (prev === past ? prev : past));
    },
    [bannerHeight, insets.top],
  );

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(pastBanner ? barStyle : 'light');
      return () => setStatusBarStyle(barStyle);
    }, [barStyle, pastBanner]),
  );

  const scrim = pastBanner ? (
    <View pointerEvents="none" style={[styles.scrim, { height: insets.top, backgroundColor: pageColor }]} />
  ) : null;

  return { onBannerLayout, onScroll, scrim };
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
});
