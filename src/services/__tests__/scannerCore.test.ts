import type { CreateScanResponse, Participant, ScanContext } from '../../types';
import {
  SameCodeGate,
  cachedPriorScan,
  failedResult,
  isRetryableScanError,
  queuedResult,
  nfcScanTarget,
  parseQRCode,
  responseOutcome,
  resultFromResponse,
  scannableContexts,
} from '../scannerCore';

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    participant_id: 'person-1',
    participant_event_id: 'registration-1',
    display_name: 'Test Attendee',
    full_name: 'Test Attendee',
    email: 'attendee@example.com',
    status: 'complete',
    has_anaphylaxis_risk: false,
    requires_refrigeration: false,
    cross_contamination_risk: false,
    freedom_waiver_granted: false,
    high_support_flag: false,
    can_leave_unaccompanied: false,
    waiver_signed: true,
    ...overrides,
  };
}

const context: ScanContext = {
  id: 'context-1',
  name: 'Exit',
  checks_in: false,
  is_airport: false,
};

describe('parseQRCode', () => {
  it.each([
    ['attend://checkin/4d3d7ce6-0cbc-4717-a3ed-b0d415a4e03e', '4d3d7ce6-0cbc-4717-a3ed-b0d415a4e03e'],
    ['attend:P:legacy-id', 'legacy-id'],
    ['4d3d7ce6-0cbc-4717-a3ed-b0d415a4e03e', '4d3d7ce6-0cbc-4717-a3ed-b0d415a4e03e'],
  ])('parses %s', (raw, expectedId) => {
    expect(parseQRCode(raw)).toEqual({ type: 'participant', id: expectedId });
  });

  it('rejects unrelated qr data', () => {
    expect(parseQRCode('https://example.com')).toBeNull();
  });
});

describe('SameCodeGate', () => {
  it('suppresses the same camera frame but accepts a different attendee immediately', () => {
    const gate = new SameCodeGate(3000);

    expect(gate.accept('attendee-a', 1000)).toBe(true);
    expect(gate.accept('attendee-a', 1100)).toBe(false);
    expect(gate.accept('attendee-b', 1100)).toBe(true);
    expect(gate.accept('attendee-a', 4101)).toBe(true);
  });

  it('requires the same code to leave the frame before it can be scanned again', () => {
    const gate = new SameCodeGate(3000);

    expect(gate.accept('attendee-a', 1000)).toBe(true);
    expect(gate.accept('attendee-a', 3500)).toBe(false);
    expect(gate.accept('attendee-a', 5000)).toBe(false);
    expect(gate.accept('attendee-a', 8001)).toBe(true);
  });
});

describe('authoritative result mapping', () => {
  it('maps the rollout boolean when the additive outcome is absent', () => {
    expect(responseOutcome({ first_scan_in_context: false })).toBe('already_scanned');
    expect(responseOutcome({ first_scan_in_context: true })).toBe('scanned');
  });

  it('preserves cached identity fields while applying the confirmed participant', () => {
    const cached = participant({ headshot_url: 'https://images.example/headshot', allergies: 'peanuts' });
    const response = {
      success: true,
      outcome: 'already_scanned',
      first_scan_in_context: false,
      first_scanned_at: '2026-08-24T09:41:00Z',
      scan: {
        id: 'scan-1',
        participant_event_id: 'registration-1',
        scanned_at: '2026-08-24T09:45:00Z',
        created_at: '2026-08-24T09:45:00Z',
      },
      participant: participant({ display_name: 'Updated Name', headshot_url: undefined }),
    } satisfies CreateScanResponse;

    const result = resultFromResponse({
      attemptId: 'attempt-1',
      rawData: 'raw-code',
      source: 'qr',
      response,
      cachedParticipant: cached,
      scanContext: context,
    });

    expect(result.outcome).toBe('already_scanned');
    expect(result.participant).toMatchObject({
      display_name: 'Updated Name',
      headshot_url: 'https://images.example/headshot',
      allergies: 'peanuts',
    });
    expect(result.firstScannedAt).toBe('2026-08-24T09:41:00Z');
  });

  it('maps a network failure to a retryable not-scanned result', () => {
    const result = failedResult(new TypeError('Network request failed'), {
      attemptId: 'attempt-1',
      rawData: 'raw-code',
      source: 'qr',
      participant: participant(),
      scanContext: context,
    });

    expect(result.outcome).toBe('not_scanned');
    expect(result.retryable).toBe(true);
    expect(result.message).toBe('Could not reach Attend. Try again.');
  });
});

