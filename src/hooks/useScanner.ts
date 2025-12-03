import { useState, useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { useApp } from '../context/AppContext';
import { api, ApiError } from '../services/api';
import { syncService } from '../services/sync';
import type { Participant, QRCodeData } from '../types';

interface ScanResult {
  success: boolean;
  participant?: Participant;
  error?: string;
  alreadyCheckedIn?: boolean;
}

export function useScanner() {
  const { state, updateParticipant } = useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const lastScannedId = useRef<string | null>(null);
  const scanCooldownRef = useRef<boolean>(false);

  const parseQRCode = useCallback((data: string): QRCodeData | null => {
    if (data.startsWith('attend:P:')) {
      const id = data.replace('attend:P:', '');
      if (id && id.length > 0) {
        return { type: 'participant', id };
      }
    }
    
    const uuidMatch = data.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    if (uuidMatch) {
      return { type: 'participant', id: data };
    }

    return null;
  }, []);

  const processCheckIn = useCallback(async (participantId: string): Promise<ScanResult> => {
    const currentEvent = state.currentEvent;
    if (!currentEvent) {
      return { success: false, error: 'No event selected' };
    }

    const cachedParticipant = state.participants.find(
      p => p.participant_event_id === participantId || p.participant_id === participantId
    );
    
    if (cachedParticipant?.checked_in_at) {
      return {
        success: false,
        participant: cachedParticipant,
        alreadyCheckedIn: true,
        error: 'Already checked in',
      };
    }

    try {
      await api.createScan(currentEvent.id, participantId);
      
      const updatedParticipant = cachedParticipant
        ? { ...cachedParticipant, checked_in_at: new Date().toISOString() }
        : await api.getParticipant(currentEvent.id, participantId);
      
      if (cachedParticipant) {
        updateParticipant(updatedParticipant);
      }
      
      return { success: true, participant: updatedParticipant };
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        await syncService.addPendingScan({
          localId: `${Date.now()}-${participantId}`,
          participantId,
          eventId: currentEvent.id,
          scannedAt: new Date().toISOString(),
        });

        const updatedParticipant = cachedParticipant
          ? { ...cachedParticipant, checked_in_at: new Date().toISOString() }
          : undefined;
        
        if (updatedParticipant) {
          updateParticipant(updatedParticipant);
        }
        
        return {
          success: true,
          participant: updatedParticipant,
          error: 'Saved offline - will sync later',
        };
      }

      return {
        success: false,
        participant: cachedParticipant,
        error: error instanceof Error ? error.message : 'Check-in failed',
      };
    }
  }, [state.currentEvent, state.participants, updateParticipant]);

  const handleScan = useCallback(async (data: string): Promise<ScanResult | null> => {
    if (scanCooldownRef.current || isProcessing) {
      return null;
    }

    const qrData = parseQRCode(data);
    if (!qrData) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return { success: false, error: 'Invalid QR code format' };
    }

    if (qrData.id === lastScannedId.current) {
      return null;
    }

    scanCooldownRef.current = true;
    setTimeout(() => {
      scanCooldownRef.current = false;
    }, 2000);

    setIsProcessing(true);
    lastScannedId.current = qrData.id;

    try {
      const result = await processCheckIn(qrData.id);
      setLastScan(result);

      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (result.alreadyCheckedIn) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      return result;
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, parseQRCode, processCheckIn]);

  const clearLastScan = useCallback(() => {
    setLastScan(null);
    lastScannedId.current = null;
  }, []);

  return {
    handleScan,
    isProcessing,
    lastScan,
    clearLastScan,
    hasEvent: !!state.currentEvent,
  };
}
