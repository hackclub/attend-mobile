import { useState, useCallback, useRef, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { useApp } from '../context/AppContext';
import { api, ApiError } from '../services/api';
import { syncService } from '../services/sync';
import type { Participant, QRCodeData, ScanContext } from '../types';

interface ScanResult {
  success: boolean;
  participant?: Participant;
  error?: string;
  alreadyCheckedIn?: boolean;
  firstScanInContext?: boolean;
  scanContext?: ScanContext;
}

export function useScanner() {
  const { state, updateParticipant } = useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [scanContexts, setScanContexts] = useState<ScanContext[]>([]);
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [isLoadingContexts, setIsLoadingContexts] = useState(false);
  const lastScannedId = useRef<string | null>(null);
  const scanCooldownRef = useRef<boolean>(false);

  // Load scan contexts when event changes
  useEffect(() => {
    async function loadContexts() {
      if (!state.currentEvent) {
        setScanContexts([]);
        setSelectedContextId(null);
        return;
      }

      setIsLoadingContexts(true);
      try {
        const contexts = await api.getScanContexts(state.currentEvent.id);
        setScanContexts(contexts);
        // Default to the first check-in context or first context
        const defaultContext = contexts.find(c => c.checks_in) || contexts[0];
        setSelectedContextId(defaultContext?.id || null);
      } catch (error) {
        console.error('Failed to load scan contexts:', error);
        setScanContexts([]);
      } finally {
        setIsLoadingContexts(false);
      }
    }

    loadContexts();
  }, [state.currentEvent?.id]);

  const parseQRCode = useCallback((data: string): QRCodeData | null => {
    // Handle attend://checkin/{participant_id} URLs
    const checkinUrlMatch = data.match(/^attend:\/\/checkin\/([0-9a-f-]+)$/i);
    if (checkinUrlMatch) {
      return { type: 'participant', id: checkinUrlMatch[1] };
    }

    // Legacy format: attend:P:{id}
    if (data.startsWith('attend:P:')) {
      const id = data.replace('attend:P:', '');
      if (id && id.length > 0) {
        return { type: 'participant', id };
      }
    }
    
    // Fallback: raw UUID
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

    // Check if we need a context but don't have one selected
    if (scanContexts.length > 1 && !selectedContextId) {
      return { success: false, error: 'Please select a scan context' };
    }

    const contextId = scanContexts.length === 1 ? scanContexts[0].id : selectedContextId;
    const selectedContext = scanContexts.find(c => c.id === contextId);

    const cachedParticipant = state.participants.find(
      p => p.participant_event_id === participantId || p.participant_id === participantId
    );
    
    // Check if already scanned in THIS context
    const existingScanInContext = cachedParticipant?.scans_by_context?.find(
      s => s.scan_context_id === contextId
    );
    
    if (existingScanInContext) {
      return {
        success: false,
        participant: cachedParticipant,
        alreadyCheckedIn: true,
        scanContext: selectedContext,
        error: `Already scanned at ${existingScanInContext.scan_context_name}`,
      };
    }

    try {
      const response = await api.createScan(currentEvent.id, participantId, contextId || undefined);
      
      const updatedParticipant = response.participant || cachedParticipant;
      
      if (updatedParticipant) {
        updateParticipant(updatedParticipant);
      }
      
      return { 
        success: true, 
        participant: updatedParticipant,
        firstScanInContext: response.first_scan_in_context,
        scanContext: selectedContext,
      };
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
          scanContext: selectedContext,
          error: 'Saved offline - will sync later',
        };
      }

      return {
        success: false,
        participant: cachedParticipant,
        scanContext: selectedContext,
        error: error instanceof Error ? error.message : 'Check-in failed',
      };
    }
  }, [state.currentEvent, state.participants, updateParticipant, scanContexts, selectedContextId]);

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

  const selectContext = useCallback((contextId: string) => {
    setSelectedContextId(contextId);
  }, []);

  return {
    handleScan,
    isProcessing,
    lastScan,
    clearLastScan,
    hasEvent: !!state.currentEvent,
    scanContexts,
    selectedContextId,
    selectContext,
    isLoadingContexts,
  };
}
