import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBiometric } from '../hooks/useBiometric';
import { colors } from '../theme/colors';
import { ParticipantDetailContent } from './ParticipantDetailContent';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ParticipantDetail'>;

export function ParticipantDetailScreen({ route, navigation }: Props) {
  const { participant } = route.params;
  const { authenticate } = useBiometric();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const success = await authenticate('Authenticate to view participant details');
      setIsAuthenticated(success);
      setIsAuthenticating(false);
      if (!success) {
        navigation.goBack();
      }
    }
    checkAuth();
  }, [authenticate, navigation]);

  if (isAuthenticating) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.authContainer}>
          <ActivityIndicator size="large" color={colors.red} />
          <Text style={styles.authText}>Authenticating...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ParticipantDetailContent participant={participant} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  authText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text.secondary,
  },
});
