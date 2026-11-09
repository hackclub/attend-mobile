import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';

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
 */
export function useRemote<T>(load: (() => Promise<T>) | null, key: string) {
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
      settle({ state: 'ready', data: await load() });
    } catch (error) {
      settle(error instanceof ApiError && error.isForbidden ? { state: 'forbidden' } : { state: 'error' });
    }
  }, [key, load]);

  const value: Remote<T> = entry && entry.key === key ? entry.value : { state: 'loading' };
  return [value, reload] as const;
}
