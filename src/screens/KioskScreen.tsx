import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  BackHandler,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BannerBlend, EventCover } from '../components/EventBanner';
import { Button, Icon, OverlayIconButton } from '../components/ui';
import { overlayTokens, radii, typography, useTheme } from '../theme';
import { KioskWelcome, type WelcomeOrigin } from '../components/KioskWelcome';
import { useScanFeedback } from '../hooks/useScanFeedback';
import { useScanner } from '../hooks/useScanner';
import { useScannerPowerMode } from '../hooks/useScannerPowerMode';
import { useApp } from '../context/AppContext';
import type { AppStackParamList } from '../types';
import { startScreenPinning, stopScreenPinning } from '../../modules/activity-controller/src';
import { holdKioskLock } from '../navigation/kioskLock';
import { kioskUnlockSheet } from '../navigation/sheetData';
import { useOpenSheet } from '../navigation/sheetPresenter';
import { useIsUnderSheet } from '../navigation/useIsUnderSheet';

type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'Kiosk'>;
type KioskRoute = RouteProp<AppStackParamList, 'Kiosk'>;

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
    facing = 'front',
    pinScreen = true,
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
    lastScan,
    hideLastScan,
    scanContexts,
    selectedContextId,
    contextsReady,
  } = useScanner({ lockedContextId: scanContextId });
  const { play, isReady: isFeedbackReady } = useScanFeedback();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<React.ComponentRef<typeof View>>(null);
  const [cameraRect, setCameraRect] = useState<WelcomeOrigin | null>(null);
  const { recordScannerActivity } = useScannerPowerMode(!!permission?.granted);
  // Scanning pauses while the exit drawer is open.
  const { underSheet } = useIsUnderSheet();
  const openSheet = useOpenSheet();
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const lastFeedbackAttemptRef = useRef<string | null>(null);

  const selectedContext = scanContexts.find(c => c.id === selectedContextId);
  const contextValid = contextsReady
    && (scanContexts.length === 0 || !!selectedContext);

  // Deep links, push taps, Live Activity taps and shortcuts are ignored for
  // as long as the kiosk is mounted (see navigation/kioskLock).
  useEffect(() => holdKioskLock(), []);

  // Disable back gesture / hardware back while in kiosk.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [])
  );

  // Android pins the screen while kiosk mode runs, unless turned off in kiosk
  // setup (the system asks to confirm), so the device can't leave Attend;
  // exiting through the PIN or biometrics unpins it. iOS relies on Guided
  // Access, suggested in kiosk setup.
  // Only once the camera is allowed: pinned on the permission prompt, the
  // kiosk couldn't scan and the device couldn't get to Settings either.
  const cameraGranted = !!permission?.granted;
  useEffect(() => {
    if (!cameraGranted || !pinScreen) return;
    void startScreenPinning();
    return () => {
      void stopScreenPinning();
    };
  }, [cameraGranted, pinScreen]);

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
    // useScanner ignores frames while a scan is running, but still needs to
    // see them to know the code is still in front of the camera.
    await handleScan(r.data, 'qr');
  };

  const onUnlocked = () => {
    void stopScreenPinning();
    navigation.goBack();
  };

  // A wrong PIN counts against the kiosk, not the drawer, so closing and
  // reopening it doesn't reset the attempts or the lockout.
  const checkPin = (entered: string) => {
    if (lockedUntil !== null && Date.now() < lockedUntil) return false;
    if (entered === kioskPin) return true;
    const next = attempts + 1;
    if (next >= MAX_PIN_ATTEMPTS) {
      setLockedUntil(Date.now() + LOCKOUT_MS);
      setAttempts(0);
    } else {
      setAttempts(next);
    }
    return false;
  };
  const claimUnlock = kioskUnlockSheet.useOpener({
    biometricUnlock,
    lockedUntil,
    attemptsLeft: MAX_PIN_ATTEMPTS - attempts,
    checkPin,
    onUnlocked,
  });
  const openUnlock = () => {
    claimUnlock();
    openSheet('KioskUnlockSheet');
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
          onPress={openUnlock}
          style={kiosk.centred}
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
        {/* Fades into the page in dark mode, as the Overview's banner does. */}
        <BannerBlend into={tokens.bg} height={KIOSK_BLEND_HEIGHT} />
        <Text style={kiosk.eventName} numberOfLines={2}>{event?.name}</Text>
        {selectedContext ? <Text style={[type.body, kiosk.onBanner]}>{selectedContext.name}</Text> : null}
        <OverlayIconButton
          icon="lock-closed"
          accessibilityLabel="Exit kiosk mode"
          accessibilityHint={biometricUnlock ? 'Asks for the PIN or biometrics' : 'Asks for the PIN'}
          onPress={openUnlock}
          hitSlop={8}
          style={[kiosk.lock, { top: insets.top + 8 }]}
        />
      </View>

      <View style={[kiosk.body, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[type.h1, kiosk.center, { color: tokens.textH }]} accessibilityRole="header" accessibilityLiveRegion="polite">
          {prompt}
        </Text>
        <View
          ref={cameraRef}
          style={[kiosk.camera, { width: scanSize, height: scanSize }]}
          // Where a scan's result blooms from.
          onLayout={() =>
            cameraRef.current?.measureInWindow((x, y, w, h) => setCameraRect({ x, y, width: w, height: h }))
          }
        >
          <CameraView
            style={StyleSheet.absoluteFill}
            facing={facing}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={contextValid && !underSheet ? onBarcode : undefined}
          />
          <View style={kiosk.frame} pointerEvents="none">
            <View style={[kiosk.corner, kiosk.tl]} />
            <View style={[kiosk.corner, kiosk.tr]} />
            <View style={[kiosk.corner, kiosk.bl]} />
            <View style={[kiosk.corner, kiosk.br]} />
          </View>
        </View>
      </View>

      <KioskWelcome result={lastScan} origin={cameraRect} />
    </View>
  );
}

const BANNER_HEIGHT = 150;
// Shorter than a full banner's: this one is only about 150 tall.
const KIOSK_BLEND_HEIGHT = 80;
const CAMERA_RADIUS = radii.container;
const FRAME = { inset: '14%', size: 44, thickness: 6, radius: 20 } as const;

const kiosk = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  stateIcon: { width: 56, height: 56, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  // Buttons sit at the start of their row by default; these are centred.
  stateAction: { marginTop: 16, alignSelf: 'center' },
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
  centred: { alignSelf: 'center' },
  camera: { overflow: 'hidden', borderRadius: CAMERA_RADIUS, backgroundColor: overlayTokens.cameraStage },
  frame: { position: 'absolute', top: FRAME.inset, left: FRAME.inset, right: FRAME.inset, bottom: FRAME.inset },
  corner: { position: 'absolute', width: FRAME.size, height: FRAME.size, borderColor: overlayTokens.kioskFrame },
  tl: { top: 0, left: 0, borderTopWidth: FRAME.thickness, borderLeftWidth: FRAME.thickness, borderTopLeftRadius: FRAME.radius },
  tr: { top: 0, right: 0, borderTopWidth: FRAME.thickness, borderRightWidth: FRAME.thickness, borderTopRightRadius: FRAME.radius },
  bl: { bottom: 0, left: 0, borderBottomWidth: FRAME.thickness, borderLeftWidth: FRAME.thickness, borderBottomLeftRadius: FRAME.radius },
  br: { bottom: 0, right: 0, borderBottomWidth: FRAME.thickness, borderRightWidth: FRAME.thickness, borderBottomRightRadius: FRAME.radius },
});


