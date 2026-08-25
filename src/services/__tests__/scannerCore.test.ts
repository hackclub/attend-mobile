import type { CreateScanResponse, Participant, ScanContext } from '../../types';
import {
  SameCodeGate,
  failedResult,
  parseQRCode,
  responseOutcome,
  resultFromResponse,
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
