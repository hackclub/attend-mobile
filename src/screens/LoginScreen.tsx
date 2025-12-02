import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../theme/colors';

export function LoginScreen() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

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
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>📋</Text>
          <Text style={styles.title}>AttendScanner</Text>
          <Text style={styles.subtitle}>Event Check-In</Text>
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            Sign in with your Hack Club account to access event check-in.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.red} />
          ) : (
            <Text style={styles.buttonText}>Sign in with Hack Club</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footer}>
          Only authorized staff can access this app.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.red,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoText: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: colors.white,
    opacity: 0.9,
  },
  infoContainer: {
    marginBottom: 32,
  },
  infoText: {
    fontSize: 16,
    color: colors.white,
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.9,
  },
  button: {
    backgroundColor: colors.white,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.red,
  },
  footer: {
    marginTop: 24,
    fontSize: 14,
    color: colors.white,
    opacity: 0.7,
  },
});
