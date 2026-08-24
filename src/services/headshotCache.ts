import { Image } from 'expo-image';
import type { Participant } from '../types';

const PREFETCH_BATCH_SIZE = 8;
const prefetchedUrls = new Set<string>();
let prefetchQueue: Promise<void> = Promise.resolve();
let cacheGeneration = 0;

export function prefetchHeadshots(participants: Participant[]): Promise<void> {
  const requestedUrls = [...new Set(
    participants
      .map(participant => participant.headshot_url)
      .filter((url): url is string => !!url)
  )];
  const generation = cacheGeneration;

  const run = prefetchQueue.catch(() => undefined).then(async () => {
    if (generation !== cacheGeneration) return;
    const urls = requestedUrls.filter(url => !prefetchedUrls.has(url));

    for (let index = 0; index < urls.length; index += PREFETCH_BATCH_SIZE) {
      if (generation !== cacheGeneration) return;
      const batch = urls.slice(index, index + PREFETCH_BATCH_SIZE);
      const succeeded = await Image.prefetch(batch, {
        cachePolicy: 'memory-disk',
      });
      if (succeeded && generation === cacheGeneration) {
        batch.forEach(url => prefetchedUrls.add(url));
      }
    }
  });
  prefetchQueue = run.catch(() => undefined);
  return run;
}

export async function clearHeadshotCache(): Promise<void> {
  cacheGeneration += 1;
  await prefetchQueue.catch(() => undefined);
  prefetchedUrls.clear();
  await Promise.allSettled([
    Image.clearMemoryCache(),
    Image.clearDiskCache(),
  ]);
}
