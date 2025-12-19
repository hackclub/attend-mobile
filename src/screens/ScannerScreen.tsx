import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  TextInput,
  FlatList,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useScanner } from '../hooks/useScanner';
import { useApp } from '../context/AppContext';
import { useParticipants } from '../hooks/useParticipants';
import { AlertBadge } from '../components/AlertBadge';
import { StatusBadge } from '../components/StatusBadge';
import { colors } from '../theme/colors';
import type { RootStackParamList, Participant } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.7;

type ManualEntryMode = 'none' | 'id' | 'search';

export function ScannerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const { handleScan, isProcessing, lastScan, clearLastScan, hasEvent } = useScanner();
  const { search, clearSearch, searchResults, isSearching } = useParticipants();
  const [permission, requestPermission] = useCameraPermissions();
  const [showResult, setShowResult] = useState(false);
  const [manualEntryMode, setManualEntryMode] = useState<ManualEntryMode>('none');
  const [manualId, setManualId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const lastScannedRef = useRef<string | null>(null);
  const [isFocused, setIsFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  useEffect(() => {
    if (lastScan) {
      setShowResult(true);
      const timer = setTimeout(() => {
        setShowResult(false);
        clearLastScan();
        lastScannedRef.current = null;
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [lastScan, clearLastScan]);

  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (isProcessing || showResult) return;
    if (lastScannedRef.current === result.data) return;
    lastScannedRef.current = result.data;
    await handleScan(result.data);
  };

  const handleManualIdScan = async () => {
    if (!manualId.trim() || isProcessing) return;
    await handleScan(manualId.trim());
    setManualId('');
    setManualEntryMode('none');
  };

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (text.length >= 2) {
      search(text);
    } else if (text.length === 0) {
      clearSearch();
    }
  }, [search, clearSearch]);

  const handleSearchCheckIn = async (participant: Participant) => {
    const id = participant.participant_event_id || participant.participant_id;
    if (!id || isProcessing) return;
    await handleScan(id);
    setSearchQuery('');
    clearSearch();
    setManualEntryMode('none');
    Keyboard.dismiss();
  };

  const closeManualEntry = () => {
    setManualEntryMode('none');
    setManualId('');
    setSearchQuery('');
    clearSearch();
    Keyboard.dismiss();
  };

  const handleViewDetails = () => {
    if (lastScan?.participant) {
      setShowResult(false);
      clearLastScan();
      navigation.navigate('ParticipantDetail', { participant: lastScan.participant });
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.messageText}>Loading camera...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.messageTitle}>Camera Access Required</Text>
          <Text style={styles.messageText}>
            AttendScanner needs camera access to scan QR codes.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasEvent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.messageTitle}>No Event Selected</Text>
          <Text style={styles.messageText}>
            Please select an event from the Events tab first.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={handleBarcodeScanned}
        />
      )}

      <SafeAreaView style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{state.currentEvent?.name}</Text>
          <Text style={styles.headerSubtitle}>Scan participant QR code</Text>
        </View>

        <View style={styles.scanAreaContainer}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>

        {showResult && lastScan && (
          <ResultOverlay
            result={lastScan}
            onViewDetails={handleViewDetails}
            onDismiss={() => {
              setShowResult(false);
              clearLastScan();
              lastScannedRef.current = null;
            }}
          />
        )}

        {state.sync.pendingScans > 0 && (
          <View style={styles.syncIndicator}>
            <Text style={styles.syncText}>
              {state.sync.pendingScans} pending sync
            </Text>
          </View>
        )}

        {/* Manual entry options */}
        {manualEntryMode === 'none' && !showResult && (
          <View style={styles.manualEntryButtons}>
            <TouchableOpacity 
              style={styles.manualEntryButton} 
              onPress={() => setManualEntryMode('search')}
            >
              <Ionicons name="search" size={18} color={colors.white} />
              <Text style={styles.manualEntryButtonText}>Search by Name</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.manualEntryButton, styles.manualEntryButtonSecondary]} 
              onPress={() => setManualEntryMode('id')}
            >
              <Ionicons name="keypad" size={18} color={colors.white} />
              <Text style={styles.manualEntryButtonText}>Enter ID</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Manual ID entry */}
        {manualEntryMode === 'id' && (
          <View style={styles.manualInputOverlay}>
            <View style={styles.manualInputHeader}>
              <Text style={styles.manualInputTitle}>Enter Participant ID</Text>
              <TouchableOpacity onPress={closeManualEntry}>
                <Ionicons name="close" size={24} color={colors.white} />
              </TouchableOpacity>
            </View>
            <View style={styles.manualInputRow}>
              <TextInput
                style={styles.manualInput}
                placeholder="Participant ID or QR code content"
                placeholderTextColor={colors.gray[400]}
                value={manualId}
                onChangeText={setManualId}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <TouchableOpacity 
                style={[styles.manualSubmitButton, !manualId.trim() && styles.manualSubmitButtonDisabled]} 
                onPress={handleManualIdScan}
                disabled={!manualId.trim()}
              >
                <Text style={styles.manualSubmitButtonText}>Check In</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Search by name */}
        {manualEntryMode === 'search' && (
          <View style={styles.searchOverlay}>
            <View style={styles.manualInputHeader}>
              <Text style={styles.manualInputTitle}>Search Participants</Text>
              <TouchableOpacity onPress={closeManualEntry}>
                <Ionicons name="close" size={24} color={colors.white} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchInputRow}>
              <Ionicons name="search" size={18} color={colors.gray[400]} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name or email..."
                placeholderTextColor={colors.gray[400]}
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); clearSearch(); }}>
                  <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
                </TouchableOpacity>
              )}
            </View>
            
            {isSearching && (
              <View style={styles.searchLoading}>
                <ActivityIndicator color={colors.red} />
              </View>
            )}

            <FlatList
              data={searchResults || []}
              keyExtractor={(item, index) => item.participant_event_id || item.participant_id || `item-${index}`}
              keyboardShouldPersistTaps="handled"
              style={styles.searchResults}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.searchResultRow}
                  onPress={() => handleSearchCheckIn(item)}
                >
                  <View style={styles.searchResultInfo}>
                    <Text style={styles.searchResultName} numberOfLines={1}>
                      {item.display_name || item.full_name}
                    </Text>
                    <Text style={styles.searchResultEmail} numberOfLines={1}>
                      {item.email}
                    </Text>
                  </View>
                  <View style={styles.searchResultAction}>
                    {item.checked_in_at ? (
                      <View style={styles.alreadyCheckedIn}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.orange} />
                        <Text style={styles.alreadyCheckedInText}>Checked In</Text>
                      </View>
                    ) : (
                      <View style={styles.checkInButton}>
                        <Ionicons name="arrow-forward-circle" size={20} color={colors.green} />
                        <Text style={styles.checkInButtonText}>Check In</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                searchQuery.length >= 2 ? (
                  <Text style={styles.searchEmptyText}>No participants found</Text>
                ) : searchQuery.length > 0 ? (
                  <Text style={styles.searchEmptyText}>Type at least 2 characters</Text>
                ) : (
                  <Text style={styles.searchEmptyText}>Start typing to search</Text>
                )
              }
            />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

