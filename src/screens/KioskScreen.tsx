import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Modal,
  Pressable,
  BackHandler,
  AccessibilityInfo,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as LocalAuthentication from 'expo-local-authentication';
import { haptics } from '../services/haptics';
import { EventCover } from '../components/EventBanner';
import { Button, Icon, OverlayIconButton, StatusGlyph, type StatusType } from '../components/ui';
import { overlayTokens, radii, typography, useTheme, type ThemeTokens } from '../theme';
import { ParticipantAvatar } from '../components/ParticipantAvatar';
import { useScanFeedback } from '../hooks/useScanFeedback';
import { useScanner } from '../hooks/useScanner';
import { useScannerPowerMode } from '../hooks/useScannerPowerMode';
import { useApp } from '../context/AppContext';
import type { ScannerResult } from '../services/scannerCore';
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
  const { tokens, type } = useTheme();
  // Read from the provider rather than a native SafeAreaView: presented as a
  // full-screen modal, the native view under-reported the top inset on
  // iPhone and the header ran into the Dynamic Island.
  const insets = useSafeAreaInsets();
  // Measured per render, not once at import: the scene resizes under us every
  // time iPhone Duo is folded, unfolded or rotated.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // About 280 on a phone, more on a tablet.
  const scanSize = Math.min(windowWidth - 48, windowHeight * 0.42, windowWidth >= 600 ? 420 : 280);
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
  // Only once the camera is allowed: pinned on the permission prompt, the
  // kiosk couldn't scan and the device couldn't get to Settings either.
  const cameraGranted = !!permission?.granted;
  useEffect(() => {
    if (!cameraGranted) return;
    void startScreenPinning();
    return () => {
      void stopScreenPinning();
    };
  }, [cameraGranted]);

  useEffect(() => {
    if (!lastScan || lastScan.outcome === 'confirming') return;
    if (lastFeedbackAttemptRef.current === lastScan.attemptId) return;
    lastFeedbackAttemptRef.current = lastScan.attemptId;
    play(lastScan.outcome);
    const label = {
      scanned: 'Scanned',
      already_scanned: 'Already scanned',
      queued: 'Saved offline',
      not_scanned: 'Not scanned',
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
    return <View style={[kiosk.screen, { backgroundColor: tokens.bg }]} />;
  }
  if (!permission.granted) {
    return (
      <View
        style={[
          kiosk.screen,
          kiosk.centered,
          { backgroundColor: tokens.bg, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={[kiosk.stateIcon, { backgroundColor: tokens.tint.grey.bg }]}>
          <Icon name="camera" size={28} color={tokens.tint.grey.fg} />
        </View>
        <Text style={[type.h2, kiosk.center, { color: tokens.textH }]} accessibilityRole="header">
          Camera access required
        </Text>
        <Text style={[type.body, kiosk.center, { color: tokens.text2 }]}>
          Attend needs camera access to scan attendee QR codes.
        </Text>
        <Button variant="primary" title="Allow camera" onPress={requestPermission} style={kiosk.stateAction} />
        {/* Without the camera there's nothing to pin the screen for. */}
        <Button
          variant="link"
          icon="lock-closed"
          title="Exit kiosk mode"
          onPress={() => setEscapeOpen(true)}
        />
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
      <View
        style={[
          kiosk.banner,
          { minHeight: Math.max(BANNER_HEIGHT, insets.top + 96), paddingTop: insets.top + 8 },
        ]}
      >
        {event ? <EventCover event={event} /> : null}
        <Text style={kiosk.eventName} numberOfLines={2}>{event?.name}</Text>
        {selectedContext ? <Text style={[type.body, kiosk.onBanner]}>{selectedContext.name}</Text> : null}
        <OverlayIconButton
          icon="lock-closed"
          accessibilityLabel="Exit kiosk mode"
          accessibilityHint={biometricUnlock ? 'Asks for the PIN or biometrics' : 'Asks for the PIN'}
          onPress={() => setEscapeOpen(true)}
          hitSlop={8}
          style={[kiosk.lock, { top: insets.top + 8 }]}
        />
      </View>

      <View style={[kiosk.body, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[type.h1, kiosk.center, { color: tokens.textH }]} accessibilityRole="header" accessibilityLiveRegion="polite">
          {prompt}
        </Text>
        <View style={[kiosk.camera, { width: scanSize, height: scanSize }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing={facing}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={contextValid && !escapeOpen ? onBarcode : undefined}
          />
          <View style={kiosk.frame} pointerEvents="none">
            <View style={[kiosk.corner, kiosk.tl]} />
            <View style={[kiosk.corner, kiosk.tr]} />
            <View style={[kiosk.corner, kiosk.bl]} />
            <View style={[kiosk.corner, kiosk.br]} />
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

const BANNER_HEIGHT = 150;
const CAMERA_RADIUS = 20;
const FRAME = { inset: '14%', size: 44, thickness: 6, radius: 20 } as const;

const kiosk = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  stateIcon: { width: 56, height: 56, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  stateAction: { marginTop: 16 },
  // Name and context pinned to the bottom, so the photo shows above them.
  banner: { paddingHorizontal: 16, paddingBottom: 16, overflow: 'hidden', justifyContent: 'flex-end' },
  // Display type, a step up from h1, as on the event banner.
  eventName: {
    ...typography.h1,
    fontSize: typography.h1.fontSize * 1.25,
    lineHeight: typography.h1.lineHeight * 1.2,
    color: overlayTokens.on,
    paddingRight: 56,
  },
  onBanner: { color: overlayTokens.on },
  lock: { position: 'absolute', right: 16 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 24, paddingTop: 24 },
  center: { textAlign: 'center' },
  camera: { overflow: 'hidden', borderRadius: CAMERA_RADIUS, backgroundColor: overlayTokens.cameraStage },
  frame: { position: 'absolute', top: FRAME.inset, left: FRAME.inset, right: FRAME.inset, bottom: FRAME.inset },
  corner: { position: 'absolute', width: FRAME.size, height: FRAME.size, borderColor: overlayTokens.kioskFrame },
  tl: { top: 0, left: 0, borderTopWidth: FRAME.thickness, borderLeftWidth: FRAME.thickness, borderTopLeftRadius: FRAME.radius },
  tr: { top: 0, right: 0, borderTopWidth: FRAME.thickness, borderRightWidth: FRAME.thickness, borderTopRightRadius: FRAME.radius },
  bl: { bottom: 0, left: 0, borderBottomWidth: FRAME.thickness, borderLeftWidth: FRAME.thickness, borderBottomLeftRadius: FRAME.radius },
  br: { bottom: 0, right: 0, borderBottomWidth: FRAME.thickness, borderRightWidth: FRAME.thickness, borderBottomRightRadius: FRAME.radius },
});

const RESULT: Record<ScannerResult['outcome'], { status: StatusType; label: string }> = {
  confirming: { status: 'in-progress', label: 'Confirming' },
  scanned: { status: 'success', label: 'Scanned' },
  already_scanned: { status: 'warning', label: 'Already scanned' },
  // Not confirmed by Attend yet, so never success-coloured.
  queued: { status: 'pending', label: 'Saved offline' },
  not_scanned: { status: 'error', label: 'Not scanned' },
};

function resultColor(status: StatusType, tokens: ThemeTokens): string {
  switch (status) {
    case 'success': return tokens.success;
    case 'warning': return tokens.warning;
    case 'error': return tokens.error;
    case 'in-progress': return tokens.info;
    default: return tokens.inactive;
  }
}

function KioskResult({ result }: { result: ScannerResult }) {
  const { tokens, type, radii, shadowOpacity, elevation } = useTheme();
  const status = RESULT[result.outcome];
  const tint = resultColor(status.status, tokens);
  const name = result.participant?.display_name || result.participant?.full_name || '';

  return (
    <View style={styles.resultBackdrop} pointerEvents="box-none">
      <ScrollView
        style={styles.resultScroll}
        contentContainerStyle={styles.resultScrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.resultCard,
            {
              backgroundColor: tokens.bg,
              borderColor: tint,
              borderRadius: radii.container,
              shadowOpacity: shadowOpacity * 2,
              elevation,
            },
          ]}
        >
          <ParticipantAvatar participant={result.participant} size={64} />
          <View style={styles.resultCopy}>
            <View style={styles.resultStatusRow}>
              <StatusGlyph type={status.status} color={tint} size={20} />
              <Text style={[type.h3, { color: tint }]}>{status.label}</Text>
            </View>
            {name ? <Text style={[type.h1, { color: tokens.textH }]}>{name}</Text> : null}
            {result.message ? <Text style={[type.body, { color: tokens.text2 }]}>{result.message}</Text> : null}
            <Text style={[type.small, styles.resultReady, { color: tokens.muted }]}>
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
  const { tokens, type, radii, isDark } = useTheme();
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
      <View style={[styles.modalBackdrop, { backgroundColor: tokens.overlay }]}>
        <View style={[styles.modalCard, { backgroundColor: tokens.bg, borderRadius: radii.container }]}>
          <Button
            variant="plain-icon"
            icon="close"
            title="Close"
            onPress={onClose}
            style={styles.modalClose}
          />

          <View style={[styles.modalIcon, { backgroundColor: tokens.tint.red.bg }]}>
            <Icon name="lock-closed" size={28} color={tokens.tint.red.fg} />
          </View>
          <Text style={[type.h2, { color: tokens.textH }]} accessibilityRole="header">Exit kiosk mode</Text>
          <Text style={[type.body, styles.modalSubtitle, { color: tokens.text2 }]}>
            Enter your {PIN_LENGTH}-digit PIN to unlock.
          </Text>

          <Pressable
            onPress={() => !locked && inputRef.current?.focus()}
            style={styles.dotsRow}
            accessibilityRole="button"
            accessibilityLabel={`PIN, ${entry.length} of ${PIN_LENGTH} digits entered`}
            accessibilityHint="Opens the keypad"
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { borderColor: tokens.input },
                  i < entry.length && { backgroundColor: tokens.accent, borderColor: tokens.accent },
                ]}
              />
            ))}
          </Pressable>

          <TextInput
            ref={inputRef}
            value={entry}
            onChangeText={handleChange}
            keyboardType="number-pad"
            keyboardAppearance={isDark ? 'dark' : 'light'}
            secureTextEntry
            maxLength={PIN_LENGTH}
            editable={!locked}
            style={styles.hiddenInput}
            caretHidden
            autoFocus
          />

          <Text
            style={[type.body, styles.feedback, { color: locked ? tokens.warning : tokens.error }]}
            accessibilityLiveRegion="polite"
          >
            {locked
              ? `Too many attempts. Try again in ${remaining}s.`
              : attempts > 0
                ? `Wrong PIN — ${MAX_PIN_ATTEMPTS - attempts} attempt${MAX_PIN_ATTEMPTS - attempts === 1 ? '' : 's'} left`
                : ''}
          </Text>

          {biometricUnlock && !locked ? (
            <Button icon="finger-print" title="Use biometrics" onPress={tryBiometric} style={styles.bioBtn} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 2,
    shadowColor: overlayTokens.ink,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  resultScroll: { width: '100%', maxWidth: 640, maxHeight: '55%' },
  resultScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  resultCopy: { flex: 1, gap: 4 },
  resultStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultReady: { marginTop: 2 },

  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    padding: 24,
    paddingTop: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalClose: { position: 'absolute', top: 4, right: 4 },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalSubtitle: { marginTop: 4, marginBottom: 20, textAlign: 'center' },
  // 44pt tall, so the whole row is an easy target for the keypad.
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 44, paddingHorizontal: 8 },
  dot: { width: 16, height: 16, borderRadius: radii.pill, borderWidth: 2 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  // Reserves its line so the card doesn't jump when a message appears.
  feedback: { minHeight: 20, marginTop: 8, textAlign: 'center' },
  bioBtn: { marginTop: 12 },
});
