import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { canSwitchEvents, groupSwitcherEvents, switcherEventCount } from '../services/eventSwitcher';
import { syncService } from '../services/sync';
import type { Event, Ticket } from '../types';
import { resetSwitcherEventsCache, switcherCache, type SwitcherLoadKey } from './switcherEventsCache';

// The Overview and the switcher both hold this hook, and opening one from the
// other used to fetch everything twice. They share one load: a load in flight
// is joined, and one that finished within STALE_MS is reused. A manual
// refresh always fetches.
const STALE_MS = 60_000;
type LoadKey = SwitcherLoadKey;

function isFresh(key: LoadKey): boolean {
  const { lastLoad } = switcherCache;
  return !!lastLoad && lastLoad.key === key && Date.now() - lastLoad.at < STALE_MS;
}

function ticketsFor(userId: LoadKey): Ticket[] {
  const { lastTickets } = switcherCache;
  return lastTickets && lastTickets.userId === userId ? lastTickets.tickets : [];
}

/** Resolves to whether any part of the load failed. */
function loadShared(key: LoadKey, setEvents: (events: Event[]) => void, force: boolean): Promise<boolean> {
  if (switcherCache.inflight && switcherCache.inflight.key === key) return switcherCache.inflight.promise;
  if (!force && isFresh(key)) return Promise.resolve(switcherCache.lastLoad!.failed);
  const userId = key;
  const generation = switcherCache.generation;
  const promise = (async () => {
    const cacheGeneration = syncService.getCacheGeneration();
    const results = await Promise.allSettled([
      api.getEvents().then(async (fresh) => {
        // Signed out (or the cache was cleared) while this was loading: the
        // events belong to the old session, so they're dropped, the same way
        // cacheEvents drops its write.
        if (syncService.getCacheGeneration() !== cacheGeneration) return;
        setEvents(fresh);
        await syncService.cacheEvents(fresh, cacheGeneration);
      }),
      userId
        ? api.getMyTickets().then((fresh) => {
            if (generation !== switcherCache.generation) return;
            switcherCache.lastTickets = { userId, tickets: fresh };
          })
        : Promise.resolve(),
    ]);
    const failed = results.some((result) => result.status === 'rejected');
    if (generation === switcherCache.generation) switcherCache.lastLoad = { key, at: Date.now(), failed };
    return failed;
  })();
  switcherCache.inflight = { key, promise };
  void promise.finally(() => {
    if (switcherCache.inflight?.promise === promise) switcherCache.inflight = null;
  });
  return promise;
}

export { resetSwitcherEventsCache };

/**
 * The events the switcher lists: events the user organizes (cached, then
 * fresh from GET /events) and their own tickets (GET /tickets). Tickets are
 * fetched for everyone signed in: an organizer can hold tickets too, and the
 * user's participant flag can lag behind a new registration.
 */
export function useSwitcherEvents() {
  const { state, setEvents } = useApp();
  const user = state.auth.user;
  const userId = user?.id ?? null;
  const [tickets, setTickets] = useState<Ticket[]>(() => ticketsFor(userId));
  // A recent shared load is already on screen: no spinner for it.
  const [isLoading, setIsLoading] = useState(() => !isFresh(userId));
  // The last load (or part of it) failed, so an empty list may not be real.
  const [loadFailed, setLoadFailed] = useState(() => (isFresh(userId) ? switcherCache.lastLoad!.failed : false));

  const load = useCallback(
    async (force: boolean) => {
      const failed = await loadShared(userId, setEvents, force);
      setTickets(ticketsFor(userId));
      setLoadFailed(failed);
      setIsLoading(false);
    },
    [setEvents, userId]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  // A manual refresh (pull, Retry) shows as loading again.
  const refresh = useCallback(async () => {
    setIsLoading(true);
    await load(true);
  }, [load]);

  const groups = useMemo(() => groupSwitcherEvents(state.events, tickets), [state.events, tickets]);

  // More than one entry, ended events included. A current event missing from
  // every group (access removed) still leaves somewhere else to go.
  const currentId = state.currentEvent?.id;
  const currentListed = !currentId
    || groups.organising.some((event) => event.id === currentId)
    || groups.past.some((entry) => entry.kind === 'organising' && entry.event.id === currentId);
  const canSwitch = canSwitchEvents(groups) || (!currentListed && switcherEventCount(groups) > 0);

  return {
    groups,
    canSwitch,
    isLoading,
    loadFailed,
    refresh,
  };
}