interface ResultOverlayProps {
  result: {
    success: boolean;
    participant?: Participant;
    error?: string;
    alreadyCheckedIn?: boolean;
  };
  onViewDetails: () => void;
  onDismiss: () => void;
}

function ResultOverlay({ result, onViewDetails, onDismiss }: ResultOverlayProps) {
  const backgroundColor = result.success
    ? colors.green
    : result.alreadyCheckedIn
    ? colors.orange
    : colors.red;

  const participant = result.participant;

  return (
    <View style={[styles.resultOverlay, { backgroundColor }]}>
      <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
        <Text style={styles.dismissText}>✕</Text>
      </TouchableOpacity>

      {participant ? (
        <>
          <Text style={styles.resultName}>
            {participant.display_name || participant.full_name}
          </Text>

          {participant.pronouns && (
            <Text style={styles.resultPronouns}>({participant.pronouns})</Text>
          )}

          <View style={styles.resultStatus}>
            <StatusBadge
              status={result.alreadyCheckedIn ? 'checkedIn' : 'checkedIn'}
              label={result.alreadyCheckedIn ? 'Already Checked In' : 'Checked In!'}
            />
          </View>

          {(participant.has_anaphylaxis_risk || participant.high_support_flag) && (
            <View style={styles.alertsContainer}>
              {participant.has_anaphylaxis_risk && (
                <AlertBadge type="anaphylaxis" label="⚠️ Anaphylaxis Risk" />
              )}
              {participant.high_support_flag && (
                <AlertBadge type="highSupport" label="⚠️ High Support Needs" />
              )}
            </View>
          )}

          {(participant.allergies || participant.medical_conditions) && (
            <View style={styles.medicalInfo}>
              {participant.allergies && (
                <Text style={styles.medicalText}>
                  Allergies: {participant.allergies}
                </Text>
              )}
              {participant.medical_conditions && (
                <Text style={styles.medicalText}>
                  Conditions: {participant.medical_conditions}
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.detailsButton} onPress={onViewDetails}>
            <Text style={styles.detailsButtonText}>View Full Details</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.resultError}>{result.error || 'Unknown error'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  overlay: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  messageTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  messageText: {
    fontSize: 16,
    color: colors.gray[300],
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: colors.red,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.gray[300],
  },
  scanAreaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: colors.white,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  resultOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    padding: 24,
    paddingBottom: 24,
    borderRadius: 24,
  },
  dismissButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
  resultName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 4,
  },
  resultPronouns: {
    fontSize: 16,
    color: colors.white,
    opacity: 0.9,
    marginBottom: 12,
  },
  resultStatus: {
    marginBottom: 12,
  },
  alertsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  medicalInfo: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  medicalText: {
    color: colors.white,
    fontSize: 14,
    marginBottom: 4,
  },
  detailsButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  detailsButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  resultError: {
    fontSize: 18,
    color: colors.white,
    textAlign: 'center',
  },
  syncIndicator: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    backgroundColor: colors.orange,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  syncText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  manualEntryButtons: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
  },
  manualEntryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  manualEntryButtonSecondary: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  manualEntryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  manualInputOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 20,
    paddingBottom: 120,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  manualInputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  manualInputTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    backgroundColor: colors.gray[800],
    color: colors.white,
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
  },
  manualSubmitButton: {
    backgroundColor: colors.red,
    paddingHorizontal: 20,
    borderRadius: 10,
    justifyContent: 'center',
  },
  manualSubmitButtonDisabled: {
    opacity: 0.5,
  },
  manualSubmitButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  searchOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.95)',
    padding: 20,
    paddingTop: 60,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[800],
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.white,
    padding: 14,
    fontSize: 16,
  },
  searchLoading: {
    padding: 16,
    alignItems: 'center',
  },
  searchResults: {
    flex: 1,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[800],
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  searchResultInfo: {
    flex: 1,
    marginRight: 12,
  },
  searchResultName: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  searchResultEmail: {
    color: colors.gray[400],
    fontSize: 14,
  },
  searchResultAction: {
    alignItems: 'flex-end',
  },
  alreadyCheckedIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  alreadyCheckedInText: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '500',
  },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  checkInButtonText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '500',
  },
  searchEmptyText: {
    color: colors.gray[400],
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
  },
});
