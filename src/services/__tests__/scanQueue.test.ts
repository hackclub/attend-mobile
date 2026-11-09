import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { asyncStorage, STORAGE_KEYS } from '../storage';
import type { CreateScanResponse, Participant } from '../../types';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('../api', () => ({
  api: {
    createScan: jest.fn(),
    createNfcScan: jest.fn(),
  },
}));

import { api } from '../api';
import { ScanQueue, isPermanentRejection, type EnqueueInput, type ScanQueueEvent } from '../scanQueue';

const mockCreateScan = api.createScan as jest.MockedFunction<typeof api.createScan>;
const mockCreateNfcScan = api.createNfcScan as jest.MockedFunction<typeof api.createNfcScan>;
const mockNetFetch = NetInfo.fetch as jest.Mock;
const mockNetListen = NetInfo.addEventListener as jest.Mock;

const EVENT_ID = 'evt-1';
const USER_ID = 'user-1';

class StatusError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function input(id: string, overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  return {
    clientScanId: id,
    eventId: EVENT_ID,
    kind: 'participant',
    identifier: `person-${id}`,
    participantEventId: `pe-${id}`,
    scanContextId: 'ctx-1',
    source: 'qr',
    scannedAt: `2026-08-24T09:00:0${id.slice(-1)}Z`,
    ...overrides,
  };
}

function response(outcome: 'scanned' | 'already_scanned'): CreateScanResponse {
  return {
    success: true,
    outcome,
    first_scan_in_context: outcome === 'scanned',
    scan: { id: 'scan', scanned_at: 'now', created_at: 'now' },
    participant: { participant_event_id: 'pe-1' } as Participant,
  };
}

let queue: ScanQueue;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockCreateScan.mockReset();
  mockCreateNfcScan.mockReset();
  mockNetFetch.mockResolvedValue({ isConnected: true });
  queue = new ScanQueue();
  await queue.setUser(USER_ID);
});

describe('scanQueue persistence', () => {
  it('stores queued scans per event in AsyncStorage, oldest first', async () => {
    await queue.enqueue(input('a1'));
    await queue.enqueue(input('a2'));
    await queue.enqueue(input('b1', { eventId: 'evt-2' }));

    const stored = await asyncStorage.get<{ clientScanId: string }[]>(STORAGE_KEYS.SCAN_QUEUE(EVENT_ID));
    expect(stored?.map(item => item.clientScanId)).toEqual(['a1', 'a2']);

    // A new instance stands in for a relaunched app.
    const relaunched = new ScanQueue();
    await relaunched.setUser(USER_ID);
    expect((await relaunched.getPending(EVENT_ID)).map(item => item.clientScanId)).toEqual(['a1', 'a2']);
    expect((await relaunched.getPending('evt-2')).map(item => item.clientScanId)).toEqual(['b1']);
    expect(await relaunched.getPendingCount()).toBe(3);
  });

  it('keeps the original client_scan_id and scanned_at', async () => {
    await queue.enqueue(input('a1', { scannedAt: '2026-08-24T08:59:59.123Z' }));

    const [item] = await queue.getPending(EVENT_ID);
    expect(item).toMatchObject({
      clientScanId: 'a1',
      scannedAt: '2026-08-24T08:59:59.123Z',
      attempts: 0,
    });
  });

  it('ignores a second enqueue with the same client_scan_id', async () => {
    expect(await queue.enqueue(input('a1'))).toBe(true);
    expect(await queue.enqueue(input('a1', { identifier: 'someone-else' }))).toBe(false);

    expect(await queue.getPending(EVENT_ID)).toHaveLength(1);
  });

  it('finds an earlier queued scan of the same person in the same context', async () => {
    await queue.enqueue(input('a1'));

    expect(await queue.findQueuedScan(EVENT_ID, {
      identifier: 'other-qr-id', participantEventId: 'pe-a1', scanContextId: 'ctx-1',
    })).toMatchObject({ clientScanId: 'a1' });
    expect(await queue.findQueuedScan(EVENT_ID, {
      identifier: 'person-a1', scanContextId: 'ctx-2',
    })).toBeNull();
  });

  it('clear removes queued and failed scans and notifies', async () => {
    await queue.enqueue(input('a1'));
    mockCreateScan.mockRejectedValueOnce(new StatusError('Not found', 404));
    await queue.flush(EVENT_ID);
    await queue.enqueue(input('a2'));
    const events: ScanQueueEvent[] = [];
    queue.subscribe(event => events.push(event));

    await queue.clear();

    expect(await queue.getPending(EVENT_ID)).toEqual([]);
    expect(await queue.getFailed(EVENT_ID)).toEqual([]);
    expect(await queue.getPendingCount()).toBe(0);
    expect(events).toContainEqual({ type: 'changed', eventId: EVENT_ID, pending: 0, failed: 0 });
  });
});

