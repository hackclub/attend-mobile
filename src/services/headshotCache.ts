import { Image } from 'expo-image';
import { asyncStorage } from './storage';
import type { Participant } from '../types';

const PREFETCH_BATCH_SIZE = 8;
// Headshots are only warmed for later, so they wait until launch and the
// first screens have settled.
export const HEADSHOT_PREFETCH_DELAY_MS = 3_000;
// URLs already on disk, remembered across launches so only new or changed
// headshots are fetched, with when each was fetched. Capped so a long-lived
// install can't grow it forever. Stored as { url: fetchedAtMs }; an older
// plain list has no times, so it's ignored and everything fetched once more.
const PREFETCHED_URLS_KEY = 'headshot_prefetched_urls';
const MAX_REMEMBERED_URLS = 5_000;
// expo-image's disk cache evicts on its own (size and age), and nothing
// tells us when. Past this age an entry may be gone, so it's fetched again.
export const PREFETCH_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

// Insertion order is fetch order (an entry is moved to the end when fetched
// again), so the cap keeps the most recent.
const prefetchedUrls = new Map<string, number>();

function isPrefetched(url: string, now: number): boolean {
  const at = prefetchedUrls.get(url);
  return at !== undefined && now - at < PREFETCH_MAX_AGE_MS;
}

function markPrefetched(url: string, at: number): void {
  prefetchedUrls.delete(url);
  prefetchedUrls.set(url, at);
}
let prefetchQueue: Promise<void> = Promise.resolve();
let cacheGeneration = 0;
let hydration: Promise<void> | null = null;

function hydrate(): Promise<void> {
  const generation = cacheGeneration;
  hydration ??= asyncStorage.get<Record<string, number>>(PREFETCHED_URLS_KEY)
    .then(stored => {
      if (generation !== cacheGeneration) return;
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return;
      const now = Date.now();
      Object.entries(stored)
        .filter(([, at]) => typeof at === 'number' && now - at < PREFETCH_MAX_AGE_MS)
        .sort(([, a], [, b]) => a - b)
        .forEach(([url, at]) => {
          // Fetched this launch before hydrating: that time is newer.
          if (!prefetchedUrls.has(url)) markPrefetched(url, at);
        });
    })
    .catch(() => undefined);
  return hydration;
}

function persist(): Promise<void> {
  const now = Date.now();
  const entries = [...prefetchedUrls]
    .filter(([, at]) => now - at < PREFETCH_MAX_AGE_MS)
    .slice(-MAX_REMEMBERED_URLS);
  prefetchedUrls.clear();
  entries.forEach(([url, at]) => prefetchedUrls.set(url, at));
  return asyncStorage.set(PREFETCHED_URLS_KEY, Object.fromEntries(entries)).catch(() => undefined);
}

/**
 * Saves the participants' headshots to the disk cache (not memory: most are
 * never shown this session), skipping any already fetched, on this launch
 * or an earlier one within PREFETCH_MAX_AGE_MS.
 */
export function prefetchHeadshots(participants: Participant[]): Promise<void> {
  const requestedUrls = [...new Set(
    participants
      .map(participant => participant.headshot_url)
      .filter((url): url is string => !!url)
  )];
  const generation = cacheGeneration;

  const run = prefetchQueue.catch(() => undefined).then(async () => {
    if (generation !== cacheGeneration) return;
    await hydrate();
    const now = Date.now();
    const urls = requestedUrls.filter(url => !isPrefetched(url, now));
    let added = false;

    try {
      for (let index = 0; index < urls.length; index += PREFETCH_BATCH_SIZE) {
        if (generation !== cacheGeneration) return;
        const batch = urls.slice(index, index + PREFETCH_BATCH_SIZE);
        const succeeded = await Image.prefetch(batch, { cachePolicy: 'disk' });
        if (succeeded && generation === cacheGeneration) {
          const at = Date.now();
          batch.forEach(url => markPrefetched(url, at));
          added = true;
        }
      }
    } finally {
      if (added && generation === cacheGeneration) await persist();
    }
  });
  prefetchQueue = run.catch(() => undefined);
  return run;
}

/**
 * Runs prefetchHeadshots after `delayMs`, then once the JS thread is idle.
 * Returns a cancel function, so a newer roster replaces a pending run.
 */
export function scheduleHeadshotPrefetch(
  participants: Participant[],
  delayMs = HEADSHOT_PREFETCH_DELAY_MS
): () => void {
  let cancelled = false;
  let idleHandle: number | undefined;
  const start = () => {
    if (cancelled) return;
    void prefetchHeadshots(participants).catch(error => {
      console.warn('[Images] Headshot prefetch failed:', error);
    });
  };
  const timer = setTimeout(() => {
    if (typeof requestIdleCallback === 'function') {
      idleHandle = requestIdleCallback(start);
    } else {
      start();
    }
  }, delayMs);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (idleHandle !== undefined && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(idleHandle);
    }
  };
}

export async function clearHeadshotCache(): Promise<void> {
  cacheGeneration += 1;
  await prefetchQueue.catch(() => undefined);
  prefetchedUrls.clear();
  // Nothing to load back: the remembered list is being deleted.
  hydration = Promise.resolve();
  await Promise.allSettled([
    asyncStorage.remove(PREFETCHED_URLS_KEY),
    Image.clearMemoryCache(),
    Image.clearDiskCache(),
  ]);
}
