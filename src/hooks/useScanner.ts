import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { checkinCodes } from '../services/checkinCodes';
import { nfcService } from '../services/nfc';
import { offlineScans, type QueuedVerdict } from '../services/offlineScans';
import { ParticipantIndex } from '../services/participantIndex';
import {
  SameCodeGate,
  confirmingResult,
  createAttemptId,
  failedResult,
  invalidTicketResult,
  parseQRCode,
  resultFromResponse,
  retryableFailure,
  savedResult,
  scannableContexts,
  type ScannerResult,
} from '../services/scannerCore';
import { verifySignedTicket, type CheckinCodeMaterial } from '../services/signedTicket';
import { syncService } from '../services/sync';
import type { QRCodeData, ScanContext, ScanSource } from '../types';

// How stale the keys and cancelled list may get while the scanner is in use
// online before a successful scan fetches them again.
const CHECKIN_CODES_REFRESH_MS = 5 * 60_000;
// Past this, a saved copy can't vouch for a ticket any more: someone may have
// withdrawn since, or a key may have been retired. A ticket that checks out
// against it is treated as unchecked. A forged one is still turned away.
const CHECKIN_CODES_TRUSTED_MS = 24 * 60 * 60_000;

interface ScanRequest {
  kind: 'participant' | 'badge';
  identifier: string;
  // Where to look the attendee up locally, when it isn't `identifier`
  // (a signed ticket's registration id).
  lookupId?: string;
  rawData: string;
  source: ScanSource;
  scanContext?: ScanContext;
  attemptId?: string;
  startedAt?: string;
  // What the device made of the code on its own; see services/signedTicket.
  verdict?: QueuedVerdict;
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
  const checkinCodesRef = useRef<{ eventId: string; material: CheckinCodeMaterial; fetchedAt: number } | null>(null);
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

    // The keys and cancelled list for checking signed tickets with no
    // connection: the saved copy straight away, a fresh one when online.
    async function loadCheckinCodes() {
      const cachedCodes = await checkinCodes.cached(activeEventId);
      if (!cancelled && cachedCodes) {
        checkinCodesRef.current = { eventId: activeEventId, ...cachedCodes };
      }
      try {
        const fresh = await checkinCodes.refresh(activeEventId);
        if (!cancelled) checkinCodesRef.current = { eventId: activeEventId, ...fresh };
      } catch {
        // Offline, or an Attend without the endpoint yet: the saved copy, or
        // none, which leaves every code to the server.
      }
    }

    checkinCodesRef.current = null;
    void loadContexts();
    void loadCheckinCodes();
    return () => {
      cancelled = true;
    };
  }, [applyContexts, state.currentEvent?.id]);

  // The device's own read of a code, before anything is sent.
  const checkCode = useCallback((parsed: QRCodeData) => {
    const eventId = currentEventIdRef.current;
    const codes = checkinCodesRef.current;
    if (!eventId) return verifySignedTicket(undefined, '', null);
    const check = verifySignedTicket(parsed.ticket, eventId, codes?.eventId === eventId ? codes.material : null);
    if (check.verdict === 'valid' && codes && Date.now() - codes.fetchedAt > CHECKIN_CODES_TRUSTED_MS) {
      return { verdict: 'unverified' as const };
    }
    return check;
  }, []);

  const refreshCheckinCodesIfStale = useCallback((eventId: string) => {
    const codes = checkinCodesRef.current;
    if (codes?.eventId === eventId && Date.now() - codes.fetchedAt < CHECKIN_CODES_REFRESH_MS) return;
    void checkinCodes.refresh(eventId)
      .then(fresh => {
        if (currentEventIdRef.current === eventId) {
          checkinCodesRef.current = { eventId, ...fresh };
        }
      })
      .catch(() => {});
  }, []);

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

  // When this person was last scanned at this scan point, as far as the
  // device knows: a scan still waiting to send, or one already synced down.
  const earlierScan = useCallback(async (
    eventId: string,
    identifier: string,
    registrationId: string | undefined,
    scanContext: ScanContext | undefined
  ): Promise<string | undefined> => {
    const waiting = await offlineScans.findWaiting({
      eventId,
      scanContextId: scanContext?.id,
      identifier,
      registrationId,
    });
    if (waiting) return waiting.scannedAt;
    if (!registrationId || !scanContext) return undefined;
    const synced = (await syncService.getCachedScans(eventId)).find(scan =>
      scan.participant_event_id === registrationId && scan.scan_context?.id === scanContext.id
    );
    return synced?.scanned_at;
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
      : participantIndex.find(request.lookupId ?? request.identifier);
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
      // Attend is reachable, so anything saved while it wasn't can go too.
      void offlineScans.flush();
      refreshCheckinCodesIfStale(eventId);
      return result;
    } catch (error) {
      if (requestController.signal.aborted || currentEventIdRef.current !== eventId) {
        return null;
      }
      // No answer, or a server error: keep the scan on the device and send it
      // later, under the same id so it can never be counted twice.
      if (retryableFailure(error)) {
        try {
          const registrationId = request.lookupId ?? cachedParticipant?.participant_event_id;
          // The same ticket shown twice (or a copy of it) at this scan point,
          // caught on the device rather than only once the scans sync.
          const earlier = await earlierScan(eventId, request.identifier, registrationId, scanContext);
          await offlineScans.enqueue({
            clientScanId: attemptId,
            eventId,
            kind: request.kind,
            identifier: request.identifier,
            registrationId,
            scanContextId: scanContext?.id,
            source: request.source,
            scannedAt: startedAt,
            verdict: request.verdict ?? 'unverified',
          });
          if (currentEventIdRef.current !== eventId) return null;
          const saved = savedResult(request.verdict ?? 'unverified', {
            attemptId,
            rawData: request.rawData,
            source: request.source,
            participant: cachedParticipant,
            scanContext,
          }, earlier);
          setLastScan(saved);
          return saved;
        } catch (saveError) {
          console.error('[Scanner] Could not save the scan on this device:', saveError);
        }
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
  }, [
    confirmParticipant,
    contextRequiredResult,
    earlierScan,
    participantIndex,
    refreshCheckinCodesIfStale,
    scanContexts.length,
    state.currentEvent,
  ]);

  // A parsed QR code (camera or NFC): turned away here if its signature
  // fails, otherwise sent with what the device made of it.
  const runParsed = useCallback((
    parsed: QRCodeData,
    rawData: string,
    source: ScanSource,
    scanContext?: ScanContext
  ): Promise<ScannerResult | null> => {
    const check = checkCode(parsed);
    if (check.verdict === 'invalid') {
      const result = invalidTicketResult({ attemptId: createAttemptId(), rawData, source, scanContext });
      setLastScan(result);
      return Promise.resolve(result);
    }

    return runRequest({
      kind: 'participant',
      identifier: parsed.id,
      lookupId: parsed.registrationId,
      rawData,
      source,
      scanContext,
      verdict: check.verdict,
    });
  }, [checkCode, runRequest]);

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

    return runParsed(parsed, data, source, selectedContext);
  }, [contextsReady, runParsed, selectedContext]);

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

    return runParsed(parsed, nfcResult.payload, 'nfc', selectedContext);
  }, [contextRequiredResult, contextsReady, needsContext, runParsed, runRequest, selectedContext]);

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
    needsContext,
    isLoadingContexts,
    contextsReady,
  };
}