describe('scanQueue per-user scoping', () => {
  it('tags each item with the signed-in user', async () => {
    await queue.enqueue(input('a1'));

    const stored = await asyncStorage.get<{ userId?: string }[]>(STORAGE_KEYS.SCAN_QUEUE(EVENT_ID));
    expect(stored?.[0].userId).toBe(USER_ID);
  });

  it('refuses to queue with nobody signed in', async () => {
    await queue.setUser(null);
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await queue.enqueue(input('a1'))).toBe(false);
    expect(await asyncStorage.get(STORAGE_KEYS.SCAN_QUEUE(EVENT_ID))).toBeNull();
  });

  it("never sends another user's scans, and discards them when that user isn't signed in", async () => {
    await queue.enqueue(input('a1'));
    mockCreateScan.mockResolvedValue(response('scanned'));

    await queue.setUser('user-2');
    expect(await queue.flush()).toEqual([]);
    expect(mockCreateScan).not.toHaveBeenCalled();
    expect(await queue.getPendingCount()).toBe(0);
    expect(await asyncStorage.get(STORAGE_KEYS.SCAN_QUEUE(EVENT_ID))).toBeNull();
  });

  it("skips a foreign item still in storage rather than sending it", async () => {
    await asyncStorage.set(STORAGE_KEYS.SCAN_QUEUE(EVENT_ID), [
      { ...input('x1'), queuedAt: 'now', attempts: 0, userId: 'user-2' },
      { ...input('a1'), queuedAt: 'now', attempts: 0, userId: USER_ID },
    ]);
    mockCreateScan.mockResolvedValue(response('scanned'));

    const [report] = await queue.flush(EVENT_ID);

    expect(mockCreateScan).toHaveBeenCalledTimes(1);
    expect(mockCreateScan.mock.calls[0][1]).toBe('person-a1');
    expect(report).toMatchObject({ scanned: 1, remaining: 0 });
  });

  it('keeps items across sign-out (setUser(null)) and sends them when the same user returns', async () => {
    await queue.enqueue(input('a1'));
    await queue.setUser(null);
    expect(await queue.flush()).toEqual([]);

    await queue.setUser(USER_ID);
    mockCreateScan.mockResolvedValue(response('scanned'));
    await queue.flush();

    expect(mockCreateScan).toHaveBeenCalledTimes(1);
  });

  it('adopts untagged items from an older build only for a restored session', async () => {
    const legacy = { ...input('a1'), queuedAt: 'now', attempts: 0 };
    await asyncStorage.set(STORAGE_KEYS.SCAN_QUEUE(EVENT_ID), [legacy]);

    const restored = new ScanQueue();
    await restored.setUser(USER_ID, { adoptUntagged: true });
    expect(await restored.getPendingCount()).toBe(1);

    await asyncStorage.set(STORAGE_KEYS.SCAN_QUEUE(EVENT_ID), [legacy]);
    const fresh = new ScanQueue();
    await fresh.setUser(USER_ID);
    expect(await fresh.getPendingCount()).toBe(0);
    expect(await asyncStorage.get(STORAGE_KEYS.SCAN_QUEUE(EVENT_ID))).toBeNull();
  });
});

