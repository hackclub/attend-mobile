import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { canSwitchEvents, groupSwitcherEvents } from '../services/eventSwitcher';
import { syncService } from '../services/sync';
import type { Ticket } from '../types';

// Tickets aren't part of the offline cache; this keeps the last list for the
// session so the switcher opens on it while a fresh one loads.
let lastTickets: { userId: string; tickets: Ticket[] } | null = null;

/**
 * The events the switcher lists: events the user organizes (cached, then
 * fresh from GET /events) and their own tickets (GET /tickets).
 */
export function useSwitcherEvents() {
  const { state, setEvents } = useApp();
  const user = state.auth.user;
  const userId = user?.id ?? null;
  const isParticipant = !!user?.is_participant;
  const [tickets, setTickets] = useState<Ticket[]>(() =>
    lastTickets && lastTickets.userId === userId ? lastTickets.tickets : []
  );
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const cacheGeneration = syncService.getCacheGeneration();
    await Promise.allSettled([
      api.getEvents().then(async (fresh) => {
        setEvents(fresh);
        await syncService.cacheEvents(fresh, cacheGeneration);
      }),
      isParticipant && userId
        ? api.getMyTickets().then((fresh) => {
            lastTickets = { userId, tickets: fresh };
            setTickets(fresh);
          })
        : Promise.resolve(),
    ]);
    setIsLoading(false);
  }, [isParticipant, setEvents, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(
    () => groupSwitcherEvents(state.events, isParticipant ? tickets : []),
    [isParticipant, state.events, tickets]
  );

  // A current event that has dropped off the list (it just ended) still
  // leaves somewhere else to go.
  const currentId = state.currentEvent?.id;
  const currentListed = !currentId || groups.organising.some((event) => event.id === currentId);
  const canSwitch = canSwitchEvents(groups)
    || (!currentListed && groups.organising.length + groups.attending.length > 0);

  return {
    groups,
    canSwitch,
    isLoading,
    refresh: load,
  };
}
