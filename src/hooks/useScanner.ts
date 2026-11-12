import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { nfcService } from '../services/nfc';
import { ParticipantIndex } from '../services/participantIndex';
import {
  SameCodeGate,
  cachedPriorScan,
  confirmingResult,
  createAttemptId,
  failedResult,
  isRetryableScanError,
  nfcScanTarget,
  parseQRCode,
  queuedResult,
  resultFromResponse,
  scannableContexts,
  type ScannerResult,
} from '../services/scannerCore';
import { scanQueue } from '../services/scanQueue';
import { syncService } from '../services/sync';
import type { ScanContext, ScanSource } from '../types';

interface ScanRequest {
  kind: 'participant' | 'badge';
  identifier: string;
  rawData: string;
  source: ScanSource;
  scanContext?: ScanContext;
  attemptId?: string;
  startedAt?: string;
}

export function useScanner(options: {
  lockedContextId?: string;
} = {}) {
  const { lockedContextId } = options;
  const { state, confirmParticipant } = useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastScan, setLastScan] = useState<ScannerResult | null>(null);
  const [scanContexts, setScanContexts] = useState<ScanContext[]>([]);
  const [contextsEventId, setContextsEventId] = useState<string | null>(null);
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [isLoadingContexts, setIsLoadingContexts] = useState(false);
  const processingRef = useRef(false);
  const codeGateRef = useRef(new SameCodeGate(3000));
  const lastRequestRef = useRef<ScanRequest | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const nfcReadRef = useRef<symbol | null>(null);
  const currentEventId = state.currentEvent?.id ?? null;
  const currentEventIdRef = useRef<string | null>(currentEventId);
  currentEventIdRef.current = currentEventId;
  const participantIndex = useMemo(
    () => new ParticipantIndex(state.participants),
    [state.participants]
  );

  const applyContexts = useCallback((eventId: string, allContexts: ScanContext[]) => {
    const contexts = scannableContexts(allContexts);
    setScanContexts(contexts);
    setContextsEventId(eventId);
    setSelectedContextId(current => {
      if (lockedContextId) {
        return contexts.some(context => context.id === lockedContextId)
          ? lockedContextId
          : null;
      }
      if (current && contexts.some(context => context.id === current)) return current;
      // Nothing is preselected: staff pick where they are scanning people in.
      // An event with a single context has nothing to pick between.
      return allContexts.length === 1 ? allContexts[0].id : null;
    });
  }, [lockedContextId]);

  useEffect(() => {
    let cancelled = false;
    const eventId = state.currentEvent?.id;

    codeGateRef.current.reset();
    lastRequestRef.current = null;
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    nfcReadRef.current = null;
    processingRef.current = false;
    setIsProcessing(false);
    setLastScan(null);
    setScanContexts([]);
    setContextsEventId(null);
    setSelectedContextId(null);
    setIsLoadingContexts(false);

    if (!eventId) {
      setScanContexts([]);
      setContextsEventId(null);
      setSelectedContextId(null);
      return () => {
        cancelled = true;
      };
    }
    const activeEventId = eventId;
    const cacheGeneration = syncService.getCacheGeneration();

    async function loadContexts() {
      setIsLoadingContexts(true);
      const cached = await syncService.getCachedScanContexts(activeEventId);
      if (!cancelled && cached.length > 0) {
        applyContexts(activeEventId, cached);
        setIsLoadingContexts(false);
      }

      try {
        const fresh = await api.getScanContexts(activeEventId);
        if (cancelled) return;
        applyContexts(activeEventId, fresh);
        void syncService.cacheScanContexts(activeEventId, fresh, cacheGeneration);
      } catch (error) {
        if (!cancelled && cached.length === 0) {
          console.error('Failed to load scan contexts:', error);
          setScanContexts([]);
        }
      } finally {
        if (!cancelled) setIsLoadingContexts(false);
      }
    }

    void loadContexts();
    return () => {
      cancelled = true;
    };
  }, [applyContexts, state.currentEvent?.id]);

  const contextRequiredResult = useCallback((
    source: ScanSource,
    rawData = ''
  ): ScannerResult => {
    const result = failedResult(new Error('Choose a context before scanning.'), {
      attemptId: createAttemptId(),
      rawData,
      source,
    });
    setLastScan(result);
    return result;
  }, []);

  const runRequest = useCallback(async (
    request: ScanRequest
  ): Promise<ScannerResult | null> => {
    const currentEvent = state.currentEvent;
    if (!currentEvent || processingRef.current) return null;
    const eventId = currentEvent.id;
    if (currentEventIdRef.current !== eventId) return null;

    const scanContext = request.scanContext;
    if (scanContexts.length > 0 && !scanContext) {
      return contextRequiredResult(request.source, request.rawData);
    }

    const cachedParticipant = request.kind === 'badge'
      ? participantIndex.findByNfcToken(request.identifier)
      : participantIndex.find(request.identifier);
    const attemptId = request.attemptId ?? createAttemptId();
    const startedAt = request.startedAt ?? new Date().toISOString();
    const stableRequest = { ...request, attemptId, startedAt };
    const confirming = confirmingResult({
      attemptId,
      rawData: request.rawData,
      source: request.source,
      participant: cachedParticipant,
      scanContext,
    });

    processingRef.current = true;
    setIsProcessing(true);
    const requestController = new AbortController();
    requestAbortRef.current = requestController;
    lastRequestRef.current = stableRequest;
    setLastScan(confirming);

    const baseResult = {
      attemptId,
      rawData: request.rawData,
      source: request.source,
      participant: cachedParticipant,
      scanContext,
    };

    // Attend can't be reached: save the scan for the queue to deliver with
    // the same client_scan_id and scanned_at. The result says so; it never
    // claims a check-in. Duplicates can only be judged from local data.
    const saveOffline = async (): Promise<ScannerResult> => {
      const queued = await scanQueue.findQueuedScan(eventId, {
        identifier: request.identifier,
        participantEventId: cachedParticipant?.participant_event_id,
        scanContextId: scanContext?.id,
      });
      const prior = cachedPriorScan(cachedParticipant, scanContext?.id)
        ?? (queued && queued.clientScanId !== attemptId ? { firstScannedAt: queued.scannedAt } : null);
      await scanQueue.enqueue({
        clientScanId: attemptId,
        eventId,
        kind: request.kind,
        identifier: request.identifier,
        scanContextId: scanContext?.id,
        source: request.source,
        scannedAt: startedAt,
        participantEventId: cachedParticipant?.participant_event_id,
      });
      return queuedResult({
        ...baseResult,
        alreadyScannedLocally: !!prior,
        firstScannedAt: prior?.firstScannedAt,
      });
    };

    try {
      const netState = await NetInfo.fetch().catch(() => null);
      if (requestController.signal.aborted || currentEventIdRef.current !== eventId) {
        return null;
      }
      if (netState?.isConnected === false) {
        const result = await saveOffline();
        if (requestController.signal.aborted || currentEventIdRef.current !== eventId) {
          return null;
        }
        setLastScan(result);
        return result;
      }

      const options = {
        scanContextId: scanContext?.id,
        clientScanId: attemptId,
        source: request.source,
        scannedAt: startedAt,
        signal: requestController.signal,
      };
      const response = request.kind === 'badge'
        ? await api.createNfcScan(eventId, request.identifier, options)
        : await api.createScan(eventId, request.identifier, options);
      if (requestController.signal.aborted || currentEventIdRef.current !== eventId) {
        return null;
      }
      const result = resultFromResponse({
        attemptId,
        rawData: request.rawData,
        source: request.source,
        response,
        cachedParticipant,
        scanContext,
      });

      setLastScan(result);
      void confirmParticipant(eventId, response.participant).catch(error => {
        console.warn('[Scanner] Failed to persist confirmed participant:', error);
      });
      return result;
    } catch (error) {
      if (requestController.signal.aborted || currentEventIdRef.current !== eventId) {
        return null;
      }
      let result = failedResult(error, baseResult);
      if (isRetryableScanError(error)) {
        try {
          result = await saveOffline();
        } catch (queueError) {
          console.warn('[Scanner] Failed to queue offline scan:', queueError);
        }
        if (requestController.signal.aborted || currentEventIdRef.current !== eventId) {
          return null;
        }
      }
      setLastScan(result);
      return result;
    } finally {
      if (requestAbortRef.current === requestController) {
        requestAbortRef.current = null;
        processingRef.current = false;
        setIsProcessing(false);
      }
    }
  }, [
    confirmParticipant,
    contextRequiredResult,
    participantIndex,
    scanContexts.length,
    state.currentEvent,
  ]);

  const selectedContext = useMemo(() => {
    if (contextsEventId !== currentEventId) return undefined;
    return scanContexts.find(context => context.id === selectedContextId);
  }, [contextsEventId, currentEventId, scanContexts, selectedContextId]);
  const contextsReady = !!currentEventId && contextsEventId === currentEventId;
  const needsContext = scanContexts.length > 0 && !selectedContext;

  const handleScan = useCallback(async (
    data: string,
    source: ScanSource = 'qr'
  ): Promise<ScannerResult | null> => {
    if (
      processingRef.current ||
      !contextsReady ||
      !codeGateRef.current.accept(data)
    ) return null;

    const parsed = parseQRCode(data);
    if (!parsed) {
      const result = failedResult(new Error('Unrecognised QR code'), {
        attemptId: createAttemptId(),
        rawData: data,
        source,
      });
      setLastScan(result);
      return result;
    }

    return runRequest({
      kind: 'participant',
      identifier: parsed.id,
      rawData: data,
      source,
      scanContext: selectedContext,
    });
  }, [contextsReady, runRequest, selectedContext]);

  // The shared tail of every NFC read: a badge token goes to the badge
  // endpoint, anything else must be an Attend QR payload.
  const scanNfcPayload = useCallback(async (
    payload: string,
    isBadgeToken: boolean
  ): Promise<ScannerResult | null> => {
    if (!codeGateRef.current.accept(`nfc:${payload}`)) return null;

    const target = nfcScanTarget(payload, isBadgeToken);
    if (!target) {
      const result = failedResult(new Error('Not an Attend badge.'), {
        attemptId: createAttemptId(),
        rawData: payload,
        source: 'nfc',
      });
      setLastScan(result);
      return result;
    }

    return runRequest({
      kind: target.kind,
      identifier: target.identifier,
      rawData: payload,
      source: 'nfc',
      scanContext: selectedContext,
    });
  }, [runRequest, selectedContext]);

  const handleNFCScan = useCallback(async (): Promise<ScannerResult | null> => {
    if (processingRef.current || !contextsReady) return null;
    if (needsContext) return contextRequiredResult('nfc');

    const eventIdAtStart = currentEventIdRef.current;
    const nfcRead = Symbol('nfc-read');
    nfcReadRef.current = nfcRead;
    processingRef.current = true;
    setIsProcessing(true);
    let nfcResult;
    try {
      nfcResult = await nfcService.readTag();
    } catch (error) {
      if (currentEventIdRef.current !== eventIdAtStart) return null;
      const result = failedResult(error, {
        attemptId: createAttemptId(),
        rawData: '',
        source: 'nfc',
      });
      setLastScan(result);
      return result;
    } finally {
      if (nfcReadRef.current === nfcRead) {
        nfcReadRef.current = null;
        processingRef.current = false;
        setIsProcessing(false);
      }
    }

    if (currentEventIdRef.current !== eventIdAtStart) return null;

    if (!nfcResult.success) {
      if (nfcResult.error === 'Cancelled') return null;
      const result = failedResult(new Error(nfcResult.error || 'NFC read failed.'), {
        attemptId: createAttemptId(),
        rawData: nfcResult.payload ?? '',
        source: 'nfc',
      });
      setLastScan(result);
      return result;
    }

    if (!nfcResult.payload || !nfcResult.type) {
      const result = failedResult(new Error('No Attend data found on this NFC tag.'), {
        attemptId: createAttemptId(),
        rawData: '',
        source: 'nfc',
      });
      setLastScan(result);
      return result;
    }

    return scanNfcPayload(nfcResult.payload, nfcResult.type === 'external');
  }, [contextRequiredResult, contextsReady, needsContext, scanNfcPayload]);

  // Android reads badges continuously (useNfcAutoRead) and hands over the
  // token with its record type: `isBadge` only for the Attend external
  // record. A URI/text record must be an Attend link; anything else (a
  // business card, a transit tag) never reaches the server.
  const handleNfcToken = useCallback(async (
    token: string,
    isBadge = false
  ): Promise<ScannerResult | null> => {
    const payload = token.trim();
    if (!payload || processingRef.current || !contextsReady) return null;
    if (needsContext) return contextRequiredResult('nfc');
    return scanNfcPayload(payload, isBadge);
  }, [contextRequiredResult, contextsReady, needsContext, scanNfcPayload]);

  const retryLastScan = useCallback((): Promise<ScannerResult | null> => {
    const request = lastRequestRef.current;
    if (!request) return Promise.resolve(null);
    return runRequest(request);
  }, [runRequest]);

  const hideLastScan = useCallback(() => {
    setLastScan(null);
  }, []);

  const clearLastScan = useCallback(() => {
    hideLastScan();
    codeGateRef.current.reset();
  }, [hideLastScan]);

  // After an undo: hides that scan's card only if it is still the one shown
  // (a newer scan may have landed during the request), and leaves the
  // same-code gate alone, so a code still in frame isn't checked straight
  // back in. Scanning it again takes moving it out of frame first.
  const hideScan = useCallback((attemptId: string) => {
    setLastScan(current => (current?.attemptId === attemptId ? null : current));
  }, []);

  const selectContext = useCallback((contextId: string) => {
    if (lockedContextId) return;
    setSelectedContextId(contextId);
  }, [lockedContextId]);

  return {
    handleScan,
    handleNFCScan,
    handleNfcToken,
    retryLastScan,
    isProcessing,
    lastScan,
    clearLastScan,
    hideLastScan,
    hideScan,
    hasEvent: !!state.currentEvent,
    scanContexts,
    selectedContextId,
    selectContext,
    needsContext,
    isLoadingContexts,
    contextsReady,
  };
}