describe('scanQueue.flush', () => {
  it('sends items in order with their original ids and removes them on success', async () => {
    await queue.enqueue(input('a1'));
    await queue.enqueue(input('a2', { kind: 'badge', identifier: 'badge-token', source: 'nfc' }));
    await queue.enqueue(input('a3'));
    mockCreateScan.mockResolvedValue(response('scanned'));
    mockCreateNfcScan.mockResolvedValue(response('scanned'));
    const confirmed: string[] = [];
    queue.subscribe(event => {
      if (event.type === 'confirmed') confirmed.push(event.item.clientScanId);
    });

    const [report] = await queue.flush(EVENT_ID);

    expect(confirmed).toEqual(['a1', 'a2', 'a3']);
    expect(mockCreateScan).toHaveBeenNthCalledWith(1, EVENT_ID, 'person-a1', {
      scanContextId: 'ctx-1',
      clientScanId: 'a1',
      source: 'qr',
      scannedAt: '2026-08-24T09:00:01Z',
    });
    expect(mockCreateNfcScan).toHaveBeenCalledWith(EVENT_ID, 'badge-token', expect.objectContaining({
      clientScanId: 'a2',
      source: 'nfc',
    }));
    expect(report).toEqual({
      eventId: EVENT_ID, scanned: 3, alreadyScanned: 0, failed: [], remaining: 0, offline: false,
    });
    expect(await queue.getPending(EVENT_ID)).toEqual([]);
  });

  it('counts already_scanned responses as resolved', async () => {
    await queue.enqueue(input('a1'));
    mockCreateScan.mockResolvedValueOnce(response('already_scanned'));

    const [report] = await queue.flush(EVENT_ID);

    expect(report).toMatchObject({ scanned: 0, alreadyScanned: 1, remaining: 0 });
    expect(await queue.getPending(EVENT_ID)).toEqual([]);
  });

  it('keeps items and stops at the first network failure, preserving order', async () => {
    await queue.enqueue(input('a1'));
    await queue.enqueue(input('a2'));
    await queue.enqueue(input('a3'));
    mockCreateScan
      .mockResolvedValueOnce(response('scanned'))
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    const [report] = await queue.flush(EVENT_ID);

    expect(mockCreateScan).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({ scanned: 1, remaining: 2, offline: true, failed: [] });
    const pending = await queue.getPending(EVENT_ID);
    expect(pending.map(item => item.clientScanId)).toEqual(['a2', 'a3']);
    expect(pending[0]).toMatchObject({ attempts: 1, lastError: 'Network request failed' });
  });

  it.each([0, 401, 408, 429, 500, 503])('keeps an item the server answered with status %i', async status => {
    await queue.enqueue(input('a1'));
    mockCreateScan.mockRejectedValueOnce(new StatusError('nope', status));

    const [report] = await queue.flush(EVENT_ID);

    expect(report).toMatchObject({ remaining: 1, offline: true, failed: [] });
    expect(await queue.getFailed(EVENT_ID)).toEqual([]);
  });

  it('moves a permanent 4xx to the failed list and carries on with the rest', async () => {
    await queue.enqueue(input('a1'));
    await queue.enqueue(input('a2'));
    mockCreateScan
      .mockRejectedValueOnce(new StatusError('Participant not found', 404))
      .mockResolvedValueOnce(response('scanned'));

    const [report] = await queue.flush(EVENT_ID);

    expect(report.scanned).toBe(1);
    expect(report.remaining).toBe(0);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]).toMatchObject({
      clientScanId: 'a1', status: 404, error: 'Participant not found',
    });
    expect(await queue.getPending(EVENT_ID)).toEqual([]);
    expect((await queue.getFailed(EVENT_ID)).map(item => item.clientScanId)).toEqual(['a1']);

    // The failed scan stays deduplicated against a re-enqueue.
    expect(await queue.enqueue(input('a1'))).toBe(false);

    await queue.dismissFailed(EVENT_ID, 'a1');
    expect(await queue.getFailed(EVENT_ID)).toEqual([]);
  });

  it('does not send while the device reports no connection', async () => {
    await queue.enqueue(input('a1'));
    mockNetFetch.mockResolvedValueOnce({ isConnected: false });

    const [report] = await queue.flush();

    expect(mockCreateScan).not.toHaveBeenCalled();
    expect(report).toMatchObject({ eventId: EVENT_ID, remaining: 1, offline: true });
  });

  it('flushes every event when no event is given', async () => {
    await queue.enqueue(input('a1'));
    await queue.enqueue(input('b1', { eventId: 'evt-2' }));
    mockCreateScan.mockResolvedValue(response('scanned'));

    const reports = await queue.flush();

    expect(reports.map(report => report.eventId).sort()).toEqual([EVENT_ID, 'evt-2']);
    expect(await queue.getPendingCount()).toBe(0);
  });

  it('shares one flush between concurrent callers and does not send an item twice', async () => {
    await queue.enqueue(input('a1'));
    let resolveSend!: (value: CreateScanResponse) => void;
    mockCreateScan.mockImplementationOnce(() => new Promise(resolve => {
      resolveSend = resolve;
    }));

    const first = queue.flush(EVENT_ID);
    const second = queue.flush(EVENT_ID);
    await new Promise(resolve => setImmediate(resolve));
    resolveSend(response('scanned'));
    await Promise.all([first, second]);

    expect(mockCreateScan).toHaveBeenCalledTimes(1);
    expect(await queue.getPending(EVENT_ID)).toEqual([]);
  });

  it('does not write back an item that was in flight when the queue was cleared', async () => {
    await queue.enqueue(input('a1'));
    let rejectSend!: (error: unknown) => void;
    mockCreateScan.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectSend = reject;
    }));

    const flushing = queue.flush(EVENT_ID);
    await new Promise(resolve => setImmediate(resolve));
    await queue.clear();
    rejectSend(new StatusError('gone', 404));
    await flushing;

    expect(await queue.getPending(EVENT_ID)).toEqual([]);
    expect(await queue.getFailed(EVENT_ID)).toEqual([]);
  });
});

