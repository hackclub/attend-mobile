import type { Ticket } from '../types';

// The state useSwitcherEvents shares between its users, kept apart from the
// hook so AppContext can reset it on sign-out without importing the hook's
// API and sync dependencies.

export type SwitcherLoadKey = string | null;

export const switcherCache: {
  // Tickets aren't part of the offline cache; this keeps the last list for
  // the session so the switcher opens on it while a fresh one loads.
  lastTickets: { userId: string; tickets: Ticket[] } | null;
  lastLoad: { key: SwitcherLoadKey; at: number; failed: boolean } | null;
  inflight: { key: SwitcherLoadKey; promise: Promise<boolean> } | null;
  // Bumped on every reset, so a load still in flight from the previous
  // session can't write its results back.
  generation: number;
} = {
  lastTickets: null,
  lastLoad: null,
  inflight: null,
  generation: 0,
};

/**
 * Forgets the shared load and the last tickets. Called on sign-out (and an
 * expired session), so the next user never sees the previous one's list.
 */
export function resetSwitcherEventsCache(): void {
  switcherCache.generation += 1;
  switcherCache.lastTickets = null;
  switcherCache.lastLoad = null;
  switcherCache.inflight = null;
}
