import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { haptics } from '../services/haptics';
import { useBiometricLabel } from '../services/biometricLabel';
import { radii, useTheme } from '../theme';
import { Button, Container, Flashbar, Icon, ListRow } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useBiometric } from '../hooks/useBiometric';
import type { AppStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'KioskSetup'>;
type KioskSetupRoute = RouteProp<AppStackParamList, 'KioskSetup'>;

const PIN_LENGTH = 4;

export function KioskSetupScreen() {
  const { tokens, type, spacing, radii } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<KioskSetupRoute>();
  const { state } = useApp();
  const { isAvailable: biometricAvailable } = useBiometric();
  const biometricLabel = useBiometricLabel();

  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [useBiometricUnlock, setUseBiometricUnlock] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

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
          haptics.selection();
        }, 120);
      } else {
        setTimeout(() => validateAndContinue(pin, digits), 120);
      }
    }
  };

  const validateAndContinue = (entered: string, confirmed: string) => {
    if (entered !== confirmed) {
      haptics.error();
      setError('PINs don’t match. Try again.');
      setPin('');
      setConfirmPin('');
      setStep('enter');
      return;
    }
    haptics.success();
    navigation.replace('Kiosk', {
      pin: entered,
      biometricUnlock: biometricAvailable && useBiometricUnlock,
      scanContextId: route.params?.scanContextId,
      scanContextName: route.params?.scanContextName,
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

  const ready = pin.length === PIN_LENGTH && confirmPin.length === PIN_LENGTH;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: tokens.shaded }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <View style={[styles.header, { paddingHorizontal: spacing.sm }]}>
        <Button title="Close" variant="icon" icon="x" onPress={() => navigation.goBack()} />
        <Text style={[type.h3, { color: tokens.textH }]} accessibilityRole="header">
          Kiosk Mode
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.scroll, { padding: spacing.xxl, gap: spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={[styles.iconWrap, { backgroundColor: tokens.tint.red.bg }]}>
            <Icon name="lock-closed" size={32} color={tokens.tint.red.fg} />
          </View>
          <Text style={[type.h1, { color: tokens.textH }]}>Set a {PIN_LENGTH}-digit PIN</Text>
          <Text style={[type.body, styles.center, { color: tokens.text2 }]}>
            Attendees can scan themselves. Staff will need this PIN
            {biometricAvailable ? ` or ${biometricLabel}` : ''} to exit kiosk mode.
          </Text>
          <View style={[styles.contextPill, { backgroundColor: tokens.bg, borderColor: tokens.div2, borderRadius: radii.pill }]}>
            <Icon name="qrcode" size={16} color={tokens.text2} />
            <Text style={[type.label, { color: tokens.text2 }]}>
              {route.params?.scanContextName || 'No scan context'}
            </Text>
          </View>
        </View>

        <View style={styles.pinSection}>
          <Text style={[type.label, { color: tokens.text }]}>{step === 'enter' ? 'Enter PIN' : 'Confirm PIN'}</Text>
          <Pressable
            onPress={() => inputRef.current?.focus()}
            style={styles.dotsRow}
            accessibilityRole="button"
            accessibilityLabel={`${step === 'enter' ? 'Enter PIN' : 'Confirm PIN'}, ${currentValue.length} of ${PIN_LENGTH} digits`}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => {
              const filled = i < currentValue.length;
              return (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { borderColor: error ? tokens.error : filled ? tokens.accent : tokens.input },
                    filled && { backgroundColor: tokens.accent },
                  ]}
                />
              );
            })}
          </Pressable>
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
          {error ? (
            <Text style={[type.body, { color: tokens.error }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>

        {biometricAvailable && (
          <Container flush>
            <ListRow
              title={`Allow ${biometricLabel} to exit`}
              subtitle="Faster for staff. PIN still works as a fallback."
              divider={false}
              toggle={{ value: useBiometricUnlock, onValueChange: setUseBiometricUnlock }}
            />
          </Container>
        )}

        {/* iOS has no app-side lock, so Guided Access is suggested; Android
            pins the screen itself when kiosk mode starts. */}
        {Platform.OS === 'ios' ? (
          <Flashbar
            type="info"
            message="Tip: Turn on Guided Access (Settings › Accessibility) for a hardware-level lock. Triple-click the side button to lock the iPad to this app."
          />
        ) : (
          <Flashbar
            type="info"
            message="Kiosk mode pins the screen to Attend. Confirm when Android asks; exiting kiosk mode unpins it."
          />
        )}

        <Button
          title="Start Kiosk Mode"
          variant="primary"
          icon="lock-closed"
          fullWidth
          onPress={handleStartPress}
          disabled={!ready}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  headerSpacer: { width: 44 },
  scroll: { paddingBottom: 48 },
  hero: { alignItems: 'center', gap: 8 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  center: { textAlign: 'center' },
  contextPill: {
    minHeight: 36,
    marginTop: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pinSection: { alignItems: 'center', gap: 16 },
  dotsRow: { flexDirection: 'row', gap: 16, padding: 8 },
  dot: { width: 18, height: 18, borderRadius: radii.pill, borderWidth: 2 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
