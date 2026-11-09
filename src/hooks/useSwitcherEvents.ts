import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { canSwitchEvents, groupSwitcherEvents, switcherEventCount } from '../services/eventSwitcher';
import { syncService } from '../services/sync';
import type { Ticket } from '../types';

// Tickets aren't part of the offline cache; this keeps the last list for the
// session so the switcher opens on it while a fresh one loads.
let lastTickets: { userId: string; tickets: Ticket[] } | null = null;

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
  const [tickets, setTickets] = useState<Ticket[]>(() =>
    lastTickets && lastTickets.userId === userId ? lastTickets.tickets : []
  );
  const [isLoading, setIsLoading] = useState(true);
  // The last load (or part of it) failed, so an empty list may not be real.
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    const cacheGeneration = syncService.getCacheGeneration();
    const results = await Promise.allSettled([
      api.getEvents().then(async (fresh) => {
        setEvents(fresh);
        await syncService.cacheEvents(fresh, cacheGeneration);
      }),
      userId
        ? api.getMyTickets().then((fresh) => {
            lastTickets = { userId, tickets: fresh };
            setTickets(fresh);
          })
        : Promise.resolve(),
    ]);
    setLoadFailed(results.some((result) => result.status === 'rejected'));
    setIsLoading(false);
  }, [setEvents, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A manual refresh (pull, Retry) shows as loading again.
  const refresh = useCallback(async () => {
    setIsLoading(true);
    await load();
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
