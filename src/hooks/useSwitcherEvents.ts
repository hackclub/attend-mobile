import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { canSwitchEvents, groupSwitcherEvents, switcherEventCount } from '../services/eventSwitcher';
import { syncService } from '../services/sync';
import type { Event, Ticket } from '../types';

// Tickets aren't part of the offline cache; this keeps the last list for the
// session so the switcher opens on it while a fresh one loads.
let lastTickets: { userId: string; tickets: Ticket[] } | null = null;

// The Overview and the switcher both hold this hook, and opening one from the
// other used to fetch everything twice. They share one load: a load in flight
// is joined, and one that finished within STALE_MS is reused. A manual
// refresh always fetches.
const STALE_MS = 60_000;
type LoadKey = string | null;
let lastLoad: { key: LoadKey; at: number; failed: boolean } | null = null;
let inflight: { key: LoadKey; promise: Promise<boolean> } | null = null;

function isFresh(key: LoadKey): boolean {
  return !!lastLoad && lastLoad.key === key && Date.now() - lastLoad.at < STALE_MS;
}

/** Resolves to whether any part of the load failed. */
function loadShared(key: LoadKey, setEvents: (events: Event[]) => void, force: boolean): Promise<boolean> {
  if (inflight && inflight.key === key) return inflight.promise;
  if (!force && isFresh(key)) return Promise.resolve(lastLoad!.failed);
  const userId = key;
  const promise = (async () => {
    const cacheGeneration = syncService.getCacheGeneration();
    const results = await Promise.allSettled([
      api.getEvents().then(async (fresh) => {
        setEvents(fresh);
        await syncService.cacheEvents(fresh, cacheGeneration);
      }),
      userId
        ? api.getMyTickets().then((fresh) => {
            lastTickets = { userId, tickets: fresh };
          })
        : Promise.resolve(),
    ]);
    const failed = results.some((result) => result.status === 'rejected');
    lastLoad = { key, at: Date.now(), failed };
    return failed;
  })();
  inflight = { key, promise };
  void promise.finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  return promise;
}

/** Test hook: forget the shared load. */
export function resetSwitcherEventsCache(): void {
  lastTickets = null;
  lastLoad = null;
  inflight = null;
}

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
  const cachedTickets = () => (lastTickets && lastTickets.userId === userId ? lastTickets.tickets : []);
  const [tickets, setTickets] = useState<Ticket[]>(cachedTickets);
  // A recent shared load is already on screen: no spinner for it.
  const [isLoading, setIsLoading] = useState(() => !isFresh(userId));
  // The last load (or part of it) failed, so an empty list may not be real.
  const [loadFailed, setLoadFailed] = useState(() => (isFresh(userId) ? lastLoad!.failed : false));

  const load = useCallback(
    async (force: boolean) => {
      const failed = await loadShared(userId, setEvents, force);
      setTickets(lastTickets && lastTickets.userId === userId ? lastTickets.tickets : []);
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
