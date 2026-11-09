import React, { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, View, type AppStateStatus } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { biometricService } from '../services/biometric';
import { useTheme } from '../theme';

// iOS snapshots the app for the app switcher after it resigns active; the
// opaque cover below is drawn on 'inactive', in time for that snapshot.
// It can't reach native modals (the ID check, kiosk), so the system-level
// blur from expo-screen-capture covers the whole key window as well.
//
// Android has no 'inactive', and the recents thumbnail is taken before JS
// can render anything on 'background', so the cover there is best-effort
// only. The real protection on Android is FLAG_SECURE, which BiometricGate
// sets while participant details are on screen.
if (Platform.OS === 'ios') {
  ScreenCapture.enableAppSwitcherProtectionAsync(1).catch(() => {});
}

export function shouldCoverApp(state: AppStateStatus | string | null | undefined): boolean {
  return state === 'inactive' || state === 'background';
}

/**
 * An opaque layer over the whole app while it isn't in the foreground. It
 * also ends the biometric unlock when the app goes to the background, so
 * the next look at participant details asks again.
 *
 * Render it once, after the navigator, so it sits on top.
 */
export function PrivacyCover() {
  const { tokens } = useTheme();
  const [covered, setCovered] = useState(() => shouldCoverApp(AppState.currentState));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      biometricService.handleAppStateChange(next);
      setCovered(shouldCoverApp(next));
    });
    return () => subscription.remove();
  }, []);

  if (!covered) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: tokens.bg }]}
      testID="privacy-cover"
    />
  );
}

const styles = StyleSheet.create({
  cover: {
    zIndex: 1000,
    elevation: 1000,
  },
});