describe('scanQueue automatic flushing', () => {
  beforeEach(() => {
    mockNetListen.mockReset();
    mockNetListen.mockReturnValue(jest.fn());
  });

  function appStateSource() {
    let listener: ((state: string) => void) | null = null;
    const remove = jest.fn();
    return {
      source: {
        addEventListener: jest.fn((_: 'change', l: (state: string) => void) => {
          listener = l;
          return { remove };
        }),
      },
      emit: (state: string) => listener?.(state),
      remove,
    };
  }

  const settle = () => new Promise(resolve => setImmediate(resolve));

  it('flushes on start, on reconnect and on returning to the foreground', async () => {
    await queue.enqueue(input('a1'));
    mockCreateScan.mockRejectedValue(new TypeError('Network request failed'));
    const appState = appStateSource();

    const stop = queue.start(appState.source);
    await settle();
    await settle();
    expect(mockCreateScan).toHaveBeenCalledTimes(1);

    const netListener = mockNetListen.mock.calls[0][0] as (state: { isConnected: boolean }) => void;
    netListener({ isConnected: false });
    netListener({ isConnected: true });
    await settle();
    await settle();
    expect(mockCreateScan).toHaveBeenCalledTimes(2);

    mockCreateScan.mockResolvedValue(response('scanned'));
    appState.emit('active');
    await settle();
    await settle();
    expect(mockCreateScan).toHaveBeenCalledTimes(3);
    expect(await queue.getPending(EVENT_ID)).toEqual([]);

    stop();
    expect(appState.remove).toHaveBeenCalled();
  });

  it('retries periodically with backoff while items remain', async () => {
    jest.useFakeTimers();
    try {
      await queue.enqueue(input('a1'));
      mockCreateScan.mockRejectedValue(new TypeError('Network request failed'));
      const stop = queue.start(appStateSource().source);
      await jest.advanceTimersByTimeAsync(0);
      expect(mockCreateScan).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(5_000);
      expect(mockCreateScan).toHaveBeenCalledTimes(2);

      // Second consecutive failure doubles the delay.
      await jest.advanceTimersByTimeAsync(5_000);
      expect(mockCreateScan).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(mockCreateScan).toHaveBeenCalledTimes(3);

      mockCreateScan.mockResolvedValue(response('scanned'));
      await jest.advanceTimersByTimeAsync(20_000);
      expect(mockCreateScan).toHaveBeenCalledTimes(4);
      expect(await queue.getPending(EVENT_ID)).toEqual([]);

      // Nothing left: no more retries.
      await jest.advanceTimersByTimeAsync(10 * 60_000);
      expect(mockCreateScan).toHaveBeenCalledTimes(4);
      stop();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('isPermanentRejection', () => {
  it('treats only definite client errors as permanent', () => {
    expect(isPermanentRejection(new StatusError('x', 404))).toBe(true);
    expect(isPermanentRejection(new StatusError('x', 422))).toBe(true);
    expect(isPermanentRejection(new StatusError('x', 403))).toBe(true);
    expect(isPermanentRejection(new StatusError('x', 401))).toBe(false);
    expect(isPermanentRejection(new StatusError('x', 429))).toBe(false);
    expect(isPermanentRejection(new StatusError('x', 500))).toBe(false);
    expect(isPermanentRejection(new StatusError('timeout', 0))).toBe(false);
    expect(isPermanentRejection(new TypeError('Network request failed'))).toBe(false);
    expect(isPermanentRejection(new Error('unknown'))).toBe(false);
  });
});
