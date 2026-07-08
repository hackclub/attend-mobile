jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { api } from '../api';

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
