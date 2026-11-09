import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, View, Text, StyleSheet, ActivityIndicator, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenCapture from 'expo-screen-capture';
import { useBiometricGate, DEFAULT_GATE_REASON } from '../hooks/useBiometricGate';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';

let nextGateId = 0;

/**
 * Shows its children only after the device owner has authenticated, and
 * hides them again whenever the unlock ends (app backgrounded, sign-out).
 *
 * Every view of full participant details must sit inside one. Locked, it
 * shows a placeholder with an Unlock button in place, so it works the same
 * in a pushed screen and in the iPad split pane.
 *
 * While unlocked on Android it also sets FLAG_SECURE: the recents thumbnail
 * is captured before JS can draw the privacy cover, and the flag is the only
 * thing that reliably blanks it (it blocks screenshots too). The flag stays
 * until the app is in the foreground again, since the lock that hid the
 * details is what backgrounding the app triggers.
 */
export function BiometricGate({
  children,
  reason = DEFAULT_GATE_REASON,
  topInset = 0,
  onCancel,
}: {
  children: ReactNode;
  reason?: string;
  topInset?: number;
  // Offers a way out from a locked screen that can't be swiped away.
  onCancel?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { status, unlock, isUnlocked } = useBiometricGate(reason);
  useSecureWindowWhile(isUnlocked);

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]} testID="biometric-gate-locked">
      {status === 'authenticating' ? (
        <>
          <ActivityIndicator size="large" color={colors.text.accent} />
          <Text style={styles.body}>Authenticating…</Text>
        </>
      ) : (
        <>
          <Ionicons name="lock-closed" size={36} color={colors.text.secondary} />
          <Text style={styles.title}>Participant details are locked</Text>
          <Text style={styles.body}>
            Unlock with your device’s biometrics or passcode to view them.
          </Text>
          <Pressable
            onPress={() => { void unlock(); }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>Unlock</Text>
          </Pressable>
          {onCancel ? (
            <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

export function useSecureWindowWhile(active: boolean) {
  const [key] = useState(() => `biometric-gate-${nextGateId++}`);
  // A release waiting for the app to come back to the foreground.
  const pendingRelease = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android' || !active) return;
    pendingRelease.current?.remove();
    pendingRelease.current = null;
    ScreenCapture.preventScreenCaptureAsync(key).catch(() => {});
    return () => {
      const release = () => {
        ScreenCapture.allowScreenCaptureAsync(key).catch(() => {});
      };
      // Locked by going to the background: the recents thumbnail is taken
      // now, so keep the flag until the app is active again.
      if (AppState.currentState === 'active') {
        release();
        return;
      }
      pendingRelease.current?.remove();
      const subscription = AppState.addEventListener('change', (next) => {
        if (next !== 'active') return;
        subscription.remove();
        if (pendingRelease.current === subscription) pendingRelease.current = null;
        release();
      });
      pendingRelease.current = subscription;
    };
  }, [active, key]);
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.red,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  cancelText: {
    marginTop: 4,
    fontSize: 16,
    color: colors.text.accent,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
});
