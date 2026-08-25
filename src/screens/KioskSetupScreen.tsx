import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { useBiometric } from '../hooks/useBiometric';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'KioskSetup'>;
type KioskSetupRoute = RouteProp<RootStackParamList, 'KioskSetup'>;

const PIN_LENGTH = 4;

export function KioskSetupScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<KioskSetupRoute>();
  const { state } = useApp();
  const { isAvailable: biometricAvailable, biometricType } = useBiometric();

  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [useBiometricUnlock, setUseBiometricUnlock] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (biometricAvailable) setUseBiometricUnlock(true);
  }, [biometricAvailable]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [step]);

  const currentValue = step === 'enter' ? pin : confirmPin;
  const setCurrentValue = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (step === 'enter') setPin(digits);
    else setConfirmPin(digits);
    setError(null);

    if (digits.length === PIN_LENGTH) {
      if (step === 'enter') {
        setTimeout(() => {
          setStep('confirm');
          Haptics.selectionAsync();
        }, 120);
      } else {
        setTimeout(() => validateAndContinue(pin, digits), 120);
      }
    }
  };

  const validateAndContinue = (entered: string, confirmed: string) => {
    if (entered !== confirmed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('PINs don’t match. Try again.');
      setPin('');
      setConfirmPin('');
      setStep('enter');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.replace('Kiosk', {
      pin: entered,
      biometricUnlock: biometricAvailable && useBiometricUnlock,
      scanContextId: route.params.scanContextId,
      scanContextName: route.params.scanContextName,
    });
  };

  const handleStartPress = () => {
    if (!state.currentEvent) {
      Alert.alert('No event selected', 'Pick an event before starting kiosk mode.');
      return;
    }
    if (pin.length !== PIN_LENGTH) {
      inputRef.current?.focus();
      return;
    }
    if (confirmPin.length !== PIN_LENGTH) {
      setStep('confirm');
      return;
    }
    validateAndContinue(pin, confirmPin);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={28} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Kiosk Mode</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={36} color={colors.red} />
          </View>
          <Text style={styles.heroTitle}>Set a {PIN_LENGTH}-digit PIN</Text>
          <Text style={styles.heroSubtitle}>
            Attendees can scan themselves. Staff will need this PIN
            {biometricAvailable ? ` or ${biometricType}` : ''} to exit kiosk mode.
          </Text>
          <View style={styles.contextPill}>
            <Ionicons name="scan" size={16} color={colors.text.secondary} />
            <Text style={styles.contextPillText}>
              {route.params.scanContextName || 'No scan context'}
            </Text>
          </View>
        </View>

        <View style={styles.pinSection}>
          <Text style={styles.stepLabel}>
            {step === 'enter' ? 'Enter PIN' : 'Confirm PIN'}
          </Text>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => inputRef.current?.focus()}
            style={styles.dotsRow}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < currentValue.length && styles.dotFilled,
                  error && styles.dotError,
                ]}
              />
            ))}
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            value={currentValue}
            onChangeText={setCurrentValue}
            keyboardType="number-pad"
            maxLength={PIN_LENGTH}
            secureTextEntry
            style={styles.hiddenInput}
            caretHidden
            autoFocus
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        {biometricAvailable && (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Allow {biometricType} to exit</Text>
              <Text style={styles.rowSubtitle}>
                Faster for staff. PIN still works as a fallback.
              </Text>
            </View>
            <Switch
              value={useBiometricUnlock}
              onValueChange={setUseBiometricUnlock}
              trackColor={{ false: colors.gray[300], true: colors.red }}
            />
          </View>
        )}

        <View style={styles.tipBox}>
          <Ionicons name="information-circle" size={18} color={colors.blue} />
          <Text style={styles.tipText}>
            Tip: Turn on Guided Access (Settings › Accessibility) for a hardware-level lock.
            Triple-click the side button to lock the iPad to this app.
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.startBtn,
            (pin.length !== PIN_LENGTH || confirmPin.length !== PIN_LENGTH) &&
              styles.startBtnDisabled,
          ]}
          onPress={handleStartPress}
          disabled={pin.length !== PIN_LENGTH || confirmPin.length !== PIN_LENGTH}
        >
          <Ionicons name="lock-closed" size={20} color={colors.white} />
          <Text style={styles.startBtnText}>Start Kiosk Mode</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 24, paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  closeBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text.primary },
  hero: { alignItems: 'center', marginTop: 12, marginBottom: 32 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(236,55,80,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  contextPill: {
    minHeight: 40,
    marginTop: 16,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.gray[100],
  },
  contextPillText: { color: colors.text.secondary, fontSize: 14, fontWeight: '700' },
  pinSection: { alignItems: 'center', marginBottom: 32 },
  stepLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  dotsRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.gray[300],
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: colors.red, borderColor: colors.red },
  dotError: { borderColor: colors.red },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  errorText: { color: colors.red, fontSize: 14, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  rowSubtitle: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(51,142,218,0.08)',
    padding: 14,
    borderRadius: 10,
    gap: 10,
    marginBottom: 24,
  },
  tipText: { flex: 1, fontSize: 13, color: colors.text.secondary, lineHeight: 19 },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.red,
    padding: 18,
    borderRadius: 14,
    gap: 10,
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: colors.white, fontSize: 17, fontWeight: '700' },
});
