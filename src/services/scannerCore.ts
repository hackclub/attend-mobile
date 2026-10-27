import type {
  CreateScanResponse,
  Participant,
  QRCodeData,
  ScanContext,
  ScanOutcome,
  ScanSource,
} from '../types';
import { mergeParticipant } from './participantIndex';

export type ScannerOutcome = 'confirming' | ScanOutcome | 'not_scanned';

export interface ScannerResult {
  attemptId: string;
  rawData: string;
  source: ScanSource;
  outcome: ScannerOutcome;
  participant?: Participant;
  scanContext?: ScanContext;
  firstScannedAt?: string;
  message?: string;
  retryable: boolean;
}

export function parseQRCode(data: string): QRCodeData | null {
  const trimmed = data.trim();
  const checkinUrlMatch = trimmed.match(/^attend:\/\/checkin\/([0-9a-f-]+)$/i);
  if (checkinUrlMatch) {
    return { type: 'participant', id: checkinUrlMatch[1] };
  }

  if (trimmed.startsWith('attend:P:')) {
    const id = trimmed.slice('attend:P:'.length);
    return id ? { type: 'participant', id } : null;
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return { type: 'participant', id: trimmed };
  }

  return null;
}

export function responseOutcome(
  response: Pick<CreateScanResponse, 'outcome' | 'first_scan_in_context'>
): ScanOutcome {
  return response.outcome ?? (
    response.first_scan_in_context ? 'scanned' : 'already_scanned'
  );
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

function startTime(context: ScanContext): number | null {
  if (!context.starts_at) return null;
  const parsed = Date.parse(context.starts_at);
  return Number.isNaN(parsed) ? null : parsed;
}

// The order Attend's admin list and web scanner use: scheduled contexts by
// start time, unscheduled ones after, then by manual position. Sorting is
// stable, so contexts that tie keep the order the server sent them in.
function bySchedule(contexts: ScanContext[]): ScanContext[] {
  return [...contexts].sort((a, b) => {
    const aStart = startTime(a);
    const bStart = startTime(b);
    if (aStart !== bStart) {
      if (aStart === null) return 1;
      if (bStart === null) return -1;
      return aStart - bStart;
    }
    return (a.position ?? 0) - (b.position ?? 0);
  });
}

// The contexts worth offering right now: the ones open at this moment, else
// the ones scheduled for today, else all of them.
export function scannableContexts(contexts: ScanContext[]): ScanContext[] {
  const openNow = contexts.filter(isInCurrentTimeWindow);
  if (openNow.length > 0) return bySchedule(openNow);
  const today = contexts.filter(isOnContextDay);
  return bySchedule(today.length > 0 ? today : contexts);
}

export class SameCodeGate {
  private lastCode: string | null = null;
  private lastSeenAt = 0;

  constructor(private readonly suppressionMs: number) {}

  accept(code: string, now = Date.now()): boolean {
    if (code !== this.lastCode) {
      this.lastCode = code;
      this.lastSeenAt = now;
      return true;
    }

    const wasAbsentLongEnough = now - this.lastSeenAt >= this.suppressionMs;
    this.lastSeenAt = now;
    return wasAbsentLongEnough;
  }

  reset(): void {
    this.lastCode = null;
    this.lastSeenAt = 0;
  }
}

interface BaseResultInput {
  attemptId: string;
  rawData: string;
  source: ScanSource;
  participant?: Participant;
  scanContext?: ScanContext;
}

export function confirmingResult(input: BaseResultInput): ScannerResult {
  return {
    ...input,
    outcome: 'confirming',
    retryable: false,
  };
}

export function resultFromResponse(input: {
  attemptId: string;
  rawData: string;
  source: ScanSource;
  response: CreateScanResponse;
  cachedParticipant?: Participant;
  scanContext?: ScanContext;
}): ScannerResult {
  const participant = mergeParticipant(
    input.cachedParticipant,
    input.response.participant
  );

  return {
    attemptId: input.attemptId,
    rawData: input.rawData,
    source: input.source,
    outcome: responseOutcome(input.response),
    participant,
    scanContext: input.response.scan_context ?? input.scanContext,
    firstScannedAt: input.response.first_scanned_at,
    retryable: false,
  };
}

function retryableFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== 'object' || !('status' in error)) return false;

  const status = Number(error.status);
  return status === 0 || status === 429 || status >= 500;
}

export function failedResult(error: unknown, input: BaseResultInput): ScannerResult {
  const retryable = retryableFailure(error);
  const message = retryable
    ? 'Could not reach Attend. Try again.'
    : error instanceof Error
      ? error.message
      : 'Scan could not be confirmed.';

  return {
    ...input,
    outcome: 'not_scanned',
    message,
    retryable,
  };
}

export function createAttemptId(now = Date.now()): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
