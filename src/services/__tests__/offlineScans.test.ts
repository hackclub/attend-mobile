import AsyncStorage from '@react-native-async-storage/async-storage';
import { asyncStorage, STORAGE_KEYS } from '../storage';
import type { CreateScanResponse } from '../../types';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('../api', () => {
  class ApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return {
    api: { createScan: jest.fn(), createNfcScan: jest.fn() },
    ApiError,
  };
});

import { api, ApiError } from '../api';
import { OfflineScanQueue, type QueuedScan } from '../offlineScans';

const createScan = api.createScan as jest.MockedFunction<typeof api.createScan>;
const createNfcScan = api.createNfcScan as jest.MockedFunction<typeof api.createNfcScan>;

function scan(id: string, scannedAt: string, overrides: Partial<QueuedScan> = {}): Omit<QueuedScan, 'failures'> {
  return {
    clientScanId: id,
    eventId: 'event-1',
    kind: 'participant',
    identifier: `T.TICKET${id.toUpperCase()}`,
    scanContextId: 'context-1',
    source: 'qr',
    scannedAt,
    verdict: 'valid',
    ...overrides,
  };
}

const accepted = (id: string) => ({ participant: { participant_event_id: `pe-${id}` } }) as unknown as CreateScanResponse;
const offline = () => Object.assign(new Error('fetch failed: The Internet connection appears to be offline.'));

describe('OfflineScanQueue', () => {
  let queue: OfflineScanQueue;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    queue = new OfflineScanQueue();
  });

  it('keeps scans across a restart, once each', async () => {
    await queue.enqueue(scan('a', '2026-11-24T10:00:00Z'));
    await queue.enqueue(scan('a', '2026-11-24T10:00:00Z'));

    const restarted = new OfflineScanQueue();
    expect((await restarted.all()).map(s => s.clientScanId)).toEqual(['a']);
    expect(await restarted.pendingCount()).toBe(1);
  });

  it('sends the oldest first, under the original id and time, and forgets what Attend accepted', async () => {
    await queue.enqueue(scan('later', '2026-11-24T10:05:00Z'));
    await queue.enqueue(scan('badge', '2026-11-24T10:01:00Z', { kind: 'badge', identifier: 'badge-token' }));
    await queue.enqueue(scan('first', '2026-11-24T10:00:00Z'));
    createScan.mockImplementation(async (_event, _id, options) => accepted(options.clientScanId!));
    createNfcScan.mockImplementation(async (_event, _id, options) => accepted(options.clientScanId!));
    const sent: string[] = [];
    queue.onSent(queued => sent.push(queued.clientScanId));

    await queue.flush();

    expect(sent).toEqual(['first', 'badge', 'later']);
    expect(createScan).toHaveBeenCalledWith('event-1', 'T.TICKETFIRST', expect.objectContaining({
      clientScanId: 'first',
      scannedAt: '2026-11-24T10:00:00Z',
      scanContextId: 'context-1',
    }));
    expect(createNfcScan).toHaveBeenCalledWith('event-1', 'badge-token', expect.objectContaining({ clientScanId: 'badge' }));
    expect(await queue.all()).toEqual([]);
    expect(await asyncStorage.get(STORAGE_KEYS.PENDING_SCANS)).toEqual([]);
  });

  it('stops at the first sign of no connection and keeps the rest', async () => {
    await queue.enqueue(scan('a', '2026-11-24T10:00:00Z'));
    await queue.enqueue(scan('b', '2026-11-24T10:01:00Z'));
    createScan.mockRejectedValueOnce(offline());

    await queue.flush();

    expect(createScan).toHaveBeenCalledTimes(1);
    expect(await queue.pendingCount()).toBe(2);
  });

  it.each([401, 426, 429, 0])('waits rather than giving up on a %i', async status => {
    await queue.enqueue(scan('a', '2026-11-24T10:00:00Z'));
    createScan.mockRejectedValueOnce(new ApiError('later', status));

    await queue.flush();

    expect(await queue.pendingCount()).toBe(1);
    expect((await queue.all())[0].rejected).toBeUndefined();
  });

  it('keeps a scan Attend turned down, out of the way of the rest', async () => {
    await queue.enqueue(scan('forged', '2026-11-24T10:00:00Z'));
    await queue.enqueue(scan('good', '2026-11-24T10:01:00Z'));
    createScan
      .mockRejectedValueOnce(new ApiError('This is not a valid ticket for this event', 422))
      .mockResolvedValueOnce(accepted('good'));

    await queue.flush();

    expect(await queue.all()).toEqual([
      expect.objectContaining({ clientScanId: 'forged', rejected: 'This is not a valid ticket for this event' }),
    ]);
    expect(await queue.pendingCount()).toBe(0);

    await queue.flush();
    expect(createScan).toHaveBeenCalledTimes(2);

    await queue.dismiss('forged');
    expect(await queue.all()).toEqual([]);
  });

  it('gives up on a scan the server keeps failing on, after five tries', async () => {
    await queue.enqueue(scan('a', '2026-11-24T10:00:00Z'));
    createScan.mockRejectedValue(new ApiError('Server error (500)', 500));

    for (let i = 0; i < 4; i++) await queue.flush();
    expect(await queue.all()).toEqual([expect.objectContaining({ failures: 4 })]);
    expect((await queue.all())[0].rejected).toBeUndefined();

    await queue.flush();
    expect(await queue.all()).toEqual([expect.objectContaining({ failures: 5, rejected: 'Attend kept failing on this scan.' })]);
  });

  it('shares one run between overlapping flushes', async () => {
    await queue.enqueue(scan('a', '2026-11-24T10:00:00Z'));
    let release: (value: CreateScanResponse) => void = () => {};
    createScan.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));

    const first = queue.flush();
    const second = queue.flush();
    release(accepted('a'));
    await Promise.all([first, second]);

    expect(createScan).toHaveBeenCalledTimes(1);
  });

  it('tells listeners when the queue changes, and forgets it after sign-out', async () => {
    const changes = jest.fn();
    queue.subscribe(changes);

    await queue.enqueue(scan('a', '2026-11-24T10:00:00Z'));
    expect(changes).toHaveBeenCalled();

    await AsyncStorage.clear();
    queue.forget();
    expect(await queue.pendingCount()).toBe(0);
  });
});
