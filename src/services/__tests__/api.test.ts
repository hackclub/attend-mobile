jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { api } from '../api';
import { forbiddenParticipants } from '../eventAccess';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('api.getScans', () => {
  it('passes the since cursor verbatim, including fractional seconds', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ scans: [], synced_at: '2026-07-08T20:16:00.000001Z', has_more: false })
    );

    await api.getScans('evt-1', '2026-07-08T20:15:30.123456Z');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/events/evt-1/scans');
    expect(url).toContain(`since=${encodeURIComponent('2026-07-08T20:15:30.123456Z')}`);
  });

  it('omits since when no cursor is given', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ scans: [], synced_at: '2026-07-08T20:16:00Z' })
    );

    await api.getScans('evt-1');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/events/evt-1/scans');
    expect(url).not.toContain('since=');
  });

  it('returns synced_at untouched and defaults has_more to false', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        scans: [{ id: 's1', created_at: '2026-07-08T20:15:30.123456Z' }],
        synced_at: '2026-07-08T20:15:30.123456Z',
      })
    );

    const result = await api.getScans('evt-1', '2026-07-08T20:00:00.000000Z');

    expect(result.synced_at).toBe('2026-07-08T20:15:30.123456Z');
    expect(result.has_more).toBe(false);
    expect(result.scans).toHaveLength(1);
  });

  it('surfaces has_more from the response', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ scans: [], synced_at: '2026-07-08T20:15:30.123456Z', has_more: true })
    );

    const result = await api.getScans('evt-1', '2026-07-08T20:00:00.000000Z');
    expect(result.has_more).toBe(true);
  });
});

describe('api.createScan', () => {
  it('sends the stable attempt id, source, context, and timestamp', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        outcome: 'scanned',
        first_scan_in_context: true,
        first_scanned_at: '2026-08-24T09:41:00Z',
        deduplicated: false,
        scan: {
          id: 'scan-1',
          participant_event_id: 'participant-1',
          scanned_at: '2026-08-24T09:41:00Z',
          created_at: '2026-08-24T09:41:00Z',
        },
        scan_context: {
          id: 'context-1',
          name: 'Exit',
          checks_in: false,
          is_airport: false,
          position: 1,
        },
        participant: {
          participant_id: 'person-1',
          participant_event_id: 'participant-1',
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
        },
      })
    );

    const response = await api.createScan('event-1', 'participant-1', {
      scanContextId: 'context-1',
      clientScanId: 'attempt-1',
      source: 'qr',
      scannedAt: '2026-08-24T09:41:00Z',
    });

    expect(response.outcome).toBe('scanned');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).toEqual({
      participant_id: 'participant-1',
      scan_context_id: 'context-1',
      client_scan_id: 'attempt-1',
      source: 'qr',
      scanned_at: '2026-08-24T09:41:00Z',
    });
  });

  it('times out as an unconfirmed network failure', async () => {
    jest.useFakeTimers();
    mockFetch.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));

    const request = api.createScan('event-1', 'participant-1', {
      scanContextId: 'context-1',
      clientScanId: 'attempt-timeout',
      source: 'qr',
      scannedAt: '2026-08-24T09:41:00Z',
    });
    const expectation = expect(request).rejects.toMatchObject({
      status: 0,
      message: 'Request timed out. No scan was confirmed.',
    });

    await jest.advanceTimersByTimeAsync(8_000);
    await expectation;
    jest.useRealTimers();
  });

  it('aborts an in-flight scan when its event is retired', async () => {
    mockFetch.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      if (options?.signal?.aborted) {
        reject(new Error('aborted'));
        return;
      }
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const controller = new AbortController();
    const request = api.createScan('event-1', 'participant-1', {
      scanContextId: 'context-1',
      clientScanId: 'attempt-aborted',
      source: 'qr',
      scannedAt: '2026-08-24T09:41:00Z',
      signal: controller.signal,
    });

    controller.abort();

    await expect(request).rejects.toThrow('aborted');
  });
});

describe('api.getParticipants', () => {
  it('sends the delta cursor and returns the server sync cursor', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ participants: [], synced_at: '2026-08-24T09:45:00Z' })
    );

    const page = await api.getParticipants('event-1', '2026-08-24T09:40:00Z');

    expect(mockFetch.mock.calls[0][0]).toContain(
      `updated_since=${encodeURIComponent('2026-08-24T09:40:00Z')}`
    );
    expect(page).toEqual({ participants: [], synced_at: '2026-08-24T09:45:00Z' });
  });
});

function errorResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe('api.getTravelCalendar', () => {
  it('strips the address-hidden sentinel instead of passing it off as a route', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        dates: ['2026-07-15'],
        entries: [
          { id: 'a', mode: 'car', route: 'Address hidden' },
          { id: 'b', mode: 'car', route: '  Address hidden  ' },
        ],
      })
    );

    const data = await api.getTravelCalendar('evt-1');

    expect(data.entries.map(entry => entry.route)).toEqual([null, null]);
    expect(data.entries.every(entry => entry.routeRedacted)).toBe(true);
  });

  it('leaves a real route alone', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        dates: [],
        entries: [{ id: 'a', mode: 'plane', route: 'LHR → JFK' }],
      })
    );

    const [entry] = (await api.getTravelCalendar('evt-1')).entries;

    expect(entry.route).toBe('LHR → JFK');
    expect(entry.routeRedacted).toBeUndefined();
  });

  it('tolerates a payload with no entries', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ dates: [] }));

    await expect(api.getTravelCalendar('evt-1')).resolves.toMatchObject({ entries: [] });
  });
});

describe('participant access tracking', () => {
  beforeEach(() => {
    forbiddenParticipants.reset();
  });

  it('records the refusal when the participants API answers 403', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(403, { error: 'Forbidden' }));

    await expect(api.getParticipants('evt-1')).rejects.toThrow('Forbidden');
    expect(forbiddenParticipants.has('evt-1')).toBe(true);
  });

  it('records it for search and for a single participant too', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(403, { error: 'Forbidden' }));
    await expect(api.searchParticipants('evt-1', 'ada')).rejects.toThrow();
    expect(forbiddenParticipants.has('evt-1')).toBe(true);

    forbiddenParticipants.reset();
    mockFetch.mockResolvedValueOnce(errorResponse(403, { error: 'Forbidden' }));
    await expect(api.getParticipant('evt-1', 'pe-1')).rejects.toThrow();
    expect(forbiddenParticipants.has('evt-1')).toBe(true);
  });

  it('leaves the flag alone for failures that are not a refusal', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500, { error: 'Boom' }));

    await expect(api.getParticipants('evt-1')).rejects.toThrow();
    expect(forbiddenParticipants.has('evt-1')).toBe(false);
  });

  it('clears the flag once a request succeeds again', async () => {
    forbiddenParticipants.mark('evt-1');
    mockFetch.mockResolvedValueOnce(jsonResponse({ participants: [], synced_at: '' }));

    await api.getParticipants('evt-1');

    expect(forbiddenParticipants.has('evt-1')).toBe(false);
  });

  it('pre-marks events whose role the events payload reports as read-only', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        events: [
          { id: 'evt-ro', name: 'A', slug: 'a', role: 'read_only' },
          { id: 'evt-limited', name: 'B', slug: 'b', role: 'limited' },
        ],
      })
    );

    await api.getEvents();

    expect(forbiddenParticipants.has('evt-ro')).toBe(true);
    expect(forbiddenParticipants.has('evt-limited')).toBe(false);
  });
});
