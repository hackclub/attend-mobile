import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTabBarInset } from '../hooks/useTabBarInset';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScannerResultCard } from '../components/ScannerResultCard';
import { useApp } from '../context/AppContext';
import { useEventAccess } from '../hooks/useEventAccess';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useScanFeedback } from '../hooks/useScanFeedback';
import { useScanner } from '../hooks/useScanner';
import { useScannerPowerMode } from '../hooks/useScannerPowerMode';
import { useNFC } from '../hooks/useNFC';
import { useNfcAutoRead } from '../hooks/useNfcAutoRead';
import {
  Button,
  Icon,
  OverlayIconButton,
  PressableSurface,
  type IconName,
  type MenuAction,
} from '../components/ui';
import { ScanFrame, ScannerDock } from '../components/ScannerChrome';
import { scanFrameSize } from '../services/scannerLayout';
import { CHROME_MAX_FONT_SCALE } from '../components/ui/fontScale';
import { kioskSetupSheet, scanContextSheet, scannerSearchSheet } from '../navigation/sheetData';
import { useIsUnderSheet } from '../navigation/useIsUnderSheet';
import { useOpenSheet } from '../navigation/sheetPresenter';
import { api } from '../services/api';
import { haptics } from '../services/haptics';
import { computeEventStats } from '../services/eventStats';
import { participantAfterUndo } from '../services/scanUndo';
import { overlayTokens, radii, useTheme } from '../theme';
import type { Participant, AppStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

// How long the camera ignores codes after a sheet over it closes.
const SHEET_CLOSE_SCAN_COOLDOWN_MS = 400;

export function ScannerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const openSheet = useOpenSheet();
  const { state, updateParticipant } = useApp();
  const {
    handleScan,
    handleNFCScan,
    handleNfcToken,
    retryLastScan,
    clearLastScan,
    isProcessing,
    lastScan,
    hasEvent,
    scanContexts,
    selectedContextId,
    selectContext,
    isLoadingContexts,
    contextsReady,
    needsContext,
  } = useScanner();
  // Scanning itself works for every staff role; searching the roster and
  // opening a participant do not, so both entry points come and go with access.
  const { canViewParticipantRecords } = useEventAccess();
  const { isSupported: nfcSupported, isReading: nfcReading } = useNFC();
  const { isRegular } = useResponsiveLayout();
  const { width, height } = useWindowDimensions();
  // Zero once the native bar is laid out as a side rail — see useTabBarInset.
  const tabBarHeight = useTabBarInset();
  const { play, isReady: isFeedbackReady } = useScanFeedback();
  const [permission, requestPermission] = useCameraPermissions();
  const {
    isPowerModeEnabled,
    setPowerModeEnabled,
    recordScannerActivity,
  } = useScannerPowerMode(hasEvent && !!permission?.granted);
  const [torchOn, setTorchOn] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [undoing, setUndoing] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const lastFeedbackAttemptRef = useRef<string | null>(null);
  const { type, radii } = useTheme();

  const scanAreaSize = scanFrameSize(width, height, isRegular);
  const selectedContext = contextsReady
    ? scanContexts.find(context => context.id === selectedContextId)
    : undefined;
  const canScan = contextsReady && !needsContext;
  // A sheet (the context picker, search) leaves this screen on show, so the
  // camera stays mounted under it, paused: restarting it blanks the preview.
  // It unmounts on a tab switch or a full-screen route. (An iOS form sheet
  // blurs the screen; an Android bottom sheet is a window over a screen
  // that stays focused, hence `!sheetOpen` below as well as `isFocused`.)
  const { underSheet: sheetOpen, checkUnderSheet } = useIsUnderSheet();
  const cameraMounted = isFocused || sheetOpen;
  // Until staff choose a context the camera sends nothing: the scan frame is
  // covered with the reason instead of failing a scan they lined up.
  const cameraScanningEnabled = isFocused && !sheetOpen && canScan;
  // The camera always gets the same handler: toggling onBarcodeScanned makes
  // expo-camera rebuild its capture session, which blanks the preview every
  // time a sheet opens. Scans are gated here instead. A short cooldown after a
  // sheet closes stops the code that was in frame behind it from firing.
  const scanGateRef = useRef(false);
  const scanCooldownUntilRef = useRef(0);
  const wasSheetOpenRef = useRef(sheetOpen);
  useLayoutEffect(() => {
    if (wasSheetOpenRef.current && !sheetOpen) {
      scanCooldownUntilRef.current = Date.now() + SHEET_CLOSE_SCAN_COOLDOWN_MS;
    }
    wasSheetOpenRef.current = sheetOpen;
    scanGateRef.current = cameraScanningEnabled;
  }, [cameraScanningEnabled, sheetOpen]);
  const scannerStatus = isProcessing
    ? 'Confirming scan'
    : !contextsReady
      ? isLoadingContexts ? 'Loading contexts' : 'Contexts unavailable'
      : needsContext
        ? 'Choose a context'
        : !isFeedbackReady
          ? 'Preparing feedback'
          : 'Ready to scan';

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
        // The torch never outlives the screen that turned it on, though it
        // stays on under a sheet, like the camera.
        if (!checkUnderSheet()) setTorchOn(false);
      };
    }, [checkUnderSheet])
  );

  // Android reads NFC badges while the scanner is open, under the camera's
  // conditions: not behind the context picker or search.
  // Unlike the camera it stays on before a context is chosen, so a tap
  // explains that one is needed. iOS needs the NFC button's system sheet.
  useNfcAutoRead({
    enabled: isFocused && !sheetOpen && hasEvent && contextsReady,
    onToken: (token, isBadge) => {
      recordScannerActivity();
      void handleNfcToken(token, isBadge);
    },
  });

  // "85 of 129" for the result card, from the synced roster.
  const contextProgress = useMemo(() => {
    const contextId = lastScan?.scanContext?.id;
    if (!contextId) return null;
    const progress = computeEventStats(state.participants, scanContexts)
      .contexts.find(context => context.id === contextId);
    return progress && progress.total > 0 ? `${progress.scanned} of ${progress.total}` : null;
  }, [lastScan?.scanContext?.id, scanContexts, state.participants]);

  useEffect(() => {
    if (!lastScan || lastScan.outcome === 'confirming') return;
    if (lastFeedbackAttemptRef.current === lastScan.attemptId) return;
    lastFeedbackAttemptRef.current = lastScan.attemptId;
    play(lastScan.outcome);
  }, [lastScan, play]);

  const handleBarcodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    recordScannerActivity();
    if (isProcessing) return;
    await handleScan(result.data, 'qr');
  }, [handleScan, isProcessing, recordScannerActivity]);
  const barcodeHandlerRef = useRef(handleBarcodeScanned);
  useLayoutEffect(() => {
    barcodeHandlerRef.current = handleBarcodeScanned;
  }, [handleBarcodeScanned]);
  const onBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (!scanGateRef.current || Date.now() < scanCooldownUntilRef.current) return;
    void barcodeHandlerRef.current(result);
  }, []);

  // The search sheet scans a typed/pasted attendee ID or a roster match in
  // this screen's context; its result shows here, over the camera.
  const scanFromSheet = useCallback(async (identifier: string | undefined) => {
    const trimmed = identifier?.trim();
    if (!trimmed || isProcessing) return;
    recordScannerActivity();
    if (!canScan) return;
    await handleScan(trimmed, 'manual');
  }, [canScan, handleScan, isProcessing, recordScannerActivity]);

  const claimSearchSheet = scannerSearchSheet.useOpener({
    canSearchRoster: canViewParticipantRecords,
    needsContext,
    isProcessing,
    onScanId: scanFromSheet,
    onScanParticipant: (participant: Participant) =>
      scanFromSheet(participant.participant_event_id || participant.participant_id),
    onActivity: recordScannerActivity,
  });
  const openSearch = useCallback(() => {
    recordScannerActivity();
    claimSearchSheet();
    openSheet('ScannerSearchSheet');
  }, [claimSearchSheet, openSheet, recordScannerActivity]);

  const claimContextSheet = scanContextSheet.useOpener({
    title: 'Scan context',
    eventName: state.currentEvent?.name,
    contexts: scanContexts,
    selectedId: selectedContextId,
    onSelect: (context) => {
      recordScannerActivity();
      selectContext(context.id);
    },
  });
  const openContextPicker = useCallback(() => {
    recordScannerActivity();
    claimContextSheet();
    openSheet('ScanContextSheet');
  }, [claimContextSheet, openSheet, recordScannerActivity]);

  const claimKioskSetup = kioskSetupSheet.useOpener(
    useMemo(
      () => ({ scanContextId: selectedContext?.id, scanContextName: selectedContext?.name }),
      [selectedContext?.id, selectedContext?.name]
    )
  );

  const viewDetails = useCallback(() => {
    if (!lastScan?.participant) return;
    recordScannerActivity();
    // The detail screen is behind the biometric gate.
    navigation.navigate('ParticipantDetail', { participant: lastScan.participant });
  }, [lastScan, navigation, recordScannerActivity]);

  // Removes the scan just made in its context (DELETE /scans), as the
  // participant page's undo does.
  const undoScan = useCallback(async () => {
    const participant = lastScan?.participant;
    const eventId = state.currentEvent?.id;
    if (!participant || !eventId || undoing) return;
    recordScannerActivity();
    setUndoing(true);
    try {
      const contextId = lastScan.scanContext?.id;
      await api.undoCheckIn(eventId, participant.participant_event_id, contextId);
      updateParticipant(participantAfterUndo(participant, contextId));
      haptics.success();
      clearLastScan();
    } catch {
      haptics.error();
      Alert.alert('Error', 'Failed to undo check-in');
    } finally {
      setUndoing(false);
    }
  }, [clearLastScan, lastScan, recordScannerActivity, state.currentEvent?.id, undoing, updateParticipant]);

  if (!permission) {
    return <CenteredState icon="camera" title="Starting camera" loading />;
  }

  if (!permission.granted) {
    return (
      <CenteredState
        icon="camera"
        title="Camera access required"
        message="Attend needs camera access to scan attendee QR codes."
        actionLabel="Allow camera"
        onAction={requestPermission}
      />
    );
  }

  if (!hasEvent) {
    return (
      <CenteredState
        icon="calendar"
        title="No event selected"
        message="Choose an event on the Overview tab before scanning."
      />
    );
  }

  const menuActions: MenuAction[] = [
    {
      key: 'power-mode',
      title: 'Power mode',
      checked: isPowerModeEnabled,
      onSelect: () => {
        recordScannerActivity();
        setPowerModeEnabled(!isPowerModeEnabled);
      },
    },
    {
      key: 'kiosk',
      title: 'Kiosk mode',
      iosIcon: 'lock',
      disabled: !canScan,
      onSelect: () => {
        recordScannerActivity();
        claimKioskSetup();
        openSheet('KioskSetupSheet');
      },
    },
  ];

  const contextLabel = selectedContext?.name
    ?? (isLoadingContexts && scanContexts.length === 0 ? 'Loading contexts' : 'Choose a context');
  // Room under the card for the dock: its row (44) + gap (12).
  const dockHeight = 44 + 12;

  return (
    <View style={styles.container} onTouchStart={recordScannerActivity}>
      {/* The camera stage is always dark, whatever the system appearance. */}
      {isFocused ? <StatusBar style="light" /> : null}
      {cameraMounted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing={facing}
          enableTorch={torchOn && facing === 'back'}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onBarcodeScanned}
        />
      ) : null}

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom', 'left', 'right']}>
        <View style={scan.header}>
          <PressableSurface
            style={[scan.pill, scan.contextPill]}
            contentStyle={scan.pillContent}
            rippleColor={overlayTokens.on}
            rippleAlpha={0.2}
            onPress={openContextPicker}
            disabled={scanContexts.length === 0}
            accessibilityRole="button"
            accessibilityLabel={`Scan context: ${selectedContext?.name ?? 'not chosen'}. Change`}
            accessibilityHint={selectedContext ? undefined : 'Choose a context before scanning'}
          >
            <Text style={[type.body, scan.pillMuted]} numberOfLines={1}>{state.currentEvent?.name}</Text>
            <Icon name="chevron-right" size={14} color={overlayTokens.onMuted} />
            <Text style={[type.label, scan.pillStrong, !selectedContext && scan.pillWarning]} numberOfLines={1}>
              {contextLabel}
            </Text>
            {scanContexts.length > 0 ? <Icon name="chevron-down" size={16} color={overlayTokens.on} /> : null}
          </PressableSurface>
        </View>

        {/* Power mode is a setting, not a control that's on, so it shows as
            a quiet note under the header rather than lighting up the menu. */}
        {isPowerModeEnabled ? (
          <View style={scan.powerNote} accessible accessibilityLabel="Power mode on">
            <Icon name="bolt" size={14} color={overlayTokens.active} />
            <Text style={[type.small, scan.pillStrong]} maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}>
              Power mode
            </Text>
          </View>
        ) : null}

        <View style={styles.scanStage}>
          {/* Until a context is chosen the reason takes the frame's place. */}
          <ScanFrame
            size={scanAreaSize}
            corners={!needsContext}
            processing={isProcessing}
            accessibilityLabel={`QR code scanning area. ${scannerStatus}`}
          />

          {needsContext ? (
            <View style={styles.contextRequired} pointerEvents="none">
              <View style={[styles.contextRequiredCard, { borderRadius: radii.container }]}>
                <Icon name="location" size={24} color={overlayTokens.active} />
                <Text style={[type.h3, styles.onCamera, styles.centerText]}>
                  Choose a context to start scanning
                </Text>
                <Text style={[type.body, styles.onCameraMuted, styles.centerText]}>
                  {"Pick where you're scanning people in from the context picker at the top."}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={[scan.dock, { paddingBottom: 12 + tabBarHeight }]}>
          {lastScan ? (
            <View
              // Anchored above the dock row; a percentage bottom misresolves
              // once the dock has dynamic padding, so compute it explicitly.
              style={[styles.resultCardOverlay, { bottom: dockHeight + tabBarHeight + 10 }]}
              pointerEvents="box-none"
            >
              <ScrollView
                style={[
                  styles.resultCardScroll,
                  { maxHeight: Math.max(200, Math.min(height * 0.5, 480)) },
                ]}
                bounces={false}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <ScannerResultCard
                  result={lastScan}
                  progress={contextProgress}
                  onDetails={canViewParticipantRecords ? viewDetails : undefined}
                  onUndo={undoScan}
                  undoing={undoing}
                  onClear={clearLastScan}
                  onRetry={() => {
                    recordScannerActivity();
                    void retryLastScan();
                  }}
                />
              </ScrollView>
            </View>
          ) : null}

          <ScannerDock
            torchOn={torchOn}
            onTorch={() => {
              recordScannerActivity();
              setTorchOn(on => !on);
            }}
            facing={facing}
            onFlipCamera={() => {
              recordScannerActivity();
              // The front camera has no torch; it's off when you come back.
              setTorchOn(false);
              setFacing(f => (f === 'back' ? 'front' : 'back'));
            }}
            menuActions={menuActions}
            searchTitle={canViewParticipantRecords ? 'Search' : 'Enter ID'}
            searchDisabled={!contextsReady}
            onSearch={openSearch}
            trailing={nfcSupported && Platform.OS === 'ios' ? (
              <OverlayIconButton
                surface="camera"
                icon="nfc"
                accessibilityLabel={nfcReading ? 'Reading NFC' : 'Scan NFC badge'}
                disabled={isProcessing || nfcReading || !contextsReady}
                onPress={() => {
                  recordScannerActivity();
                  void handleNFCScan();
                }}
              />
            ) : null}
          />
        </View>

      </SafeAreaView>

    </View>
  );
}

