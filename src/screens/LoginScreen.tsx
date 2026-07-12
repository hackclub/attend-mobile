import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../hooks/useAuth';
import { HackClubFlag } from '../components/HackClubFlag';
import { colors } from '../theme/colors';

const HERO = require('../../assets/login-hero.jpg');

// Number of bands used to fake a bottom-up dark gradient over the hero photo.
const GRADIENT_STOPS = 18;

// Dev-only: a non-admin participant with a confirmed ticket, for testing the
// participant-only experience without an admin OAuth login.
const DEV_PARTICIPANT_USER_ID = '749e91d8-4f07-4de8-b959-09573239b0a7';

export function LoginScreen() {
  const { login, devLogin } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleDevParticipant = async () => {
    setIsLoading(true);
    try {
      const ok = await devLogin(DEV_PARTICIPANT_USER_ID);
      if (!ok) Alert.alert('Dev login failed', 'Could not sign in as the demo participant.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const success = await login();
      if (!success) {
        Alert.alert('Login Failed', 'Unable to authenticate. Please try again.');
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
              backgroundColor: `rgba(8,10,18,${((i / (GRADIENT_STOPS - 1)) ** 1.4 * 0.9).toFixed(3)})`,
            }}
          />
        ))}
      </View>

      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          <HackClubFlag width={132} />
        </View>

        <View style={styles.content}>
          <Text style={styles.eyebrow}>HACK CLUB</Text>
          <Text style={styles.title}>Sign in to Attend</Text>
          <Text style={styles.subtitle}>
            Your tickets, passes, and event check-in — all in one place.
          </Text>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.red} />
            ) : (
              <Text style={styles.buttonText}>Sign in with Hack Club</Text>
            )}
          </TouchableOpacity>

          {__DEV__ && (
            <TouchableOpacity
              style={styles.devButton}
              onPress={handleDevParticipant}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.devButtonText}>Dev: sign in as participant</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.footer}>For attendees and event staff.</Text>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.gray[900] },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,12,20,0.32)' },
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
  top: { paddingHorizontal: 28, paddingTop: 16 },
  content: { paddingHorizontal: 28, paddingBottom: 24 },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.red,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 23,
    marginBottom: 28,
  },
  button: {
    backgroundColor: colors.white,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { fontSize: 17, fontWeight: '700', color: colors.red },
  devButton: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  devButtonText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  footer: {
    marginTop: 20,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
});
