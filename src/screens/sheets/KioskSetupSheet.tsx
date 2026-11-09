import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { haptics } from '../../services/haptics';
import { useBiometricLabel } from '../../services/biometricLabel';
import { radii, useTheme } from '../../theme';
import { Button, Container, Flashbar, Icon, ListRow, Sheet, SHEET_INSET } from '../../components/ui';
import { useApp } from '../../context/AppContext';
import { useBiometric } from '../../hooks/useBiometric';
import { kioskSetupSheet, type KioskSetupSheetData } from '../../navigation/sheetData';
import { useLeaveSheet } from '../../navigation/sheetPresenter';
import type { RootStackParamList } from '../../types';
import { useSheetData } from './useSheetData';

const PIN_LENGTH = 4;

/**
 * Kiosk mode's setup, a drawer from the scanner's ⋯ menu: a PIN (and
 * optionally biometrics) to exit it later. Starting closes the drawer, then
 * opens the full-screen kiosk, which pins the screen on Android.
 */
export function KioskSetupSheet() {
  const data = useSheetData(kioskSetupSheet);
  return data ? <KioskSetup {...data} /> : null;
}

function KioskSetup({ scanContextId, scanContextName }: KioskSetupSheetData) {
  const { tokens, type, spacing, radii, isDark } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const leave = useLeaveSheet();
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
    const params = {
      pin: entered,
      biometricUnlock: biometricAvailable && useBiometricUnlock,
      scanContextId,
      scanContextName,
    };
    // Only once the drawer has gone: the kiosk pins the screen, and must
    // not open under a closing sheet.
    leave(() => navigation.navigate('Kiosk', params));
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
    <Sheet title="Kiosk mode">
      <View style={[styles.body, { gap: spacing.xl }]}>
        <View style={styles.hero}>
          <View style={[styles.iconWrap, { backgroundColor: tokens.tint.red.bg }]}>
            <Icon name="lock-closed" size={32} color={tokens.tint.red.fg} />
          </View>
          <Text style={[type.h2, { color: tokens.textH }]}>Set a {PIN_LENGTH}-digit PIN</Text>
          <Text style={[type.body, styles.center, { color: tokens.text2 }]}>
            Attendees can scan themselves. Staff will need this PIN
            {biometricAvailable ? ` or ${biometricLabel}` : ''} to exit kiosk mode.
          </Text>
          <View style={[styles.contextPill, { backgroundColor: tokens.shaded, borderColor: tokens.div2, borderRadius: radii.pill }]}>
            <Icon name="qrcode" size={16} color={tokens.text2} />
            <Text style={[type.label, { color: tokens.text2 }]}>
              {scanContextName || 'No scan context'}
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
            keyboardAppearance={isDark ? 'dark' : 'light'}
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
          title="Start kiosk mode"
          variant="primary"
          icon="lock-closed"
          fullWidth
          onPress={handleStartPress}
          disabled={!ready}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SHEET_INSET },
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