describe('scannableContexts', () => {
  function scanContext(overrides: Partial<ScanContext> & { id: string }): ScanContext {
    return {
      name: overrides.id,
      checks_in: false,
      is_airport: false,
      ...overrides,
    };
  }

  const now = Date.parse('2026-08-24T15:00:00-04:00');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('offers the contexts open right now, earliest start first', () => {
    const lunch = scanContext({
      id: 'lunch',
      starts_at: '2026-08-24T12:00:00-04:00',
      ends_at: '2026-08-24T18:00:00-04:00',
    });
    const workshop = scanContext({
      id: 'workshop',
      starts_at: '2026-08-24T09:00:00-04:00',
      ends_at: '2026-08-24T17:00:00-04:00',
    });
    const dinner = scanContext({
      id: 'dinner',
      starts_at: '2026-08-24T19:00:00-04:00',
      ends_at: '2026-08-24T21:00:00-04:00',
    });

    expect(scannableContexts([lunch, workshop, dinner]).map(c => c.id))
      .toEqual(['workshop', 'lunch']);
  });

  it("falls back to today's contexts, scheduled ones before unscheduled", () => {
    const registration = scanContext({
      id: 'registration',
      starts_at: '2026-08-24T08:00:00-04:00',
      ends_at: '2026-08-24T09:00:00-04:00',
    });
    const tomorrow = scanContext({
      id: 'tomorrow',
      starts_at: '2026-08-25T08:00:00-04:00',
      ends_at: '2026-08-25T09:00:00-04:00',
    });
    const anytime = scanContext({ id: 'anytime', position: 1 });
    const alsoAnytime = scanContext({ id: 'also-anytime', position: 0 });

    expect(scannableContexts([anytime, alsoAnytime, tomorrow, registration]).map(c => c.id))
      .toEqual(['registration', 'also-anytime', 'anytime']);
  });

  it('keeps every context when none belongs to today', () => {
    const yesterday = scanContext({ id: 'yesterday', starts_at: '2026-08-23T08:00:00-04:00' });
    const tomorrow = scanContext({ id: 'tomorrow', starts_at: '2026-08-25T08:00:00-04:00' });

    expect(scannableContexts([tomorrow, yesterday]).map(c => c.id))
      .toEqual(['yesterday', 'tomorrow']);
  });
});

describe('queued offline outcome', () => {
  const base = {
    attemptId: 'attempt-1',
    rawData: 'raw',
    source: 'qr' as const,
    participant: participant(),
    scanContext: context,
  };

  it('is a distinct, non-retryable outcome that does not claim a check-in', () => {
    const result = queuedResult({ ...base, alreadyScannedLocally: false, firstScannedAt: 'x' });

    expect(result.outcome).toBe('queued');
    expect(result.retryable).toBe(false);
    expect(result.message).toBe('Will sync when back online');
    expect(result.alreadyScannedLocally).toBe(false);
    expect(result.firstScannedAt).toBeUndefined();
  });

  it('says when this device already has a scan of the person in the context', () => {
    const result = queuedResult({
      ...base,
      alreadyScannedLocally: true,
      firstScannedAt: '2026-08-24T09:00:00Z',
    });

    expect(result.outcome).toBe('queued');
    expect(result.message).toBe('Already scanned here on this device. Will sync when back online');
    expect(result.firstScannedAt).toBe('2026-08-24T09:00:00Z');
  });

  it('finds a prior scan in the cached roster for the same context only', () => {
    const scanned = participant({
      scans_by_context: [{
        scan_context_id: context.id,
        scan_context_name: context.name,
        checks_in: true,
        is_airport: false,
        scan_count: 1,
        first_scanned_at: '2026-08-24T09:00:00Z',
      }],
    });

    expect(cachedPriorScan(scanned, context.id)).toEqual({ firstScannedAt: '2026-08-24T09:00:00Z' });
    expect(cachedPriorScan(scanned, 'other-context')).toBeNull();
    expect(cachedPriorScan(participant(), context.id)).toBeNull();
    expect(cachedPriorScan(undefined, context.id)).toBeNull();
    expect(cachedPriorScan(participant({ checked_in_at: '2026-08-24T08:00:00Z' }), undefined))
      .toEqual({ firstScannedAt: '2026-08-24T08:00:00Z' });
  });

  it('queues only failures that may succeed later', () => {
    expect(isRetryableScanError(new TypeError('Network request failed'))).toBe(true);
    expect(isRetryableScanError(Object.assign(new Error('timeout'), { status: 0 }))).toBe(true);
    expect(isRetryableScanError(Object.assign(new Error('busy'), { status: 503 }))).toBe(true);
    expect(isRetryableScanError(Object.assign(new Error('missing'), { status: 404 }))).toBe(false);
    expect(isRetryableScanError(new Error('Unrecognised QR code'))).toBe(false);
  });
});

describe('nfcScanTarget', () => {
  it('sends only the Attend external record to the badge endpoint', () => {
    expect(nfcScanTarget('tok-123', true)).toEqual({ kind: 'badge', identifier: 'tok-123' });
  });

  it('accepts an Attend link from a URI or text record', () => {
    expect(nfcScanTarget('attend://checkin/0a1b2c3d-0000-4000-8000-000000000001', false)).toEqual({
      kind: 'participant',
      identifier: '0a1b2c3d-0000-4000-8000-000000000001',
    });
  });

  it('rejects any other NDEF content instead of treating it as a badge token', () => {
    expect(nfcScanTarget('https://example.com/menu', false)).toBeNull();
    expect(nfcScanTarget('hello world', false)).toBeNull();
  });
});
