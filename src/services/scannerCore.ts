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