const scan = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  pill: { height: 44, borderRadius: radii.pill, backgroundColor: overlayTokens.cameraControl },
  pillContent: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  contextPill: { flexShrink: 1 },
  pillMuted: { color: overlayTokens.onMuted, flexShrink: 1 },
  pillStrong: { color: overlayTokens.on, flexShrink: 1 },
  pillWarning: { color: overlayTokens.active },
  powerNote: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    marginRight: 16,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: overlayTokens.cameraControl,
  },
  dock: { paddingHorizontal: 10 },
});

/** Before the camera can run: no permission yet, or no event. */
function CenteredState({
  icon,
  title,
  message,
  loading,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message?: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { tokens, type } = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: tokens.bg }]}>
      <View style={styles.centered}>
        <View style={[styles.stateIcon, { backgroundColor: tokens.tint.grey.bg }]}>
          {loading ? (
            <ActivityIndicator color={tokens.tint.grey.fg} />
          ) : (
            <Icon name={icon} size={28} color={tokens.tint.grey.fg} />
          )}
        </View>
        <Text style={[type.h2, styles.centerText, { color: tokens.textH }]} accessibilityRole="header">
          {title}
        </Text>
        {message ? (
          <Text style={[type.body, styles.centerText, styles.stateMessage, { color: tokens.text2 }]}>
            {message}
          </Text>
        ) : null}
        {actionLabel && onAction ? (
          <Button variant="primary" title={actionLabel} onPress={onAction} style={styles.stateAction} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: { flex: 1, backgroundColor: overlayTokens.cameraStage },
  overlay: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  centerText: { textAlign: 'center' },
  stateIcon: { width: 56, height: 56, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  stateMessage: { maxWidth: 360 },
  // Buttons sit at the start of their row by default; this one is centred.
  stateAction: { marginTop: 16, alignSelf: 'center' },
  onCamera: { color: overlayTokens.on },
  onCameraMuted: { color: overlayTokens.onMuted },
  scanStage: { flex: 1, minHeight: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12 },
  contextRequired: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  contextRequiredCard: { alignItems: 'center', gap: 6, padding: 20, maxWidth: 360, backgroundColor: overlayTokens.cameraControl },
  // Anchored above the dock, outside layout flow, so the scan frame never shifts
  resultCardOverlay: { position: 'absolute', left: 14, right: 14 },
  resultCardScroll: { width: '100%', maxWidth: 620, alignSelf: 'center' },
});
