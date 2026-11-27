import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';
import { remoteCache } from '../services/remoteCache';

/** A remote panel: loading, loaded, refused for this role, or unreachable. */
export type Remote<T> =
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  | { state: 'forbidden' }
  | { state: 'error' };

/**
 * One remote panel's state, keyed by what it was loaded for (e.g. the event
 * id). Nothing loads on its own: call `reload` (on focus, on pull to
 * refresh). Until an answer for the current key arrives the panel reads as
 * loading, and only the newest request may settle it, so an answer for a
 * previous event, or an older request that resolves late, is dropped instead
 * of leaving the panel stuck on loading or showing stale data.
 *
 * With a `cacheKey` (services/remoteCache), the last answer shows at once
 * instead of loading, a reload joins a load already running for it (one
 * started as a switch began), and a failed reload keeps showing that answer
 * rather than an error. Only a refusal replaces it.
 */
export function useRemote<T>(load: (() => Promise<T>) | null, key: string, cacheKey?: string) {
  const [entry, setEntry] = useState<{ key: string; value: Remote<T> } | null>(null);
  const latestKey = useRef(key);
  useEffect(() => {
    latestKey.current = key;
  }, [key]);
  const latestRequest = useRef(0);

  const reload = useCallback(async () => {
    if (!load) return;
    const request = ++latestRequest.current;
    const settle = (value: Remote<T>) => {
      if (request !== latestRequest.current || key !== latestKey.current) return;
      setEntry({ key, value });
    };
    try {
      settle({ state: 'ready', data: await (cacheKey ? remoteCache.load(cacheKey, load) : load()) });
    } catch (error) {
      const forbidden = error instanceof ApiError && error.isForbidden;
      if (cacheKey && forbidden) remoteCache.forget(cacheKey);
      const cached = cacheKey && !forbidden ? remoteCache.get<T>(cacheKey) : undefined;
      if (cached !== undefined) settle({ state: 'ready', data: cached });
      else settle(forbidden ? { state: 'forbidden' } : { state: 'error' });
    }
  }, [cacheKey, key, load]);

  let value: Remote<T>;
  if (entry && entry.key === key) {
    value = entry.value;
  } else {
    const cached = load && cacheKey ? remoteCache.get<T>(cacheKey) : undefined;
    value = cached !== undefined ? { state: 'ready', data: cached } : { state: 'loading' };
  }
  return [value, reload] as const;
}
