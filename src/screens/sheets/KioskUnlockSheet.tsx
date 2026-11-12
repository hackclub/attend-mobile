import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { haptics } from '../../services/haptics';
import { useBiometricLabel } from '../../services/biometricLabel';
import { useTheme } from '../../theme';
import { PinPad, Sheet, SHEET_INSET } from '../../components/ui';
import { kioskUnlockSheet, type KioskUnlockSheetData } from '../../navigation/sheetData';
import { useLeaveSheet } from '../../navigation/sheetPresenter';
import { useSheetData } from './useSheetData';

const PIN_LENGTH = 4;
/** How long a full row of dots shows before it's checked. */
const CHECK_MS = 150;

/**
 * Exiting kiosk mode, a drawer over the kiosk: the PIN on the keypad, or
 * biometrics when kiosk setup allowed them (offered straight away, and on
 * the keypad's spare key).
 */
export function KioskUnlockSheet() {
  const data = useSheetData(kioskUnlockSheet);
  return data ? <KioskUnlock {...data} /> : null;
}

function KioskUnlock({ biometricUnlock, lockedUntil, attemptsLeft, checkPin, onUnlocked }: KioskUnlockSheetData) {
  const { tokens, type, spacing } = useTheme();
  const leave = useLeaveSheet();
  const biometricLabel = useBiometricLabel();
  const [entry, setEntry] = useState('');
  const [wrong, setWrong] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const unlockedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const locked = lockedUntil !== null && now < lockedUntil;
  const remaining = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;

  useEffect(() => {
    if (!lockedUntil) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [lockedUntil]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const unlock = () => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    haptics.success();
    leave(onUnlocked);
  };

  const tryBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Exit kiosk mode',
        fallbackLabel: 'Enter PIN',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
      });
      if (result.success) unlock();
    } catch {
      // The keypad is still there.
    }
  };

  // Offers biometrics as the drawer opens, once.
  const offeredRef = useRef(false);
  useEffect(() => {
    if (offeredRef.current || !biometricUnlock || locked) return;
    offeredRef.current = true;
    void tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, []);

  const onChange = (digits: string) => {
    clearTimeout(timerRef.current);
    setWrong(false);
    setEntry(digits);
    if (digits.length !== PIN_LENGTH) return;
    timerRef.current = setTimeout(() => {
      if (checkPin(digits)) {
        unlock();
        return;
      }
      haptics.error();
      setWrong(true);
      setEntry('');
    }, CHECK_MS);
  };

  const message = locked
    ? `Too many attempts. Try again in ${remaining}s.`
    : wrong
      ? `Wrong PIN — ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left`
      : `Enter the ${PIN_LENGTH}-digit PIN${biometricUnlock ? ` or use ${biometricLabel}` : ''}.`;

  return (
    <Sheet title="Exit kiosk mode">
      <View style={[styles.body, { gap: spacing.lg }]}>
        <Text
          style={[type.body, styles.center, { color: locked ? tokens.warning : wrong ? tokens.error : tokens.text2 }]}
          accessibilityLiveRegion="polite"
        >
          {message}
        </Text>
        <PinPad
          value={entry}
          onChange={onChange}
          length={PIN_LENGTH}
          error={wrong}
          disabled={locked}
          extraKey={
            biometricUnlock
              ? { icon: 'finger-print', accessibilityLabel: `Use ${biometricLabel}`, onPress: () => void tryBiometric() }
              : undefined
          }
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SHEET_INSET, paddingTop: 4 },
  center: { textAlign: 'center' },
});
