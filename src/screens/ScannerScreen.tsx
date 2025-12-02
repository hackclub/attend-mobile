import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CameraType, BarCodeScanningResult } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useScanner } from '../hooks/useScanner';
import { useApp } from '../context/AppContext';
import { AlertBadge } from '../components/AlertBadge';
import { StatusBadge } from '../components/StatusBadge';
import { colors } from '../theme/colors';
import type { RootStackParamList, Participant } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.7;

export function ScannerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const { handleScan, isProcessing, lastScan, clearLastScan, hasEvent } = useScanner();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  useEffect(() => {
    if (lastScan) {
      setShowResult(true);
      const timer = setTimeout(() => {
        setShowResult(false);
        clearLastScan();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [lastScan, clearLastScan]);

  const handleBarcodeScanned = async (result: BarCodeScanningResult) => {
    if (isProcessing || showResult) return;
    await handleScan(result.data);
  };

  const requestPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const handleViewDetails = () => {
    if (lastScan?.participant) {
      setShowResult(false);
      clearLastScan();
      navigation.navigate('ParticipantDetail', { participant: lastScan.participant });
    }
  };

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.messageText}>Loading camera...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasPermission) {
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
      <Camera
        style={StyleSheet.absoluteFillObject}
        type={CameraType.back}
        barCodeScannerSettings={{
          barCodeTypes: ['qr'],
        }}
        onBarCodeScanned={handleBarcodeScanned}
      />

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
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 48,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
});
