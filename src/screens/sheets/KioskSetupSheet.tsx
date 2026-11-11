import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { haptics } from '../../services/haptics';
import { useBiometricLabel } from '../../services/biometricLabel';
import { radii, useTheme } from '../../theme';
import { Button, Container, Icon, ListRow, PinPad, SegmentedControl, Sheet, SHEET_INSET } from '../../components/ui';
import { useApp } from '../../context/AppContext';
import { useBiometric } from '../../hooks/useBiometric';
import { kioskSetupSheet, type KioskSetupSheetData } from '../../navigation/sheetData';
import { useLeaveSheet } from '../../navigation/sheetPresenter';
import type { RootStackParamList } from '../../types';
import { useSheetData } from './useSheetData';

const PIN_LENGTH = 4;
/** How long a full row of dots shows before moving on. */
const ADVANCE_MS = 150;

/**
 * Kiosk mode's setup, a drawer from the scanner's ⋯ menu, in two pages: the
 * options (camera, screen pinning, biometrics), then a PIN on the keypad,
 * entered twice. A matching second entry starts kiosk mode: the drawer
 * closes, then the full-screen kiosk opens, which pins the screen on Android.
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
  const { tokens, type, spacing, radii } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const leave = useLeaveSheet();
  const { state } = useApp();
  const { isAvailable: biometricAvailable } = useBiometric();
  const biometricLabel = useBiometricLabel();

  const [page, setPage] = useState<'options' | 'pin'>('options');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [useBiometricUnlock, setUseBiometricUnlock] = useState(false);
  // Front for attendees scanning their own phone at the device; rear for a
  // device mounted to face a counter or wall.
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [pinScreen, setPinScreen] = useState(true);
  const startedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (biometricAvailable) setUseBiometricUnlock(true);
  }, [biometricAvailable]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const start = (entered: string) => {
    if (startedRef.current) return;
    startedRef.current = true;
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

  const onPinChange = (digits: string) => {
    clearTimeout(timerRef.current);
    setError(null);
    if (step === 'enter') {
      setPin(digits);
      if (digits.length === PIN_LENGTH) {
        timerRef.current = setTimeout(() => {
          setStep('confirm');
          haptics.selection();
        }, ADVANCE_MS);
      }
      return;
    }
    setConfirmPin(digits);
    if (digits.length !== PIN_LENGTH) return;
    timerRef.current = setTimeout(() => {
      if (digits === pin) {
        start(pin);
        return;
      }
      haptics.error();
      setError('PINs don’t match. Try again.');
      setPin('');
      setConfirmPin('');
      setStep('enter');
    }, ADVANCE_MS);
  };

  const openPinPage = () => {
    if (!state.currentEvent && !preview) {
      Alert.alert('No event selected', 'Pick an event before starting kiosk mode.');
      return;
    }
    setPage('pin');
  };

  const backToOptions = () => {
    clearTimeout(timerRef.current);
    setPin('');
    setConfirmPin('');
    setStep('enter');
    setError(null);
    setPage('options');
  };

  if (page === 'pin') {
    const confirming = step === 'confirm';
    return (
      <Sheet title="Kiosk mode">
        <View style={[styles.body, styles.pinPage, { gap: spacing.lg }]}>
          <View style={styles.hero}>
            <Text style={[type.h2, styles.center, { color: tokens.textH }]} accessibilityLiveRegion="polite">
              {confirming ? 'Confirm the PIN' : `Set a ${PIN_LENGTH}-digit PIN`}
            </Text>
            <Text style={[type.body, styles.center, { color: error ? tokens.error : tokens.text2 }]}>
              {error ??
                (confirming
                  ? 'Enter it again. Kiosk mode starts once it matches.'
                  : `Staff will need it${biometricAvailable && useBiometricUnlock ? ` or ${biometricLabel}` : ''} to exit kiosk mode.`)}
            </Text>
          </View>
          <PinPad
            value={confirming ? confirmPin : pin}
            onChange={onPinChange}
            length={PIN_LENGTH}
            error={!!error}
          />
          <Button variant="link" icon="arrow-left" title="Back to options" onPress={backToOptions} style={styles.centred} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet title="Kiosk mode">
      <View style={[styles.body, { gap: spacing.xl }]}>
        <View style={styles.hero}>
          <View style={[styles.iconWrap, { backgroundColor: tokens.tint.red.bg }]}>
            <Icon name="lock-closed" size={32} color={tokens.tint.red.fg} />
          </View>
          <Text style={[type.body, styles.center, { color: tokens.text2 }]}>
            Attendees can scan themselves. Staff will need a PIN
            {biometricAvailable ? ` or ${biometricLabel}` : ''} to exit kiosk mode.
          </Text>
          <View style={[styles.contextPill, { backgroundColor: tokens.shaded, borderColor: tokens.div2, borderRadius: radii.pill }]}>
            <Icon name="qrcode" size={16} color={tokens.text2} />
            <Text style={[type.label, { color: tokens.text2 }]}>
              {scanContextName || 'No scan context'}
            </Text>
          </View>
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
          title="Set PIN"
          variant="primary"
          icon="lock-closed"
          fullWidth
          onPress={openPinPage}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SHEET_INSET },
  pinPage: { paddingTop: 8 },
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
  centred: { alignSelf: 'center' },
  contextPill: {
    minHeight: 36,
    marginTop: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
