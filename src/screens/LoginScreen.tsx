import React, { useState } from 'react';
import { Alert, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../hooks/useAuth';
import { HackClubFlag } from '../components/HackClubFlag';
import { overlayTokens, typography, useTheme, withAlpha } from '../theme';
import { Button } from '../components/ui';

const HERO = require('../../assets/login-hero.webp');

// Number of bands used to fake a bottom-up dark gradient over the hero photo.
const GRADIENT_STOPS = 18;

// Dev-only sign-in shortcuts, matched to the backend's seeded users by email
// (emails are stable across dev databases; UUIDs are not).
const DEV_PARTICIPANT_EMAIL = 'participant-demo@hackclub.com';
const DEV_ORGANIZER_EMAIL = 'admin@hackclub.com';

export function LoginScreen() {
  const { tokens, type, spacing } = useTheme();
  const { login, devLogin } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const handleDevLogin = async (email: string) => {
    setIsLoading(true);
    try {
      const ok = await devLogin({ email });
      if (!ok) Alert.alert('Dev login failed', `Could not sign in as ${email}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const success = await login();
      if (!success) {
        Alert.alert('Login failed', 'Unable to authenticate. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ImageBackground source={HERO} style={styles.bg} resizeMode="cover">
      <StatusBar style="light" />
      {/* Scrims: a light overall darken, plus a smooth bottom-up fade (faked
          with stacked opacity bands since we don't bundle a gradient lib). */}
      <View style={styles.scrim} />
      <View style={styles.gradient} pointerEvents="none">
        {Array.from({ length: GRADIENT_STOPS }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: withAlpha(overlayTokens.ink, (i / (GRADIENT_STOPS - 1)) ** 1.4 * 0.9),
            }}
          />
        ))}
      </View>

      <SafeAreaView style={styles.safe}>
        <View style={[styles.top, { paddingHorizontal: spacing.xxl }]}>
          <HackClubFlag width={132} />
        </View>

        <View style={{ paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxl }}>
          <Text style={[type.label, styles.eyebrow]}>HACK CLUB</Text>
          <Text style={[styles.title, { color: tokens.brand }]} accessibilityRole="header">
            Sign in to Attend
          </Text>
          <Text style={styles.subtitle}>Your tickets, passes, and event check-in — all in one place.</Text>

          <Button
            title="Sign in with Hack Club"
            variant="primary"
            fullWidth
            loading={isLoading}
            onPress={handleLogin}
          />

          {__DEV__ && (
            <View style={[styles.devRow, { marginTop: spacing.md, gap: spacing.md }]}>
              <Button
                title="Dev: participant"
                onPress={() => handleDevLogin(DEV_PARTICIPANT_EMAIL)}
                disabled={isLoading}
                style={styles.devButton}
              />
              <Button
                title="Dev: organizer"
                onPress={() => handleDevLogin(DEV_ORGANIZER_EMAIL)}
                disabled={isLoading}
                style={styles.devButton}
              />
            </View>
          )}

          <Text style={[type.body, styles.footer, { marginTop: spacing.xl }]}>For attendees and event staff.</Text>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

// The photo is dark in both appearances, so text on it is fixed white.
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: overlayTokens.ink },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: withAlpha(overlayTokens.ink, 0.32) },
  // Smooth bottom-up fade (stacked bands) so the sign-in content stays legible.
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '85%',
    flexDirection: 'column',
  },
  safe: { flex: 1, justifyContent: 'space-between' },
  top: { paddingTop: 16 },
  eyebrow: { letterSpacing: 2.5, color: withAlpha(overlayTokens.on, 0.75), marginBottom: 8 },
  // Display type over the photo: h1's weight at the stat size.
  title: { ...typography.h1, fontSize: typography.stat.fontSize, lineHeight: typography.stat.lineHeight, marginBottom: 12 },
  subtitle: { ...typography.body, fontSize: typography.h3.fontSize, lineHeight: typography.h2.lineHeight, color: withAlpha(overlayTokens.on, 0.9), marginBottom: 28 },
  devRow: { flexDirection: 'row' },
  devButton: { flex: 1 },
  footer: { color: withAlpha(overlayTokens.on, 0.6), textAlign: 'center' },
});
