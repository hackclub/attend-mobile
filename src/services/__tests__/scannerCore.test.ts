import type { CreateScanResponse, Participant, ScanContext } from '../../types';
import {
  SameCodeGate,
  cachedPriorScan,
  failedResult,
  invalidTicketResult,
  kioskContextChoice,
  parseQRCode,
  responseOutcome,
  resultFromResponse,
  retryableFailure,
  savedResult,
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

  // Signed by Attend's CheckinCode with a throwaway test key; the ids are made up.
  const SIGNED = 'T.AED2VKVKVK53WTGMRXO653XO53XO5Z3XVB66Q34V2V72SPD3JRKHN4OXBNR25I7BTJUMJXLV5SVSFKINXVAFGF3TRFORE5QNYCF2XWIF6OCUGZV3LXX3WPJ5DBNJZOPQ3ZCA';

  it.each([
    `ATTEND://CHECKIN/${SIGNED}`,
    `  attend://checkin/${SIGNED.toLowerCase()}\n`,
  ])('sends a signed ticket whole, and reads its registration for the cache: %s', raw => {
    expect(parseQRCode(raw)).toMatchObject({
      type: 'participant',
      id: SIGNED,
      registrationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      ticket: { keyId: '7', registrationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    });
  });

  it.each([
    'ATTEND://CHECKIN/T.',
    `ATTEND://CHECKIN/T.${'A'.repeat(20)}`,
    `ATTEND://CHECKIN/T.${'B'.repeat(132)}`,
    `ATTEND://CHECKIN/${SIGNED}!`,
  ])('rejects something that only looks like a signed ticket: %s', raw => {
    expect(parseQRCode(raw)).toBeNull();
  });
});

describe('SameCodeGate', () => {
  it('touch keeps a code suppressed while it stays in view, and ignores other codes', () => {
    const gate = new SameCodeGate(3000);
    expect(gate.accept('A', 0)).toBe(true);
    gate.touch('A', 2500);
    gate.touch('B', 2600);
    expect(gate.accept('A', 4000)).toBe(false);
    expect(gate.accept('A', 8000)).toBe(true);
    expect(gate.accept('B', 8100)).toBe(true);
  });

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

  // Attend records these like any scan; offline the same ticket is turned
  // away, so online must not show a welcome either.
  it.each(['withdrawn', 'rejected'])('flags a scan of a %s registration', (status) => {
    const result = resultFromResponse({
      attemptId: 'attempt-1',
      rawData: 'raw-code',
      source: 'qr',
      response: {
        success: true,
        outcome: 'scanned',
        first_scan_in_context: true,
        first_scanned_at: '2026-08-24T09:41:00Z',
        scan: {
          id: 'scan-1',
          participant_event_id: 'registration-1',
          scanned_at: '2026-08-24T09:41:00Z',
          created_at: '2026-08-24T09:41:00Z',
        },
        participant: participant({ status }),
      } satisfies CreateScanResponse,
      scanContext: context,
    });

    expect(result.outcome).toBe('cancelled');
    expect(result.message).toMatch(/withdrawn or rejected/);
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

  // Expo's fetch (the global one since SDK 58) throws a plain Error subclass
  // with this prefix rather than a TypeError.
  it("treats Expo's fetch errors as a network failure, not a message to show", () => {
    class FetchError extends Error {}
    const result = failedResult(new FetchError('fetch failed: The Internet connection appears to be offline.'), {
      attemptId: 'attempt-2',
      rawData: 'raw-code',
      source: 'qr',
    });

    expect(result.retryable).toBe(true);
    expect(result.message).toBe('Could not reach Attend. Try again.');
    expect(failedResult(new Error('Unrecognised QR code'), { attemptId: 'a', rawData: '', source: 'qr' }).retryable).toBe(false);
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

describe('offline results', () => {
  const input = { attemptId: 'attempt-3', rawData: 'raw-code', source: 'qr' as const, participant: participant(), scanContext: context };

  it('says what the device could tell about a scan it saved', () => {
    expect(savedResult('valid', input)).toMatchObject({ outcome: 'saved', retryable: false, participant: participant() });
    expect(savedResult('unverified', input).outcome).toBe('saved_unchecked');
    expect(savedResult('unverified', input).message).toMatch(/check their ticket another way/i);
    expect(savedResult('cancelled', input).outcome).toBe('saved_cancelled');
    expect(savedResult('cancelled', input).message).toMatch(/withdrawn or rejected/);
  });

  it('says when the device has already seen this person here, unless the ticket is cancelled', () => {
    const repeat = savedResult('valid', input, '2026-11-24T10:00:00Z');
    expect(repeat).toMatchObject({ outcome: 'already_scanned', firstScannedAt: '2026-11-24T10:00:00Z', retryable: false });
    expect(repeat.message).toMatch(/already scanned here/i);
    expect(savedResult('unverified', input, '2026-11-24T10:00:00Z').outcome).toBe('already_scanned');
    expect(savedResult('cancelled', input, '2026-11-24T10:00:00Z').outcome).toBe('saved_cancelled');
  });

  it('turns away a ticket whose signature fails, with nothing to retry', () => {
    expect(invalidTicketResult(input)).toMatchObject({ outcome: 'not_scanned', retryable: false });
    expect(invalidTicketResult(input).message).toMatch(/wasn't issued by Attend for this event/);
  });
});

describe('cachedPriorScan', () => {
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
});

describe('retryableFailure', () => {
  it('saves only failures that may succeed later', () => {
    expect(retryableFailure(new TypeError('Network request failed'))).toBe(true);
    expect(retryableFailure(new Error('fetch failed: The Internet connection appears to be offline.'))).toBe(true);
    expect(retryableFailure(Object.assign(new Error('timeout'), { status: 0 }))).toBe(true);
    expect(retryableFailure(Object.assign(new Error('busy'), { status: 503 }))).toBe(true);
    expect(retryableFailure(Object.assign(new Error('missing'), { status: 404 }))).toBe(false);
    expect(retryableFailure(new Error('Unrecognised QR code'))).toBe(false);
  });
});

describe('kioskContextChoice', () => {
  const context = (id: string) => ({ id, name: id }) as ScanContext;

  it('starts without a context when the event has none', () => {
    expect(kioskContextChoice([])).toEqual({ kind: 'start' });
  });

  it('uses the only context', () => {
    expect(kioskContextChoice([context('door')])).toEqual({ kind: 'start', context: context('door') });
  });

  it('asks staff to choose between several', () => {
    const choice = kioskContextChoice([context('door'), context('lunch')]);
    expect(choice.kind).toBe('choose');
    expect(choice.kind === 'choose' && choice.contexts.map((c) => c.id).sort()).toEqual(['door', 'lunch']);
  });
});
