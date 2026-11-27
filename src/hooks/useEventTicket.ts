import { createContext, useContext } from 'react';
import type { Ticket } from '../types';

/**
 * The organizer's own ticket for the event whose tabs are showing, or null.
 * The tabs provide it (it decides whether there's a Ticket tab at all), and
 * the pass in that tab reads it here rather than from route params, which
 * are fixed when the tab is first created and would go stale on a switch.
 */
export const EventTicketContext = createContext<Ticket | null>(null);

export function useEventTicket(): Ticket | null {
  return useContext(EventTicketContext);
}
