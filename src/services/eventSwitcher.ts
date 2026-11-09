import { isPastEvent } from './eventDates';
import type { Event, Ticket } from '../types';

/** A past event in the switcher: one the user organized, or their ticket. */
export type PastSwitcherEntry =
  | { kind: 'organising'; event: Event }
  | { kind: 'attending'; ticket: Ticket };

export interface SwitcherGroups {
  /** Upcoming and running events the user staffs, from GET /events. */
  organising: Event[];
  /** The user's own upcoming and running tickets, from GET /tickets. */
  attending: Ticket[];
  /** Ended events from either source, most recent first. */
  past: PastSwitcherEntry[];
}

const startTime = (event: Pick<Event, 'starts_at'>) => {
  const time = event.starts_at ? new Date(event.starts_at).getTime() : NaN;
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
};

const byStart = (a: Pick<Event, 'starts_at' | 'name'>, b: Pick<Event, 'starts_at' | 'name'>) =>
  startTime(a) - startTime(b) || a.name.localeCompare(b.name);

export const pastEntryEvent = (entry: PastSwitcherEntry): Event =>
  entry.kind === 'organising' ? entry.event : entry.ticket.event;

/**
 * What the event switcher lists: upcoming and running events, soonest first,
 * split into organizing and attending, then ended events from both in one
 * Past group, most recent first.
 */
export function groupSwitcherEvents(
  events: Event[],
  tickets: Ticket[],
  now = new Date()
): SwitcherGroups {
  const past: PastSwitcherEntry[] = [
    ...events.filter((event) => isPastEvent(event, now)).map((event) => ({ kind: 'organising' as const, event })),
    ...tickets.filter((ticket) => isPastEvent(ticket.event, now)).map((ticket) => ({ kind: 'attending' as const, ticket })),
  ];
  return {
    organising: events.filter((event) => !isPastEvent(event, now)).sort(byStart),
    attending: tickets
      .filter((ticket) => !isPastEvent(ticket.event, now))
      .sort((a, b) => byStart(a.event, b.event)),
    past: past.sort((a, b) => byStart(pastEntryEvent(b), pastEntryEvent(a))),
  };
}

export function switcherEventCount(groups: SwitcherGroups): number {
  return groups.organising.length + groups.attending.length + groups.past.length;
}

/** One entry in total, past ones included, means there is nothing to switch to. */
export function canSwitchEvents(groups: SwitcherGroups): boolean {
  return switcherEventCount(groups) > 1;
}

/** Past this many events the switcher offers a search field. */
export const SWITCHER_SEARCH_THRESHOLD = 6;

const matches = (event: Pick<Event, 'name' | 'slug' | 'location_city'>, terms: string[]) => {
  const haystack = [event.name, event.slug, event.location_city]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
};

/** Every group narrowed to events whose name, slug or city match every word. */
export function filterSwitcherEvents(groups: SwitcherGroups, query: string): SwitcherGroups {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return groups;
  return {
    organising: groups.organising.filter((event) => matches(event, terms)),
    attending: groups.attending.filter((ticket) => matches(ticket.event, terms)),
    past: groups.past.filter((entry) => matches(pastEntryEvent(entry), terms)),
  };
}

/**
 * A participant's ticket list: upcoming and running events soonest first,
 * then ended ones most recent first (shown collapsed).
 */
export function groupTickets(tickets: Ticket[], now = new Date()): { upcoming: Ticket[]; past: Ticket[] } {
  const groups = groupSwitcherEvents([], tickets, now);
  return {
    upcoming: groups.attending,
    past: groups.past.flatMap((entry) => (entry.kind === 'attending' ? [entry.ticket] : [])),
  };
}

/** The badge on a ticket's card, or null for a confirmed ticket not yet used. */
export function ticketBadge(
  ticket: Pick<Ticket, 'confirmed' | 'checked_in'>
): { label: string; color: 'green' | 'grey' } | null {
  if (ticket.checked_in) return { label: 'Checked in', color: 'green' };
  if (!ticket.confirmed) return { label: 'Registration incomplete', color: 'grey' };
  return null;
}
