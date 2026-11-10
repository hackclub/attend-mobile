import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { haptics } from '../../services/haptics';
import { useBiometricLabel } from '../../services/biometricLabel';
import { radii, useTheme } from '../../theme';
import { Button, Container, Icon, ListRow, SegmentedControl, Sheet, SHEET_INSET } from '../../components/ui';
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

const CAMERA_OPTIONS = [
  { value: 'front', label: 'Front' },
  { value: 'back', label: 'Rear' },
] as const;

function KioskSetup({ scanContextId, scanContextName, preview }: KioskSetupSheetData) {
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
  // Front for attendees scanning their own phone at the device; rear for a
  // device mounted to face a counter or wall.
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [pinScreen, setPinScreen] = useState(true);
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
      facing,
      pinScreen,
      scanContextId,
      scanContextName,
    };
    // Only once the drawer has gone: the kiosk pins the screen, and must
    // not open under a closing sheet.
    leave(() => (preview ? preview.onStart() : navigation.navigate('Kiosk', params)));
  };

  const handleStartPress = () => {
    if (!state.currentEvent && !preview) {
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
          {/* The real input lies over the dots, transparent, so a tap lands
              on it and the system opens the keyboard. Focusing a hidden
              input from JS didn't show the keyboard inside Android's
              Compose sheet window. */}
          <View style={styles.dotsRow}>
            <View
              style={styles.dots}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
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
            </View>
            <TextInput
              ref={inputRef}
              value={currentValue}
              onChangeText={setCurrentValue}
              keyboardType="number-pad"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              maxLength={PIN_LENGTH}
              secureTextEntry
              style={styles.pinInput}
              caretHidden
              contextMenuHidden
              autoFocus
              accessibilityLabel={`${step === 'enter' ? 'Enter PIN' : 'Confirm PIN'}, ${currentValue.length} of ${PIN_LENGTH} digits`}
            />
          </View>
          {error ? (
            <Text style={[type.body, { color: tokens.error }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: spacing.xs }}>
          <Text style={[type.label, { color: tokens.text }]}>Camera</Text>
          <SegmentedControl
            options={CAMERA_OPTIONS}
            value={facing}
            onChange={setFacing}
            accessibilityLabel="Camera"
          />
        </View>

        {biometricAvailable || Platform.OS === 'android' ? (
          <Container flush>
            {/* Android pins the screen itself when kiosk mode starts. */}
            {Platform.OS === 'android' ? (
              <ListRow
                title="Pin the screen"
                subtitle="Keeps attendees in Attend. Confirm when Android asks; exiting kiosk mode unpins it."
                divider={biometricAvailable}
                toggle={{ value: pinScreen, onValueChange: setPinScreen }}
              />
            ) : null}
            {biometricAvailable ? (
              <ListRow
                title={`Allow ${biometricLabel} to exit`}
                subtitle="Faster for staff. PIN still works as a fallback."
                divider={false}
                toggle={{ value: useBiometricUnlock, onValueChange: setUseBiometricUnlock }}
              />
            ) : null}
          </Container>
        ) : null}

        {/* iOS has no app-side lock, so Guided Access is suggested. */}
        {Platform.OS === 'ios' ? (
          <Text style={[type.body, styles.center, { color: tokens.text2 }]}>
            Tip: To keep attendees in Attend, turn on Guided Access in Settings › Accessibility, then triple-click
            the side or Home button to start it.
          </Text>
        ) : null}

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
  dotsRow: { alignSelf: 'flex-start', padding: 8 },
  dot: { width: 18, height: 18, borderRadius: radii.pill, borderWidth: 2 },
  dots: { flexDirection: 'row', gap: 16 },
  // Covers the dots; its text, caret and underline are all invisible.
  pinInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
    padding: 0,
  },
});
