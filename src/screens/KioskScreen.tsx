import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  BackHandler,
  AccessibilityInfo,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { haptics } from '../services/haptics';
import { EventCover } from '../components/EventBanner';
import { Button, Icon, pressedStyle, ripple } from '../components/ui';
import { useTheme } from '../theme';
import { ParticipantAvatar } from '../components/ParticipantAvatar';
import { useScanFeedback } from '../hooks/useScanFeedback';
import { useScanner } from '../hooks/useScanner';
import { useScannerPowerMode } from '../hooks/useScannerPowerMode';
import { useApp } from '../context/AppContext';
import type { ScannerResult } from '../services/scannerCore';
import { colors } from '../theme/colors';
import type { AppStackParamList } from '../types';
import { startScreenPinning, stopScreenPinning } from '../../modules/activity-controller/src';

type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'Kiosk'>;
type KioskRoute = RouteProp<AppStackParamList, 'Kiosk'>;

const PIN_LENGTH = 4;
const MAX_PIN_ATTEMPTS = 3;
const LOCKOUT_MS = 30_000;
const RESULT_PRIVACY_TIMEOUT_MS = 2_500;

export function KioskScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<KioskRoute>();
  const {
    pin: kioskPin,
    biometricUnlock,
    scanContextId,
  } = route.params;
  const { state } = useApp();
  const { tokens, type, radii } = useTheme();
  // Read from the provider rather than a native SafeAreaView: presented as a
  // full-screen modal, the native view under-reported the top inset on
  // iPhone and the header ran into the Dynamic Island.
  const insets = useSafeAreaInsets();
  // Measured per render, not once at import: the scene resizes under us every
  // time iPhone Duo is folded, unfolded or rotated.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scanSize = Math.min(windowWidth - 48, windowHeight * 0.42, 420);
  const {
    handleScan,
    isProcessing,
    lastScan,
    hideLastScan,
    scanContexts,
    selectedContextId,
    contextsReady,
  } = useScanner({ lockedContextId: scanContextId });
  const { play, isReady: isFeedbackReady } = useScanFeedback();

  const [permission, requestPermission] = useCameraPermissions();
  const { recordScannerActivity } = useScannerPowerMode(!!permission?.granted);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [escapeOpen, setEscapeOpen] = useState(false);
  const lastFeedbackAttemptRef = useRef<string | null>(null);

  const selectedContext = scanContexts.find(c => c.id === selectedContextId);
  const contextValid = contextsReady
    && (scanContexts.length === 0 || !!selectedContext);

  // Disable back gesture / hardware back while in kiosk.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [])
  );

  // Android pins the screen while kiosk mode runs (the system asks to
  // confirm), so the device can't leave Attend; exiting through the PIN or
  // biometrics unpins it. iOS relies on Guided Access, set up in KioskSetup.
  useEffect(() => {
    void startScreenPinning();
    return () => {
      void stopScreenPinning();
    };
  }, []);

  useEffect(() => {
    if (!lastScan || lastScan.outcome === 'confirming') return;
    if (lastFeedbackAttemptRef.current === lastScan.attemptId) return;
    lastFeedbackAttemptRef.current = lastScan.attemptId;
    play(lastScan.outcome);
    const label = {
      scanned: 'Scanned',
      already_scanned: 'Already Scanned',
      queued: 'Saved offline',
      not_scanned: 'Not Scanned',
    }[lastScan.outcome];
    const name = lastScan.participant?.display_name || lastScan.participant?.full_name;
    AccessibilityInfo.announceForAccessibility([label, name, lastScan.message]
      .filter(Boolean)
      .join('. '));
  }, [lastScan, play]);

  useEffect(() => {
    if (!lastScan || lastScan.outcome === 'confirming') return;
    const timer = setTimeout(hideLastScan, RESULT_PRIVACY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hideLastScan, lastScan]);

  const onBarcode = async (r: BarcodeScanningResult) => {
    recordScannerActivity();
    if (isProcessing) return;
    await handleScan(r.data, 'qr');
  };

  const onUnlocked = () => {
    setEscapeOpen(false);
    void stopScreenPinning();
    navigation.goBack();
  };

  if (!permission) {
    return <View style={styles.container} />;
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.permTitle}>Camera Access Required</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const prompt = !contextsReady
    ? 'Loading scan context'
    : !contextValid
      ? 'Scan context unavailable'
      : !isFeedbackReady
        ? 'Preparing scanner'
        : 'Scan your QR code';
  const event = state.currentEvent;

  return (
    <View
      style={[kiosk.screen, { backgroundColor: tokens.bg, paddingLeft: insets.left, paddingRight: insets.right }]}
      onTouchStart={recordScannerActivity}
    >
      {/* White type on the banner, whatever the system appearance. */}
      <StatusBar style="light" />
      <View style={[kiosk.banner, { paddingTop: insets.top + 64 }]}>
        {event ? <EventCover event={event} /> : null}
        <Text style={kiosk.eventName} numberOfLines={2}>{event?.name}</Text>
        {selectedContext ? <Text style={[type.body, kiosk.onBanner]}>{selectedContext.name}</Text> : null}
        <Pressable
          onPress={() => setEscapeOpen(true)}
          style={({ pressed }) => [kiosk.lock, { top: insets.top + 8 }, pressedStyle(pressed)]}
          android_ripple={ripple('rgba(255,255,255,0.3)', { borderless: true, radius: 24 })}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Exit kiosk mode"
          accessibilityHint={biometricUnlock ? 'Asks for the PIN or biometrics' : 'Asks for the PIN'}
        >
          <Icon name="lock-closed" size={20} color="#ffffff" />
        </Pressable>
      </View>

      <View style={[kiosk.body, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[type.h1, kiosk.center, { color: tokens.textH }]} accessibilityRole="header" accessibilityLiveRegion="polite">
          {prompt}
        </Text>
        <View style={[kiosk.camera, { width: scanSize, height: scanSize, borderRadius: radii.container }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing={facing}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={contextValid && !escapeOpen ? onBarcode : undefined}
          />
          <View style={kiosk.frame} pointerEvents="none">
            <View style={[styles.corner, kiosk.corner, styles.tl]} />
            <View style={[styles.corner, kiosk.corner, styles.tr]} />
            <View style={[styles.corner, kiosk.corner, styles.bl]} />
            <View style={[styles.corner, kiosk.corner, styles.br]} />
          </View>
        </View>
        <Button
          icon="camera-flip"
          title={facing === 'front' ? 'Front camera' : 'Rear camera'}
          accessibilityHint="Switches between the front and rear camera"
          onPress={() => setFacing(f => (f === 'front' ? 'back' : 'front'))}
        />
      </View>

      {lastScan ? <KioskResult result={lastScan} /> : null}

      <EscapeModal
        visible={escapeOpen}
        onClose={() => setEscapeOpen(false)}
        onUnlocked={onUnlocked}
        kioskPin={kioskPin}
        biometricUnlock={biometricUnlock}
      />
    </View>
  );
}

const kiosk = StyleSheet.create({
  screen: { flex: 1 },
  banner: { paddingHorizontal: 16, paddingBottom: 16, overflow: 'hidden' },
  eventName: { color: '#ffffff', fontSize: 30, lineHeight: 36, fontWeight: '700', paddingRight: 56 },
  onBanner: { color: '#ffffff' },
  lock: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,20,26,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 24, paddingTop: 24 },
  center: { textAlign: 'center' },
  camera: { overflow: 'hidden', backgroundColor: '#0b0b0f' },
  frame: { position: 'absolute', top: '14%', left: '14%', right: '14%', bottom: '14%' },
  corner: { borderColor: '#5be0b5' },
});

function KioskResult({ result }: { result: ScannerResult }) {
  const status = {
    confirming: { tint: colors.blue, icon: 'sync' as const, label: 'Confirming' },
    scanned: { tint: colors.green, icon: 'checkmark-circle' as const, label: 'Scanned' },
    already_scanned: { tint: colors.orange, icon: 'time' as const, label: 'Already Scanned' },
    // Not confirmed by Attend yet, so never success-coloured.
    queued: { tint: colors.gray[400], icon: 'cloud-offline' as const, label: 'Saved offline' },
    not_scanned: { tint: colors.redOnDark, icon: 'close-circle' as const, label: 'Not Scanned' },
  }[result.outcome];
  const name = result.participant?.display_name || result.participant?.full_name || '';

  return (
    <View style={styles.resultBackdrop} pointerEvents="box-none">
      <ScrollView
        style={styles.resultScroll}
        contentContainerStyle={styles.resultScrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.resultCard, { borderColor: status.tint }]}>
        <ParticipantAvatar participant={result.participant} size={76} />
        <View style={styles.resultCopy}>
          <View style={styles.resultStatusRow}>
            <Ionicons name={status.icon} size={22} color={status.tint} />
            <Text style={[styles.resultLabel, { color: status.tint }]}>{status.label}</Text>
          </View>
          {name ? <Text style={styles.resultName}>{name}</Text> : null}
          {result.message ? <Text style={styles.resultMessage}>{result.message}</Text> : null}
          <Text style={styles.resultReady}>
            {result.outcome === 'confirming' ? 'Hold steady' : 'Ready for next attendee'}
          </Text>
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

interface EscapeProps {
  visible: boolean;
  onClose: () => void;
  onUnlocked: () => void;
  kioskPin: string;
  biometricUnlock: boolean;
}

function EscapeModal({ visible, onClose, onUnlocked, kioskPin, biometricUnlock }: EscapeProps) {
  const [entry, setEntry] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const triedBiometricRef = useRef(false);

  const locked = lockedUntil !== null && now < lockedUntil;
  const remaining = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;

  useEffect(() => {
    if (!visible) {
      setEntry('');
      triedBiometricRef.current = false;
      return;
    }
    if (biometricUnlock && !triedBiometricRef.current && !locked) {
      triedBiometricRef.current = true;
      tryBiometric();
    } else {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [visible]);

  useEffect(() => {
    if (!lockedUntil) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [lockedUntil]);

  const tryBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Exit kiosk mode',
        fallbackLabel: 'Enter PIN',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
      });
      if (result.success) {
        haptics.success();
        onUnlocked();
      } else {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } catch {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleChange = (v: string) => {
    if (locked) return;
    const digits = v.replace(/\D/g, '').slice(0, PIN_LENGTH);
    setEntry(digits);
    if (digits.length === PIN_LENGTH) {
      if (digits === kioskPin) {
        haptics.success();
        onUnlocked();
      } else {
        haptics.error();
        const next = attempts + 1;
        setAttempts(next);
        setEntry('');
        if (next >= MAX_PIN_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_MS);
          setAttempts(0);
        }
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color={colors.gray[500]} />
          </TouchableOpacity>

          <View style={styles.modalIcon}>
            <Ionicons name="lock-closed" size={32} color={colors.red} />
          </View>
          <Text style={styles.modalTitle}>Exit Kiosk Mode</Text>
          <Text style={styles.modalSubtitle}>
            Enter your {PIN_LENGTH}-digit PIN to unlock.
          </Text>

          <Pressable
            onPress={() => !locked && inputRef.current?.focus()}
            style={styles.dotsRow}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < entry.length && styles.dotFilled,
                ]}
              />
            ))}
          </Pressable>

          <TextInput
            ref={inputRef}
            value={entry}
            onChangeText={handleChange}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={PIN_LENGTH}
            editable={!locked}
            style={styles.hiddenInput}
            caretHidden
            autoFocus
          />

          {locked ? (
            <Text style={styles.lockoutText}>
              Too many attempts. Try again in {remaining}s.
            </Text>
          ) : attempts > 0 ? (
            <Text style={styles.errText}>
              Wrong PIN — {MAX_PIN_ATTEMPTS - attempts} attempt
              {MAX_PIN_ATTEMPTS - attempts === 1 ? '' : 's'} left
            </Text>
          ) : (
            <View style={{ height: 18 }} />
          )}

          {biometricUnlock && !locked && (
            <TouchableOpacity style={styles.bioBtn} onPress={tryBiometric}>
              <Ionicons name="finger-print" size={20} color={colors.red} />
              <Text style={styles.bioBtnText}>Use biometrics</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permTitle: { color: colors.white, fontSize: 20, fontWeight: '700', marginBottom: 16 },
  permBtn: {
    backgroundColor: colors.red,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permBtnText: { color: colors.white, fontSize: 16, fontWeight: '600' },




  corner: { position: 'absolute', width: 48, height: 48, borderColor: colors.white },
  tl: { top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 6 },
  tr: { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 6 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 6 },
  br: { bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 6 },


  resultBackdrop: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 88,
  },
  resultCard: {
    width: '100%',
    maxWidth: 640,
    minHeight: 116,
    backgroundColor: 'rgba(15,23,42,0.97)',
    padding: 18,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  resultScroll: { width: '100%', maxWidth: 640, maxHeight: '55%' },
  resultScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  resultName: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
    color: colors.white,
  },
  resultCopy: { flex: 1, gap: 3 },
  resultStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  resultLabel: { fontSize: 17, fontWeight: '800' },
  resultMessage: { color: colors.gray[200], fontSize: 14, lineHeight: 19 },
  resultReady: { color: colors.gray[400], fontSize: 13, fontWeight: '600', marginTop: 3 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalClose: { position: 'absolute', top: 12, right: 12, padding: 4 },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(236,55,80,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text.primary },
  modalSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 6,
    marginBottom: 24,
    textAlign: 'center',
  },
  dotsRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.gray[300],
  },
  dotFilled: { backgroundColor: colors.red, borderColor: colors.red },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  errText: { color: colors.red, fontSize: 13, marginTop: 6, height: 18 },
  lockoutText: { color: colors.orange, fontSize: 13, marginTop: 6, height: 18 },
  bioBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(236,55,80,0.08)',
  },
  bioBtnText: { color: colors.red, fontSize: 15, fontWeight: '600' },
});
