import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTabBarInset } from '../hooks/useTabBarInset';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ScannerResultCard } from '../components/ScannerResultCard';
import { useApp } from '../context/AppContext';
import { useEventAccess } from '../hooks/useEventAccess';
import { useParticipants } from '../hooks/useParticipants';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useScanFeedback } from '../hooks/useScanFeedback';
import { useScanner } from '../hooks/useScanner';
import { useScannerPowerMode } from '../hooks/useScannerPowerMode';
import { useNFC } from '../hooks/useNFC';
import { useNfcAutoRead } from '../hooks/useNfcAutoRead';
import {
  BottomSheet,
  Button,
  Icon,
  ListRow,
  PressableSurface,
  Toggle,
  pressedStyle,
  ripple,
  type IconName,
} from '../components/ui';
import { api } from '../services/api';
import { computeEventStats } from '../services/eventStats';
import { participantAfterUndo } from '../services/scanUndo';
import { useTheme } from '../theme';
import { colors } from '../theme/colors';
import type { Participant, AppStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;
type ManualEntryMode = 'none' | 'search';

// How long the camera ignores codes after a sheet over it closes.
const SHEET_CLOSE_SCAN_COOLDOWN_MS = 400;

// A query that reads as an attendee/participant-event ID rather than a name or
// email: one unbroken run of hex/dash characters (UUIDs) or 8+ alphanumerics.
function looksLikeAttendeeId(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.includes('@') || /\s/.test(trimmed)) return false;
  return /^[0-9a-fA-F-]{16,}$/.test(trimmed) || /^[A-Za-z0-9_-]{8,}$/.test(trimmed);
}

