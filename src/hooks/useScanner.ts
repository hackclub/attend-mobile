import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { nfcService } from '../services/nfc';
import { ParticipantIndex } from '../services/participantIndex';
import {
  SameCodeGate,
  confirmingResult,
  createAttemptId,
  failedResult,
  parseQRCode,
  resultFromResponse,
  type ScannerResult,
} from '../services/scannerCore';
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

function isOnContextDay(context: ScanContext): boolean {
  if (!context.starts_at) return true;
  const offset = context.starts_at.match(/(Z|([+-])(\d{2}):(\d{2}))$/);
  if (!offset) return true;
  const offsetMinutes = offset[1] === 'Z'
    ? 0
    : (offset[2] === '-' ? -1 : 1) * (Number(offset[3]) * 60 + Number(offset[4]));
  const nowAtContext = new Date(Date.now() + offsetMinutes * 60_000);
  const today = nowAtContext.toISOString().slice(0, 10);
  return context.starts_at.slice(0, 10) === today;
}

function isInCurrentTimeWindow(context: ScanContext): boolean {
  if (!context.starts_at || !context.ends_at) return false;
  const now = Date.now();
  return now >= Date.parse(context.starts_at) && now <= Date.parse(context.ends_at);
}

function activeContexts(contexts: ScanContext[]): ScanContext[] {
  const activeNow = contexts.filter(isInCurrentTimeWindow);
  if (activeNow.length > 0) return activeNow;
  const today = contexts.filter(isOnContextDay);
  return today.length > 0 ? today : contexts;
}

function defaultContext(contexts: ScanContext[]): ScanContext | undefined {
  return contexts.find(isInCurrentTimeWindow)
    ?? contexts.find(context => context.checks_in)
    ?? contexts[0];
}

export function useScanner(options: {
  lockedContextId?: string;
  selectDefaultContext?: boolean;
} = {}) {
  const { lockedContextId, selectDefaultContext = true } = options;
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

  const applyContexts = useCallback((
    eventId: string,
    allContexts: ScanContext[],
    selectDefaultIfEmpty: boolean
  ) => {
    const contexts = activeContexts(allContexts);
    setScanContexts(contexts);
    setContextsEventId(eventId);
    setSelectedContextId(current => {
      if (lockedContextId) {
        return contexts.some(context => context.id === lockedContextId)
          ? lockedContextId
          : null;
      }
      if (current && contexts.some(context => context.id === current)) return current;
      if (current !== null || !selectDefaultIfEmpty || !selectDefaultContext) return null;
      return defaultContext(contexts)?.id ?? null;
    });
  }, [lockedContextId, selectDefaultContext]);

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
        applyContexts(activeEventId, cached, true);
        setIsLoadingContexts(false);
      }

      try {
        const fresh = await api.getScanContexts(activeEventId);
        if (cancelled) return;
        applyContexts(activeEventId, fresh, cached.length === 0);
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

  const runRequest = useCallback(async (
    request: ScanRequest
  ): Promise<ScannerResult | null> => {
    const currentEvent = state.currentEvent;
    if (!currentEvent || processingRef.current) return null;
    const eventId = currentEvent.id;
    if (currentEventIdRef.current !== eventId) return null;

    const scanContext = request.scanContext;
    if (scanContexts.length > 0 && !scanContext) {
      const result = failedResult(new Error('Select a scan context first.'), {
        attemptId: createAttemptId(),
        rawData: request.rawData,
        source: request.source,
      });
      setLastScan(result);
      return result;
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

    try {
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
      const result = failedResult(error, {
        attemptId,
        rawData: request.rawData,
        source: request.source,
        participant: cachedParticipant,
        scanContext,
      });
      setLastScan(result);
      return result;
    } finally {
      if (requestAbortRef.current === requestController) {
        requestAbortRef.current = null;
        processingRef.current = false;
        setIsProcessing(false);
      }
    }
  }, [confirmParticipant, participantIndex, scanContexts.length, state.currentEvent]);

  const selectedContext = useMemo(() => {
    if (contextsEventId !== currentEventId) return undefined;
    return scanContexts.find(context => context.id === selectedContextId);
  }, [contextsEventId, currentEventId, scanContexts, selectedContextId]);
  const contextsReady = !!currentEventId && contextsEventId === currentEventId;

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
      const result = failedResult(new Error('Unrecognized Attend QR code.'), {
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

  const handleNFCScan = useCallback(async (): Promise<ScannerResult | null> => {
    if (processingRef.current || !contextsReady) return null;

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

    if (!codeGateRef.current.accept(`nfc:${nfcResult.payload}`)) return null;

    if (nfcResult.type === 'external') {
      return runRequest({
        kind: 'badge',
        identifier: nfcResult.payload,
        rawData: nfcResult.payload,
        source: 'nfc',
        scanContext: selectedContext,
      });
    }

    const parsed = parseQRCode(nfcResult.payload);
    if (!parsed) {
      const result = failedResult(new Error('Unrecognized Attend NFC data.'), {
        attemptId: createAttemptId(),
        rawData: nfcResult.payload,
        source: 'nfc',
      });
      setLastScan(result);
      return result;
    }

    return runRequest({
      kind: 'participant',
      identifier: parsed.id,
      rawData: nfcResult.payload,
      source: 'nfc',
      scanContext: selectedContext,
    });
  }, [contextsReady, runRequest, selectedContext]);

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

  const selectContext = useCallback((contextId: string) => {
    if (lockedContextId) return;
    setSelectedContextId(contextId);
  }, [lockedContextId]);

  return {
    handleScan,
    handleNFCScan,
    retryLastScan,
    isProcessing,
    lastScan,
    clearLastScan,
    hideLastScan,
    hasEvent: !!state.currentEvent,
    scanContexts,
    selectedContextId,
    selectContext,
    isLoadingContexts,
    contextsReady,
  };
}
