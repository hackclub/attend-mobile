import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ScannerResultCard } from '../components/ScannerResultCard';
import { useApp } from '../context/AppContext';
import { useParticipants } from '../hooks/useParticipants';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useScanFeedback } from '../hooks/useScanFeedback';
import { useScanner } from '../hooks/useScanner';
import { useScannerPowerMode } from '../hooks/useScannerPowerMode';
import { useNFC } from '../hooks/useNFC';
import { colors } from '../theme/colors';
import type { Participant, RootStackParamList, ScanContext } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ManualEntryMode = 'none' | 'search';

// A query that reads as an attendee/participant-event ID rather than a name or
// email: one unbroken run of hex/dash characters (UUIDs) or 8+ alphanumerics.
function looksLikeAttendeeId(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.includes('@') || /\s/.test(trimmed)) return false;
  return /^[0-9a-fA-F-]{16,}$/.test(trimmed) || /^[A-Za-z0-9_-]{8,}$/.test(trimmed);
}

function ContextIcon({ context, color = colors.white }: { context: ScanContext; color?: string }) {
  return (
    <Ionicons
      name={context.is_airport ? 'airplane' : context.checks_in ? 'enter' : 'scan'}
      size={16}
      color={color}
    />
  );
}

export function ScannerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const {
    handleScan,
    handleNFCScan,
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
  } = useScanner();
  const { search, clearSearch, searchResults, isSearching } = useParticipants();
  const { isSupported: nfcSupported, isReading: nfcReading } = useNFC();
  const { isPad } = useResponsiveLayout();
  const { width, height } = useWindowDimensions();
  // The native tab bar floats over content, so the bottom dock must clear it.
  const tabBarHeight = useBottomTabBarHeight();
  const { play, isReady: isFeedbackReady } = useScanFeedback();
  const [permission, requestPermission] = useCameraPermissions();
  const {
    isPowerModeEnabled,
    setPowerModeEnabled,
    recordScannerActivity,
  } = useScannerPowerMode(hasEvent && !!permission?.granted);
  const [manualEntryMode, setManualEntryMode] = useState<ManualEntryMode>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [contextDropdownOpen, setContextDropdownOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const lastFeedbackAttemptRef = useRef<string | null>(null);

  const scanAreaSize = Math.min(width * 0.66, height * 0.39, isPad ? 420 : 300);
  const selectedContext = contextsReady
    ? scanContexts.find(context => context.id === selectedContextId)
    : undefined;
  const cameraScanningEnabled = isFocused
    && manualEntryMode === 'none'
    && !contextDropdownOpen;
  const canEnterKiosk = contextsReady
    && (scanContexts.length === 0 || !!selectedContext);
  const scannerStatus = isProcessing
    ? 'Confirming scan'
    : !contextsReady
      ? isLoadingContexts ? 'Loading contexts' : 'Contexts unavailable'
      : scanContexts.length > 0 && !selectedContext
        ? 'Select a scan context'
        : !isFeedbackReady
          ? 'Preparing feedback'
          : 'Ready to scan';

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

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

  // Typed/pasted attendee IDs go through the search sheet's input.
  const handleDirectIdScan = useCallback(async (identifier: string) => {
    const trimmed = identifier.trim();
    if (!trimmed || isProcessing) return;
    recordScannerActivity();
    await handleScan(trimmed, 'manual');
    setSearchQuery('');
    clearSearch();
    setManualEntryMode('none');
    Keyboard.dismiss();
  }, [clearSearch, handleScan, isProcessing, recordScannerActivity]);

  const handleSearchChange = useCallback((text: string) => {
    recordScannerActivity();
    setSearchQuery(text);
    if (text.length >= 2) {
      void search(text);
    } else {
      clearSearch();
    }
  }, [clearSearch, recordScannerActivity, search]);

  const handleSearchScan = useCallback(async (participant: Participant) => {
    const identifier = participant.participant_event_id || participant.participant_id;
    if (!identifier || isProcessing) return;
    recordScannerActivity();
    await handleScan(identifier, 'manual');
    setSearchQuery('');
    clearSearch();
    setManualEntryMode('none');
    Keyboard.dismiss();
  }, [clearSearch, handleScan, isProcessing, recordScannerActivity]);

  const closeManualEntry = useCallback(() => {
    recordScannerActivity();
    setManualEntryMode('none');
    setSearchQuery('');
    clearSearch();
    Keyboard.dismiss();
  }, [clearSearch, recordScannerActivity]);

  const openManualEntry = useCallback((mode: ManualEntryMode) => {
    recordScannerActivity();
    setContextDropdownOpen(false);
    setManualEntryMode(mode);
  }, [recordScannerActivity]);

  const viewDetails = useCallback(() => {
    if (!lastScan?.participant) return;
    recordScannerActivity();
    navigation.navigate('ParticipantDetail', { participant: lastScan.participant });
  }, [lastScan, navigation, recordScannerActivity]);

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
        message="Select an event from the Events tab before scanning."
      />
    );
  }

  return (
    <View style={styles.container} onTouchStart={recordScannerActivity}>
      {isFocused ? (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={cameraScanningEnabled ? handleBarcodeScanned : undefined}
        />
      ) : null}

      <View style={styles.cameraScrim} pointerEvents="none">
        <View style={styles.topScrim} />
        <View style={styles.middleScrim} />
        <View style={styles.bottomScrim} />
      </View>

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.eventHeading}>
            <Text style={styles.headerTitle} numberOfLines={1}>{state.currentEvent?.name}</Text>
            <View style={styles.liveRow}>
              <View style={[
                styles.liveDot,
                (!contextsReady || (scanContexts.length > 0 && !selectedContext))
                  && styles.liveDotPaused,
              ]} />
              <Text style={styles.headerSubtitle}>{scannerStatus}</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [
                styles.powerButton,
                isPowerModeEnabled && styles.powerButtonActive,
                pressed && styles.pressed,
              ]}
              onPress={() => setPowerModeEnabled(!isPowerModeEnabled)}
              accessibilityRole="switch"
              accessibilityState={{ checked: isPowerModeEnabled }}
              accessibilityLabel="Power Mode"
              accessibilityHint="Prevents auto-lock and dims the screen after 30 seconds of inactivity"
            >
              <Ionicons
                name={isPowerModeEnabled ? 'flash' : 'flash-outline'}
                size={18}
                color={isPowerModeEnabled ? colors.gray[900] : colors.white}
              />
              <Text style={[
                styles.powerButtonText,
                isPowerModeEnabled && styles.powerButtonTextActive,
              ]}>
                Power
              </Text>
            </Pressable>

            {isPad ? (
              <Pressable
                style={({ pressed }) => [
                  styles.iconButton,
                  !canEnterKiosk && styles.controlDisabled,
                  pressed && canEnterKiosk && styles.pressed,
                ]}
                onPress={() => navigation.navigate('KioskSetup', {
                  scanContextId: selectedContext?.id,
                  scanContextName: selectedContext?.name,
                })}
                disabled={!canEnterKiosk}
                accessibilityRole="button"
                accessibilityLabel="Open kiosk mode"
                accessibilityState={{ disabled: !canEnterKiosk }}
              >
                <Ionicons name="lock-closed" size={19} color={colors.white} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ContextSelector
          contexts={scanContexts}
          selectedContext={selectedContext}
          selectedContextId={selectedContextId}
          isOpen={contextDropdownOpen}
          isLoading={isLoadingContexts}
          onToggle={() => {
            recordScannerActivity();
            setContextDropdownOpen(open => !open);
          }}
          onSelect={contextId => {
            recordScannerActivity();
            selectContext(contextId);
            setContextDropdownOpen(false);
          }}
        />

        <View style={styles.scanStage}>
          <View
            style={[styles.scanArea, { width: scanAreaSize, height: scanAreaSize }]}
            accessibilityLabel="QR code scanning area"
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
        </View>

        <View style={[styles.bottomDock, { paddingBottom: 8 + tabBarHeight }]}>
          {lastScan ? (
            <View
              // Anchor above the scan tools row: tools (54) + dock padding
              // (8 + tab bar) + 10 gap. A percentage bottom misresolves once
              // the dock has dynamic padding, so compute it explicitly.
              style={[styles.resultCardOverlay, { bottom: 54 + 8 + tabBarHeight + 10 }]}
              pointerEvents="box-none"
            >
              <ScrollView
                style={[
                  styles.resultCardScroll,
                  { maxHeight: Math.max(200, Math.min(height * 0.5, 480)) },
                ]}
                contentContainerStyle={styles.resultCardWrap}
                bounces={false}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <ScannerResultCard
                  result={lastScan}
                  onDetails={viewDetails}
                  onClear={clearLastScan}
                  onRetry={() => {
                    recordScannerActivity();
                    void retryLastScan();
                  }}
                />
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.scanTools}>
            {nfcSupported && Platform.OS === 'ios' ? (
              <ToolButton
                icon="radio-outline"
                label={nfcReading ? 'Reading' : 'NFC'}
                disabled={isProcessing || nfcReading || !contextsReady}
                onPress={() => {
                  recordScannerActivity();
                  void handleNFCScan();
                }}
              />
            ) : null}
            <ToolButton
              icon="search"
              label="Search"
              disabled={!contextsReady}
              onPress={() => openManualEntry('search')}
            />
          </View>
        </View>

        {manualEntryMode === 'search' ? (
          <SearchSheet
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
    </View>
  );
}

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

function ContextSelector({
  contexts,
  selectedContext,
  selectedContextId,
  isOpen,
  isLoading,
  onToggle,
  onSelect,
}: {
  contexts: ScanContext[];
  selectedContext?: ScanContext;
  selectedContextId: string | null;
  isOpen: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onSelect: (contextId: string) => void;
}) {
  if (isLoading && contexts.length === 0) {
    return (
      <View style={styles.contextLoading}>
        <ActivityIndicator color={colors.white} size="small" />
        <Text style={styles.contextLoadingText}>Loading contexts</Text>
      </View>
    );
  }

  if (contexts.length === 0) return null;

  if (contexts.length === 1) {
    if (!selectedContext) {
      return (
        <Pressable
          style={({ pressed }) => [styles.singleContext, pressed && styles.pressed]}
          onPress={() => onSelect(contexts[0].id)}
          accessibilityRole="button"
          accessibilityLabel={`Confirm scan context: ${contexts[0].name}`}
        >
          <ContextIcon context={contexts[0]} color={colors.gray[200]} />
          <Text style={styles.singleContextText}>Confirm {contexts[0].name}</Text>
          <Ionicons name="checkmark-circle-outline" size={19} color={colors.white} />
        </Pressable>
      );
    }
    return (
      <View style={styles.singleContext}>
        <ContextIcon context={contexts[0]} color={colors.gray[200]} />
        <Text style={styles.singleContextText} numberOfLines={1}>{contexts[0].name}</Text>
      </View>
    );
  }

  return (
    <View style={styles.contextSelector}>
      <Pressable
        style={({ pressed }) => [styles.contextButton, pressed && styles.pressed]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`Scan context: ${selectedContext?.name || 'not selected'}`}
      >
        {selectedContext ? <ContextIcon context={selectedContext} /> : null}
        <Text style={styles.contextButtonText} numberOfLines={1}>
          {selectedContext?.name || 'Select context'}
        </Text>
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.white} />
      </Pressable>

      {isOpen ? (
        <View style={styles.contextMenu}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            {contexts.map(context => {
              const selected = selectedContextId === context.id;
              return (
                <Pressable
                  key={context.id}
                  style={({ pressed }) => [
                    styles.contextOption,
                    selected && styles.contextOptionSelected,
                    pressed && styles.contextOptionPressed,
                  ]}
                  onPress={() => onSelect(context.id)}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                >
                  <ContextIcon context={context} color={selected ? colors.white : colors.gray[300]} />
                  <Text style={[styles.contextOptionText, selected && styles.contextOptionTextSelected]} numberOfLines={1}>
                    {context.name}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={19} color={colors.white} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function ToolButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.toolButton,
        pressed && !disabled && styles.toolButtonPressed,
        disabled && styles.toolButtonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={colors.white} />
      <Text style={styles.toolButtonText}>{label}</Text>
    </Pressable>
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
        <SheetHeader title="Find an attendee" onClose={onClose} />
        <View style={styles.searchInputRow}>
          <Ionicons name="search" size={19} color={colors.gray[400]} />
          <TextInput
            style={styles.searchInput}
            placeholder="Name, email, or attendee ID"
            placeholderTextColor={colors.gray[400]}
            value={query}
            onChangeText={onChange}
            onSubmitEditing={() => {
              if (idCandidate && !isProcessing) onSubmitId(idCandidate);
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
          data={results}
          keyExtractor={(item, index) => item.participant_event_id || item.participant_id || `attendee-${index}`}
          keyboardShouldPersistTaps="handled"
          style={styles.searchResults}
          ListHeaderComponent={idCandidate ? (
            <Pressable
              style={({ pressed }) => [styles.searchResult, pressed && styles.searchResultPressed]}
              onPress={() => onSubmitId(idCandidate)}
              disabled={isProcessing}
            >
              <View style={styles.searchResultText}>
                <Text style={styles.searchResultName} numberOfLines={1}>Scan as attendee ID</Text>
                <Text style={styles.searchResultEmail} numberOfLines={1}>{idCandidate}</Text>
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
          ) : null}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.searchResult, pressed && styles.searchResultPressed]}
              onPress={() => onSelect(item)}
            >
              <View style={styles.searchResultText}>
                <Text style={styles.searchResultName} numberOfLines={1}>
                  {item.display_name || item.full_name}
                </Text>
                <Text style={styles.searchResultEmail} numberOfLines={1}>{item.email}</Text>
              </View>
              <View style={styles.searchResultAction}>
                <Text style={styles.searchResultActionText}>Scan</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.green} />
              </View>
            </Pressable>
          )}
          ListEmptyComponent={idCandidate ? null : (
            <Text style={styles.searchEmptyText}>
              {query.length === 0
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
  cameraScrim: { ...StyleSheet.absoluteFillObject },
  topScrim: { height: '28%', backgroundColor: 'rgba(15,23,42,0.58)' },
  middleScrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.08)' },
  bottomScrim: { height: '38%', backgroundColor: 'rgba(15,23,42,0.62)' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  messageTitle: { color: colors.white, fontSize: 23, lineHeight: 29, fontWeight: '800', textAlign: 'center' },
  messageText: { color: colors.gray[300], fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 360 },
  primaryButton: { minHeight: 48, paddingHorizontal: 22, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.red },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  header: { minHeight: 74, paddingHorizontal: 18, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, zIndex: 40 },
  eventHeading: { flex: 1, gap: 5 },
  headerTitle: { color: colors.white, fontSize: 21, lineHeight: 26, fontWeight: '800', letterSpacing: -0.35 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  liveDotPaused: { backgroundColor: colors.orange },
  headerSubtitle: { color: colors.gray[200], fontSize: 13, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  powerButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 13, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(15,23,42,0.76)' },
  powerButtonActive: { borderColor: colors.yellow, backgroundColor: colors.yellow },
  powerButtonText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  powerButtonTextActive: { color: colors.gray[900] },
  iconButton: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(15,23,42,0.76)' },
  contextSelector: { marginHorizontal: 18, zIndex: 60 },
  contextButton: { minHeight: 48, maxWidth: 620, width: '100%', alignSelf: 'center', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(15,23,42,0.9)' },
  contextButtonText: { flex: 1, color: colors.white, fontSize: 15, fontWeight: '700' },
  contextMenu: { position: 'absolute', top: 54, left: 0, right: 0, alignSelf: 'center', maxWidth: 620, maxHeight: 280, overflow: 'hidden', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: colors.gray[900], shadowColor: colors.black, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 22, elevation: 16 },
  contextOption: { minHeight: 52, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[700] },
  contextOptionSelected: { backgroundColor: colors.red },
  contextOptionPressed: { backgroundColor: colors.gray[700] },
  contextOptionText: { flex: 1, color: colors.gray[200], fontSize: 15, fontWeight: '600' },
  contextOptionTextSelected: { color: colors.white, fontWeight: '800' },
  contextLoading: { minHeight: 48, marginHorizontal: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  contextLoadingText: { color: colors.gray[200], fontSize: 14, fontWeight: '600' },
  singleContext: { minHeight: 42, marginHorizontal: 18, paddingHorizontal: 13, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.75)' },
  singleContextText: { color: colors.gray[100], fontSize: 14, fontWeight: '700' },
  scanStage: { flex: 1, minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 12 },
  scanArea: { position: 'relative' },
  corner: { position: 'absolute', width: 46, height: 46, borderColor: colors.white },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 15 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 15 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 15 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 15 },
  processingIndicator: { position: 'absolute', left: '50%', top: '50%', width: 48, height: 48, marginLeft: -24, marginTop: -24, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.78)' },
  bottomDock: { paddingHorizontal: 14, paddingBottom: 8, gap: 10 },
  // Anchored above the dock, outside layout flow, so the scan frame never shifts
  resultCardOverlay: { position: 'absolute', left: 14, right: 14 },
  resultCardScroll: { width: '100%', maxWidth: 620, alignSelf: 'center' },
  resultCardWrap: { width: '100%' },
  scanTools: { minHeight: 54, maxWidth: 620, width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  toolButton: { minHeight: 50, flex: 1, paddingHorizontal: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.24)', backgroundColor: 'rgba(15,23,42,0.9)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  toolButtonPressed: { backgroundColor: colors.gray[700] },
  toolButtonDisabled: { opacity: 0.5 },
  controlDisabled: { opacity: 0.45 },
  toolButtonText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  searchSheetBackdrop: { ...StyleSheet.absoluteFillObject, zIndex: 100, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.78)' },
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
  searchResultText: { flex: 1, gap: 3 },
  searchResultName: { color: colors.white, fontSize: 16, fontWeight: '700' },
  searchResultEmail: { color: colors.gray[400], fontSize: 13 },
  searchResultAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 },
  searchResultActionText: { color: colors.green, fontSize: 14, fontWeight: '800' },
  searchEmptyText: { paddingVertical: 34, color: colors.gray[400], fontSize: 15, textAlign: 'center' },
});
