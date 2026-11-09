import { isPastEvent } from './eventDates';
import type { Event, Ticket } from '../types';

export interface SwitcherGroups {
  /** Events the user staffs, from GET /events. */
  organising: Event[];
  /** The user's own tickets, from GET /tickets. */
  attending: Ticket[];
}

const startTime = (event: Pick<Event, 'starts_at'>) => {
  const time = event.starts_at ? new Date(event.starts_at).getTime() : NaN;
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
};

const byStart = (a: Pick<Event, 'starts_at' | 'name'>, b: Pick<Event, 'starts_at' | 'name'>) =>
  startTime(a) - startTime(b) || a.name.localeCompare(b.name);

/**
 * What the event switcher lists: upcoming and running events, soonest first,
 * in two groups. Past events are left out of both.
 */
export function groupSwitcherEvents(
  events: Event[],
  tickets: Ticket[],
  now = new Date()
): SwitcherGroups {
  return {
    organising: events.filter((event) => !isPastEvent(event, now)).sort(byStart),
    attending: tickets
      .filter((ticket) => !isPastEvent(ticket.event, now))
      .sort((a, b) => byStart(a.event, b.event)),
  };
}

/** One entry in total means there is nothing to switch to. */
export function canSwitchEvents(groups: SwitcherGroups): boolean {
  return groups.organising.length + groups.attending.length > 1;
}
