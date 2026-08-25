const mockPrefetch = jest.fn().mockResolvedValue(true);
const mockClearMemoryCache = jest.fn().mockResolvedValue(true);
const mockClearDiskCache = jest.fn().mockResolvedValue(true);

jest.mock('expo-image', () => ({
  Image: {
    prefetch: mockPrefetch,
    clearMemoryCache: mockClearMemoryCache,
    clearDiskCache: mockClearDiskCache,
  },
}));

import type { Participant } from '../../types';
import { clearHeadshotCache, prefetchHeadshots } from '../headshotCache';

function participant(id: string, headshotUrl?: string | null): Participant {
  return {
    participant_id: `person-${id}`,
    participant_event_id: `registration-${id}`,
    display_name: `Attendee ${id}`,
    full_name: `Attendee ${id}`,
    email: `attendee-${id}@example.com`,
    headshot_url: headshotUrl,
    status: 'complete',
    has_anaphylaxis_risk: false,
    requires_refrigeration: false,
    cross_contamination_risk: false,
    freedom_waiver_granted: false,
    high_support_flag: false,
    can_leave_unaccompanied: false,
    waiver_signed: true,
  };
}

beforeEach(async () => {
  await clearHeadshotCache();
  mockPrefetch.mockClear();
  mockPrefetch.mockResolvedValue(true);
  mockClearMemoryCache.mockClear();
  mockClearDiskCache.mockClear();
});

describe('prefetchHeadshots', () => {
  it('filters missing and duplicate urls and prefetches bounded batches', async () => {
    const people = [
      ...Array.from({ length: 9 }, (_, index) =>
        participant(String(index), `https://images.example/${index}`)
      ),
      participant('duplicate', 'https://images.example/0'),
      participant('missing'),
    ];

    await prefetchHeadshots(people);

    expect(mockPrefetch).toHaveBeenCalledTimes(2);
    expect(mockPrefetch.mock.calls[0][0]).toHaveLength(8);
    expect(mockPrefetch.mock.calls[1][0]).toEqual(['https://images.example/8']);
    expect(mockPrefetch).toHaveBeenCalledWith(expect.any(Array), {
      cachePolicy: 'memory-disk',
    });
  });

  it('serializes overlapping runs and skips urls cached by the first run', async () => {
    let finishFirst: ((value: boolean) => void) | undefined;
    mockPrefetch.mockImplementationOnce(() => new Promise<boolean>(resolve => {
      finishFirst = resolve;
    }));

    const first = prefetchHeadshots([
      participant('a', 'https://images.example/a'),
    ]);
    const second = prefetchHeadshots([
      participant('a', 'https://images.example/a'),
      participant('b', 'https://images.example/b'),
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockPrefetch).toHaveBeenCalledTimes(1);
    finishFirst?.(true);
    await Promise.all([first, second]);

    expect(mockPrefetch).toHaveBeenCalledTimes(2);
    expect(mockPrefetch.mock.calls[1][0]).toEqual(['https://images.example/b']);
  });

  it('retries a batch when expo-image reports that prefetch failed', async () => {
    const person = participant('retry', 'https://images.example/retry');
    mockPrefetch.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await prefetchHeadshots([person]);
    await prefetchHeadshots([person]);

    expect(mockPrefetch).toHaveBeenCalledTimes(2);
  });
});

describe('clearHeadshotCache', () => {
  it('clears both memory and disk caches', async () => {
    await clearHeadshotCache();

    expect(mockClearMemoryCache).toHaveBeenCalledTimes(1);
    expect(mockClearDiskCache).toHaveBeenCalledTimes(1);
  });
});
