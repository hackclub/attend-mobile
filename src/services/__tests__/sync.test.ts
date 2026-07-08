import AsyncStorage from '@react-native-async-storage/async-storage';
import { asyncStorage, STORAGE_KEYS } from '../storage';
import type { RemoteScan, ScansSyncPage } from '../../types';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('../api', () => ({
  api: {
    getScans: jest.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

import { api } from '../api';
import { syncService } from '../sync';

const mockGetScans = api.getScans as jest.MockedFunction<typeof api.getScans>;

const EVENT_ID = 'evt-1';

function scan(id: string, createdAt: string): RemoteScan {
  return { id, created_at: createdAt, participant_event_id: `pe-${id}` };
}

function page(scans: RemoteScan[], syncedAt: string, hasMore: boolean): ScansSyncPage {
  return { scans, synced_at: syncedAt, has_more: hasMore };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockGetScans.mockReset();
});

describe('syncService.syncScans', () => {
  it('follows has_more across a 3-page sync, ending with every scan exactly once and the cursor at the final synced_at', async () => {
    const initialCursor = '2026-07-08T10:00:00.000000Z';
    await asyncStorage.set(STORAGE_KEYS.SCAN_SYNC_CURSOR(EVENT_ID), initialCursor);

    mockGetScans
      .mockResolvedValueOnce(
        page([scan('a', '2026-07-08T10:01:00.100000Z'), scan('b', '2026-07-08T10:02:00.200000Z')], '2026-07-08T10:02:00.200000Z', true)
      )
      .mockResolvedValueOnce(
        // boundary scan 'b' re-delivered on the next page — must dedupe by id
        page([scan('b', '2026-07-08T10:02:00.200000Z'), scan('c', '2026-07-08T10:03:00.300000Z')], '2026-07-08T10:03:00.300000Z', true)
      )
      .mockResolvedValueOnce(
        page([scan('d', '2026-07-08T10:04:00.400000Z')], '2026-07-08T10:05:00.000000Z', false)
      );

    const scans = await syncService.syncScans(EVENT_ID);

    expect(mockGetScans).toHaveBeenCalledTimes(3);
    expect(mockGetScans).toHaveBeenNthCalledWith(1, EVENT_ID, initialCursor);
    expect(mockGetScans).toHaveBeenNthCalledWith(2, EVENT_ID, '2026-07-08T10:02:00.200000Z');
    expect(mockGetScans).toHaveBeenNthCalledWith(3, EVENT_ID, '2026-07-08T10:03:00.300000Z');

    // every scan exactly once
    expect(scans.map(s => s.id).sort()).toEqual(['a', 'b', 'c', 'd']);

    // cursor persisted as the final synced_at, verbatim
    const cursor = await asyncStorage.get<string>(STORAGE_KEYS.SCAN_SYNC_CURSOR(EVENT_ID));
    expect(cursor).toBe('2026-07-08T10:05:00.000000Z');

    // scans persisted for offline use
    const cached = await asyncStorage.get<RemoteScan[]>(STORAGE_KEYS.SCANS(EVENT_ID));
    expect(cached?.map(s => s.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does a single request when has_more is false', async () => {
    const initialCursor = '2026-07-08T10:00:00.000000Z';
    await asyncStorage.set(STORAGE_KEYS.SCAN_SYNC_CURSOR(EVENT_ID), initialCursor);

    mockGetScans.mockResolvedValueOnce(
      page([scan('a', '2026-07-08T10:01:00.000000Z')], '2026-07-08T10:06:00.000000Z', false)
    );

    const scans = await syncService.syncScans(EVENT_ID);

    expect(mockGetScans).toHaveBeenCalledTimes(1);
    expect(scans.map(s => s.id)).toEqual(['a']);
    expect(await asyncStorage.get<string>(STORAGE_KEYS.SCAN_SYNC_CURSOR(EVENT_ID))).toBe(
      '2026-07-08T10:06:00.000000Z'
    );
  });

  it('bootstraps without a cursor via a single no-since request', async () => {
    mockGetScans.mockResolvedValueOnce(
      // no-since responses are newest-first; merge must not rely on order
      page(
        [scan('newer', '2026-07-08T10:05:00.000000Z'), scan('older', '2026-07-08T10:01:00.000000Z')],
        '2026-07-08T10:10:00.000000Z',
        false
      )
    );

    const scans = await syncService.syncScans(EVENT_ID);

    expect(mockGetScans).toHaveBeenCalledTimes(1);
    expect(mockGetScans).toHaveBeenCalledWith(EVENT_ID, undefined);
    expect(scans.map(s => s.id).sort()).toEqual(['newer', 'older']);
    expect(await asyncStorage.get<string>(STORAGE_KEYS.SCAN_SYNC_CURSOR(EVENT_ID))).toBe(
      '2026-07-08T10:10:00.000000Z'
    );
  });

  it('merges idempotently with previously cached scans', async () => {
    await asyncStorage.set(STORAGE_KEYS.SCANS(EVENT_ID), [scan('a', '2026-07-08T09:00:00.000000Z')]);
    await asyncStorage.set(STORAGE_KEYS.SCAN_SYNC_CURSOR(EVENT_ID), '2026-07-08T09:00:00.000000Z');

    mockGetScans.mockResolvedValueOnce(
      page(
        [scan('a', '2026-07-08T09:00:00.000000Z'), scan('b', '2026-07-08T09:30:00.500000Z')],
        '2026-07-08T09:45:00.000000Z',
        false
      )
    );

    const scans = await syncService.syncScans(EVENT_ID);
    expect(scans.map(s => s.id).sort()).toEqual(['a', 'b']);
  });

  it('stops if the server reports has_more but the cursor does not advance', async () => {
    const cursor = '2026-07-08T10:00:00.123456Z';
    await asyncStorage.set(STORAGE_KEYS.SCAN_SYNC_CURSOR(EVENT_ID), cursor);

    mockGetScans.mockResolvedValue(
      page([scan('a', cursor)], cursor, true)
    );

    await syncService.syncScans(EVENT_ID);
    expect(mockGetScans).toHaveBeenCalledTimes(1);
  });

  it('round-trips fractional-second cursors through storage verbatim', async () => {
    const fractional = '2026-07-08T20:15:30.123456Z';
    await asyncStorage.set(STORAGE_KEYS.SCAN_SYNC_CURSOR(EVENT_ID), fractional);

    // storage must not truncate or reformat the timestamp
    expect(await syncService.getScanSyncCursor(EVENT_ID)).toBe(fractional);

    mockGetScans.mockResolvedValueOnce(page([], '2026-07-08T20:16:00.654321Z', false));
    await syncService.syncScans(EVENT_ID);

    // the stored string is sent back as `since` exactly as received
    expect(mockGetScans).toHaveBeenCalledWith(EVENT_ID, fractional);
    expect(await syncService.getScanSyncCursor(EVENT_ID)).toBe('2026-07-08T20:16:00.654321Z');
  });
});