export function ScannerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { state, updateParticipant } = useApp();
  const { tokens } = useTheme();
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
  const { search, clearSearch, searchResults, isSearching } = useParticipants();
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
  const [manualEntryMode, setManualEntryMode] = useState<ManualEntryMode>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const lastFeedbackAttemptRef = useRef<string | null>(null);
  const scanAreaRef = useRef<React.ComponentRef<typeof View>>(null);
  // Window-space rect of the scan frame, so the scrim cutout can track it.
  const [scanFrameRect, setScanFrameRect] = useState<{
    x: number; y: number; width: number; height: number;
  } | null>(null);

  const scanAreaSize = Math.min(width * 0.6, height * 0.32, isRegular ? 380 : 260);
  const selectedContext = contextsReady
    ? scanContexts.find(context => context.id === selectedContextId)
    : undefined;
  const canScan = contextsReady && !needsContext;
  // Until staff choose a context the camera sends nothing: the scan frame is
  // covered with the reason instead of failing a scan they lined up.
  const sheetOpen = manualEntryMode !== 'none' || contextPickerOpen || moreOpen;
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
        // The torch never outlives the screen that turned it on.
        setTorchOn(false);
      };
    }, [])
  );

  // Android reads NFC badges while the scanner is open, under the camera's
  // conditions: not behind the context picker, the More sheet or manual
  // entry. Unlike the camera it stays on before a context is chosen, so a
  // tap explains that one is needed. iOS needs the NFC button's system sheet.
  useNfcAutoRead({
    enabled: isFocused
      && hasEvent
      && contextsReady
      && manualEntryMode === 'none'
      && !contextPickerOpen
      && !moreOpen,
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

  const measureScanArea = useCallback(() => {
    scanAreaRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) {
        setScanFrameRect(prev =>
          prev && prev.x === x && prev.y === y && prev.width === w && prev.height === h
            ? prev
            : { x, y, width: w, height: h }
        );
      }
    });
  }, []);

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

  // Typed/pasted attendee IDs go through the search sheet's input.
  const handleDirectIdScan = useCallback(async (identifier: string) => {
    const trimmed = identifier.trim();
    if (!trimmed || isProcessing) return;
    recordScannerActivity();
    if (!canScan) return;
    await handleScan(trimmed, 'manual');
    setSearchQuery('');
    clearSearch();
    setManualEntryMode('none');
    Keyboard.dismiss();
  }, [canScan, clearSearch, handleScan, isProcessing, recordScannerActivity]);

  const handleSearchChange = useCallback((text: string) => {
    recordScannerActivity();
    setSearchQuery(text);
    // Without roster access there is nothing to look up as you type; the sheet
    // becomes a plain attendee-ID field, and scanning by ID still works.
    if (!canViewParticipantRecords) return;
    if (text.length >= 2) {
      void search(text);
    } else {
      clearSearch();
    }
  }, [canViewParticipantRecords, clearSearch, recordScannerActivity, search]);

  const handleSearchScan = useCallback(async (participant: Participant) => {
    const identifier = participant.participant_event_id || participant.participant_id;
    if (!identifier || isProcessing) return;
    recordScannerActivity();
    if (!canScan) return;
    await handleScan(identifier, 'manual');
    setSearchQuery('');
    clearSearch();
    setManualEntryMode('none');
    Keyboard.dismiss();
  }, [canScan, clearSearch, handleScan, isProcessing, recordScannerActivity]);

  const closeManualEntry = useCallback(() => {
    recordScannerActivity();
    setManualEntryMode('none');
    setSearchQuery('');
    clearSearch();
    Keyboard.dismiss();
  }, [clearSearch, recordScannerActivity]);

  const openManualEntry = useCallback((mode: ManualEntryMode) => {
    recordScannerActivity();
    setContextPickerOpen(false);
    setManualEntryMode(mode);
  }, [recordScannerActivity]);

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
      clearLastScan();
    } catch {
      Alert.alert('Error', 'Failed to undo check-in');
    } finally {
      setUndoing(false);
    }
  }, [clearLastScan, lastScan, recordScannerActivity, state.currentEvent?.id, undoing, updateParticipant]);

  if (!permission) {
    return <CenteredState title="Starting camera" loading />;
  }

  if (!permission.granted) {
    return (
      <CenteredState
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
        title="No event selected"
        message="Choose an event on the Overview tab before scanning."
      />
    );
  }

  const contextLabel = selectedContext?.name
    ?? (isLoadingContexts && scanContexts.length === 0 ? 'Loading contexts' : 'Choose a context');
  // Room under the card for the dock: Search pill (44) + gap (12).
  const dockHeight = 44 + 12;

  return (
    <View style={styles.container} onTouchStart={recordScannerActivity}>
      {/* The camera stage is always dark, whatever the system appearance. */}
      {isFocused ? <StatusBar style="light" /> : null}
      {isFocused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onBarcodeScanned}
        />
      ) : null}

      <View style={styles.cameraScrim} pointerEvents="none">
        {scanFrameRect ? (
          <>
            <View style={[styles.scrim, { top: 0, left: 0, right: 0, height: scanFrameRect.y }]} />
            <View style={[styles.scrim, { top: scanFrameRect.y, left: 0, width: scanFrameRect.x, height: scanFrameRect.height }]} />
            <View style={[styles.scrim, { top: scanFrameRect.y, left: scanFrameRect.x + scanFrameRect.width, right: 0, height: scanFrameRect.height }]} />
            <View style={[styles.scrim, { top: scanFrameRect.y + scanFrameRect.height, left: 0, right: 0, bottom: 0 }]} />
          </>
        ) : (
          <View style={[styles.scrim, StyleSheet.absoluteFill]} />
        )}
      </View>

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom', 'left', 'right']}>
        <View style={scan.header}>
          <PressableSurface
            style={[scan.pill, scan.contextPill]}
            contentStyle={scan.pillContent}
            rippleColor={ON_CAMERA}
            rippleAlpha={0.2}
            onPress={() => {
              recordScannerActivity();
              setContextPickerOpen(true);
            }}
            disabled={scanContexts.length === 0}
            accessibilityRole="button"
            accessibilityLabel={`Scan context: ${selectedContext?.name ?? 'not chosen'}. Change`}
            accessibilityHint={selectedContext ? undefined : 'Choose a context before scanning'}
          >
            <Text style={scan.pillMuted} numberOfLines={1}>{state.currentEvent?.name}</Text>
            <Icon name="chevron-right" size={14} color={ON_CAMERA_MUTED} />
            <Text style={[scan.pillStrong, !selectedContext && scan.pillWarning]} numberOfLines={1}>
              {contextLabel}
            </Text>
            {scanContexts.length > 0 ? <Icon name="chevron-down" size={16} color={ON_CAMERA} /> : null}
          </PressableSurface>
          <View style={scan.flexSpacer} />
          <RoundButton
            icon="torch"
            label={torchOn ? 'Turn torch off' : 'Turn torch on'}
            active={torchOn}
            onPress={() => {
              recordScannerActivity();
              setTorchOn(on => !on);
            }}
          />
          <RoundButton
            icon="dots-horizontal"
            label="More: Power mode, Kiosk mode"
            active={isPowerModeEnabled}
            onPress={() => {
              recordScannerActivity();
              setMoreOpen(true);
            }}
          />
        </View>

        <View style={styles.scanStage} onLayout={measureScanArea}>
          <View
            ref={scanAreaRef}
            onLayout={measureScanArea}
            style={[styles.scanArea, { width: scanAreaSize, height: scanAreaSize }]}
            accessible
            accessibilityLabel={`QR code scanning area. ${scannerStatus}`}
          >
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
            {isProcessing ? (
              <View style={styles.processingIndicator}>
                <ActivityIndicator color={colors.white} size="small" />
              </View>
            ) : null}
          </View>

          {needsContext ? (
            <View style={styles.contextRequired} pointerEvents="none">
              <Text style={styles.contextRequiredTitle}>
                Choose a context to start scanning
              </Text>
              <Text style={styles.contextRequiredText}>
                {"Pick where you're scanning people in from the context picker at the top."}
              </Text>
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

          <View style={scan.dockRow}>
            <Button
              variant="primary"
              icon="search"
              title={canViewParticipantRecords ? 'Search' : 'Enter ID'}
              disabled={!contextsReady}
              onPress={() => openManualEntry('search')}
              style={scan.flexSpacer}
            />
            {nfcSupported && Platform.OS === 'ios' ? (
              <RoundButton
                icon="nfc"
                label={nfcReading ? 'Reading NFC' : 'Scan NFC badge'}
                disabled={isProcessing || nfcReading || !contextsReady}
                onPress={() => {
                  recordScannerActivity();
                  void handleNFCScan();
                }}
              />
            ) : null}
          </View>
        </View>

        {manualEntryMode === 'search' ? (
          <SearchSheet
            canSearchRoster={canViewParticipantRecords}
            needsContext={needsContext}
            query={searchQuery}
            results={searchResults || []}
            isSearching={isSearching}
            isProcessing={isProcessing}
            onChange={handleSearchChange}
            onClear={() => {
              setSearchQuery('');
              clearSearch();
            }}
            onSelect={handleSearchScan}
            onSubmitId={handleDirectIdScan}
            onClose={closeManualEntry}
          />
        ) : null}
      </SafeAreaView>

      {/* The event can't be changed here: that's the Overview's switcher. */}
      <BottomSheet
        visible={contextPickerOpen}
        onClose={() => setContextPickerOpen(false)}
        title="Scan context"
        headerActions={<Button variant="icon" icon="x" title="Close" onPress={() => setContextPickerOpen(false)} />}
      >
        <ScrollView>
          <Text style={[scan.sheetNote, { color: tokens.text2 }]}>{state.currentEvent?.name}</Text>
          {scanContexts.map((context, index) => {
            const selected = context.id === selectedContextId;
            return (
              <ListRow
                key={context.id}
                title={context.name}
                subtitle={context.is_airport ? 'Airport' : context.checks_in ? 'Checks in' : undefined}
                icon={context.is_airport ? 'travel' : context.checks_in ? 'check-circle' : 'qrcode'}
                trailing={selected ? <Icon name="check" color={tokens.accent} /> : undefined}
                chevron={false}
                divider={index < scanContexts.length - 1}
                onPress={() => {
                  recordScannerActivity();
                  selectContext(context.id);
                  setContextPickerOpen(false);
                }}
              />
            );
          })}
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Scanner"
        headerActions={<Button variant="icon" icon="x" title="Close" onPress={() => setMoreOpen(false)} />}
      >
        <ListRow
          title="Power mode"
          subtitle="Prevents auto-lock and dims the screen after 30 seconds of inactivity"
          icon="device-mobile"
          trailing={(
            <Toggle
              value={isPowerModeEnabled}
              onValueChange={setPowerModeEnabled}
              accessibilityLabel="Power mode"
            />
          )}
        />
        <ListRow
          title="Kiosk mode"
          subtitle={canScan ? 'Self-serve check-in' : 'Choose a context first'}
          icon="lock-closed"
          disabled={!canScan}
          divider={false}
          onPress={() => {
            setMoreOpen(false);
            navigation.navigate('KioskSetup', {
              scanContextId: selectedContext?.id,
              scanContextName: selectedContext?.name,
            });
          }}
        />
      </BottomSheet>
    </View>
  );
}

