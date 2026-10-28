import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { syncService } from '../services/sync';
import type { ScanContext } from '../types';

/**
 * An event's scan contexts: the cached copy straight away, then the server's.
 * Shares the scanner's cache, so whichever screen loads first warms the other.
 */
export function useEventScanContexts(eventId: string | null | undefined) {
  const [contexts, setContexts] = useState<ScanContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setContexts([]);
    if (!eventId) {
      setIsLoading(false);
      return;
    }
    const activeEventId = eventId;
    const cacheGeneration = syncService.getCacheGeneration();

    async function load() {
      setIsLoading(true);
      const cached = await syncService.getCachedScanContexts(activeEventId).catch(() => []);
      if (!cancelled && cached.length > 0) setContexts(cached);
      try {
        const fresh = await api.getScanContexts(activeEventId);
        if (cancelled) return;
        setContexts(fresh);
        void syncService.cacheScanContexts(activeEventId, fresh, cacheGeneration);
      } catch {
        // Offline: the cached copy (if any) stands.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return { contexts, isLoading };
}
