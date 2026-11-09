import {
  canSwitchEvents,
  filterSwitcherEvents,
  groupSwitcherEvents,
  groupTickets,
  pastEntryEvent,
  switcherEventCount,
  ticketBadge,
} from '../eventSwitcher';
import type { Event, Ticket } from '../../types';

const now = new Date('2026-11-09T00:00:00Z');

const event = (id: string, starts_at?: string, ends_at?: string): Event => ({
  id,
  name: id,
  slug: id,
  starts_at,
  ends_at,
  timezone: 'UTC',
});

const ticket = (id: string, e: Event): Ticket => ({ id, event: e } as Ticket);

describe('groupSwitcherEvents', () => {
  const groups = groupSwitcherEvents(
    [
      event('later', '2026-12-01T00:00:00Z'),
      event('past', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'),
      event('running', '2026-11-08T00:00:00Z', '2026-11-10T00:00:00Z'),
      event('undated'),
    ],
    [
      ticket('t-past', event('old', '2026-01-01T00:00:00Z')),
      ticket('t-soon', event('campfire', '2026-11-20T00:00:00Z')),
    ],
    now
  );

  it('splits upcoming organising and attending, soonest first', () => {
    expect(groups.organising.map((e) => e.id)).toEqual(['running', 'later', 'undated']);
    expect(groups.attending.map((t) => t.id)).toEqual(['t-soon']);
  });

  it('puts ended events from both sources in Past, most recent first', () => {
    expect(groups.past).toEqual([
      { kind: 'organising', event: expect.objectContaining({ id: 'past' }) },
      { kind: 'attending', ticket: expect.objectContaining({ id: 't-past' }) },
    ]);
    expect(groups.past.map((entry) => pastEntryEvent(entry).id)).toEqual(['past', 'old']);
  });
});

describe('canSwitchEvents', () => {
  const none = { organising: [], attending: [], past: [] };

  it('needs more than one entry across every group', () => {
    expect(canSwitchEvents({ ...none, organising: [event('a')] })).toBe(false);
    expect(canSwitchEvents(none)).toBe(false);
    expect(canSwitchEvents({ ...none, organising: [event('a')], attending: [ticket('t', event('b'))] })).toBe(true);
  });

  it('counts past events, so an ended event is somewhere to switch to', () => {
    const past = [{ kind: 'organising' as const, event: event('old') }];
    expect(canSwitchEvents({ ...none, past })).toBe(false);
    expect(canSwitchEvents({ ...none, organising: [event('a')], past })).toBe(true);
    expect(switcherEventCount({ ...none, organising: [event('a')], past })).toBe(2);
  });
});

describe('filterSwitcherEvents', () => {
  const groups = {
    organising: [
      { ...event('scrapyard-sf'), name: 'Scrapyard San Francisco', location_city: 'San Francisco' },
      { ...event('haven-cbr'), name: 'Haven Canberra', location_city: 'Canberra' },
    ],
    attending: [ticket('t1', { ...event('campfire-cbr'), name: 'Campfire', location_city: 'Canberra' })],
    past: [{ kind: 'attending' as const, ticket: ticket('t0', { ...event('haven-syd'), name: 'Haven Sydney', location_city: 'Sydney' }) }],
  };

  it('keeps everything for an empty query', () => {
    expect(filterSwitcherEvents(groups, '  ')).toBe(groups);
  });

  it('matches name, slug and city, case-insensitively, on every word', () => {
    const byCity = filterSwitcherEvents(groups, 'canberra');
    expect(byCity.organising.map((e) => e.id)).toEqual(['haven-cbr']);
    expect(byCity.attending.map((t) => t.id)).toEqual(['t1']);
    expect(byCity.past).toEqual([]);
    expect(filterSwitcherEvents(groups, 'haven').past.map((entry) => pastEntryEvent(entry).id)).toEqual(['haven-syd']);
    expect(filterSwitcherEvents(groups, 'SCRAP san').organising.map((e) => e.id)).toEqual(['scrapyard-sf']);
    expect(switcherEventCount(filterSwitcherEvents(groups, 'nowhere'))).toBe(0);
  });
});

describe('groupTickets', () => {
  it('lists upcoming tickets soonest first and past ones most recent first', () => {
    const later = ticket('later', event('later', '2026-12-01T00:00:00Z'));
    const soon = ticket('soon', event('soon', '2026-11-10T00:00:00Z'));
    const old = ticket('old', event('old', '2026-01-01T00:00:00Z'));
    const recent = ticket('recent', event('recent', '2026-10-01T00:00:00Z'));
    const groups = groupTickets([later, old, soon, recent], now);
    expect(groups.upcoming.map((t) => t.id)).toEqual(['soon', 'later']);
    expect(groups.past.map((t) => t.id)).toEqual(['recent', 'old']);
  });
});

describe('ticketBadge', () => {
  it('marks a checked-in ticket and an unfinished registration', () => {
    expect(ticketBadge({ confirmed: true, checked_in: true })).toEqual({ label: 'Checked in', color: 'green' });
    expect(ticketBadge({ confirmed: false, checked_in: false })).toEqual({
      label: 'Registration incomplete',
      color: 'grey',
    });
  });

  it('has nothing to say about a confirmed ticket not yet used', () => {
    expect(ticketBadge({ confirmed: true, checked_in: false })).toBeNull();
  });
});