const ON_CAMERA = '#f9f9fa';
const ON_CAMERA_MUTED = '#c6c6cd';
const CAMERA_CONTROL = 'rgba(15,20,26,0.82)';

/** A 44pt round control on the camera. */
function RoundButton({
  icon,
  label,
  onPress,
  active,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        scan.round,
        active && scan.roundActive,
        disabled && scan.disabled,
        pressedStyle(pressed && !disabled),
      ]}
      android_ripple={ripple('rgba(255,255,255,0.24)', { borderless: true, radius: 24 })}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
    >
      <Icon name={icon} size={20} color={active ? '#0f141a' : ON_CAMERA} />
    </Pressable>
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
  pill: { height: 44, borderRadius: 22, backgroundColor: CAMERA_CONTROL },
  pillContent: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  contextPill: { flexShrink: 1, maxWidth: '72%' },
  pillMuted: { color: ON_CAMERA_MUTED, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  pillStrong: { color: ON_CAMERA, fontSize: 14, lineHeight: 20, fontWeight: '700', flexShrink: 1 },
  pillWarning: { color: '#fbd332' },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CAMERA_CONTROL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundActive: { backgroundColor: '#fbd332' },
  disabled: { opacity: 0.4 },
  dock: { paddingHorizontal: 10 },
  flexSpacer: { flex: 1 },
  dockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetNote: { fontSize: 14, lineHeight: 20, paddingHorizontal: 20, paddingBottom: 8 },
});

function CenteredState({
  title,
  message,
  loading,
  actionLabel,
  onAction,
}: {
  title: string;
  message?: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centered}>
        {loading ? <ActivityIndicator color={colors.white} size="large" /> : null}
        <Text style={styles.messageTitle}>{title}</Text>
        {message ? <Text style={styles.messageText}>{message}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={onAction}>
            <Text style={styles.primaryButtonText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.sheetHeader}>
      <Text style={styles.sheetTitle}>{title}</Text>
      <Pressable
        style={({ pressed }) => [styles.sheetClose, pressed && styles.pressed]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={`Close ${title.toLowerCase()}`}
      >
        <Ionicons name="close" size={24} color={colors.white} />
      </Pressable>
    </View>
  );
}

function SearchSheet({
  canSearchRoster,
  needsContext,
  query,
  results,
  isSearching,
  isProcessing,
  onChange,
  onClear,
  onSelect,
  onSubmitId,
  onClose,
}: {
  canSearchRoster: boolean;
  needsContext: boolean;
  query: string;
  results: Participant[];
  isSearching: boolean;
  isProcessing: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  onSelect: (participant: Participant) => void;
  onSubmitId: (identifier: string) => void;
  onClose: () => void;
}) {
  const idCandidate = looksLikeAttendeeId(query) ? query.trim() : null;
  return (
    <KeyboardAvoidingView
      style={styles.searchSheetBackdrop}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.sheet, styles.searchSheet]}>
        <SheetHeader
          title={canSearchRoster ? 'Find an attendee' : 'Enter an attendee ID'}
          onClose={onClose}
        />
        {needsContext ? (
          <View style={styles.sheetNotice} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={18} color={colors.orange} />
            <Text style={styles.sheetNoticeText}>
              {'Choose a context before scanning. Close this and pick one from '
                + 'the context picker — what you type here is kept.'}
            </Text>
          </View>
        ) : null}

        <View style={styles.searchInputRow}>
          <Ionicons
            name={canSearchRoster ? 'search' : 'keypad-outline'}
            size={19}
            color={colors.gray[400]}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={canSearchRoster ? 'Name, email, or attendee ID' : 'Attendee ID'}
            placeholderTextColor={colors.gray[400]}
            value={query}
            onChangeText={onChange}
            onSubmitEditing={() => {
              if (idCandidate && !isProcessing && !needsContext) onSubmitId(idCandidate);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType={idCandidate ? 'go' : 'search'}
            autoFocus
          />
          {isSearching ? <ActivityIndicator color={colors.white} size="small" /> : null}
          {query.length > 0 && !isSearching ? (
            <Pressable
              style={styles.searchClearButton}
              onPress={onClear}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={20} color={colors.gray[400]} />
            </Pressable>
          ) : null}
        </View>

        <FlatList
          data={canSearchRoster ? results : []}
          keyExtractor={(item, index) => item.participant_event_id || item.participant_id || `attendee-${index}`}
          keyboardShouldPersistTaps="handled"
          style={styles.searchResults}
          ListHeaderComponent={idCandidate ? (
            <Pressable
              style={({ pressed }) => [
                styles.searchResult,
                pressed && styles.searchResultPressed,
                needsContext && styles.searchResultBlocked,
              ]}
              onPress={() => onSubmitId(idCandidate)}
              disabled={isProcessing || needsContext}
            >
              <View style={styles.searchResultText}>
                <Text style={styles.searchResultName} numberOfLines={1}>Scan as attendee ID</Text>
                <Text style={styles.searchResultDetail} numberOfLines={1}>{idCandidate}</Text>
              </View>
              <View style={styles.searchResultAction}>
                {isProcessing ? (
                  <ActivityIndicator color={colors.green} size="small" />
                ) : (
                  <>
                    <Text style={styles.searchResultActionText}>Scan</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.green} />
                  </>
                )}
              </View>
            </Pressable>
          ) : undefined}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.searchResult,
                pressed && styles.searchResultPressed,
                needsContext && styles.searchResultBlocked,
              ]}
              onPress={() => onSelect(item)}
              disabled={needsContext}
            >
              <View style={styles.searchResultText}>
                <Text style={styles.searchResultName} numberOfLines={1}>
                  {item.display_name || item.full_name}
                </Text>
                {/* Name and pronouns only: this list is read at the door,
                    over the scanner's shoulder, so no contact details. */}
                {item.pronouns ? (
                  <Text style={styles.searchResultDetail} numberOfLines={1}>{item.pronouns}</Text>
                ) : null}
              </View>
              <View style={styles.searchResultAction}>
                <Text style={styles.searchResultActionText}>Scan</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.green} />
              </View>
            </Pressable>
          )}
          ListEmptyComponent={idCandidate ? undefined : (
            <Text style={styles.searchEmptyText}>
              {!canSearchRoster
                ? "Your role on this event doesn't include participant records, so scan or paste an attendee ID."
                : query.length === 0
                  ? 'Search by name or email, or paste an attendee ID'
                  : query.length < 2
                    ? 'Type at least 2 characters'
                    : isSearching
                      ? 'Searching'
                      : 'No attendees found'}
            </Text>
          )}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[900] },
  overlay: { flex: 1 },
  cameraScrim: { ...StyleSheet.absoluteFill },
  scrim: { position: 'absolute', backgroundColor: 'rgba(15,23,42,0.52)' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  messageTitle: { color: colors.white, fontSize: 23, lineHeight: 29, fontWeight: '800', textAlign: 'center' },
  messageText: { color: colors.gray[300], fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 360 },
  primaryButton: { minHeight: 48, paddingHorizontal: 22, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.red },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  scanStage: { flex: 1, minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 12 },
  scanArea: { position: 'relative' },
  contextRequired: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 26, backgroundColor: 'rgba(15,23,42,0.94)' },
  contextRequiredTitle: { color: colors.white, fontSize: 17, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
  contextRequiredText: { color: colors.gray[300], fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 340 },
  corner: { position: 'absolute', width: 46, height: 46, borderColor: colors.white },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 15 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 15 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 15 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 15 },
  processingIndicator: { position: 'absolute', left: '50%', top: '50%', width: 48, height: 48, marginLeft: -24, marginTop: -24, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.78)' },
  // Anchored above the dock, outside layout flow, so the scan frame never shifts
  resultCardOverlay: { position: 'absolute', left: 14, right: 14 },
  resultCardScroll: { width: '100%', maxWidth: 620, alignSelf: 'center' },
  pressed: { opacity: 0.72 },
  searchSheetBackdrop: { ...StyleSheet.absoluteFill, zIndex: 100, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.78)' },
  sheet: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, gap: 14, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[600], backgroundColor: colors.gray[900] },
  searchSheet: { height: '72%' },
  sheetHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sheetTitle: { color: colors.white, fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.3 },
  sheetClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  searchInputRow: { minHeight: 52, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: colors.gray[600], backgroundColor: colors.gray[800], flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { minHeight: 50, flex: 1, color: colors.white, fontSize: 16 },
  searchClearButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  searchResults: { flex: 1 },
  searchResult: { minHeight: 68, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[700] },
  searchResultPressed: { backgroundColor: colors.gray[800] },
  searchResultBlocked: { opacity: 0.5 },
  sheetNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.orange, backgroundColor: 'rgba(255,140,55,0.12)' },
  sheetNoticeText: { flex: 1, color: colors.gray[100], fontSize: 13, lineHeight: 19, fontWeight: '600' },
  searchResultText: { flex: 1, gap: 3 },
  searchResultName: { color: colors.white, fontSize: 16, fontWeight: '700' },
  searchResultDetail: { color: colors.gray[400], fontSize: 13 },
  searchResultAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 },
  searchResultActionText: { color: colors.green, fontSize: 14, fontWeight: '800' },
  searchEmptyText: { paddingVertical: 34, color: colors.gray[400], fontSize: 15, textAlign: 'center' },
});
