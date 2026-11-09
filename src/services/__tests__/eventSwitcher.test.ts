import { canSwitchEvents, filterSwitcherEvents, groupSwitcherEvents, switcherEventCount } from '../eventSwitcher';
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
  it('splits organising and attending, soonest first, without past events', () => {
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
    expect(groups.organising.map((e) => e.id)).toEqual(['running', 'later', 'undated']);
    expect(groups.attending.map((t) => t.id)).toEqual(['t-soon']);
  });
});

describe('canSwitchEvents', () => {
  it('needs more than one entry across both groups', () => {
    expect(canSwitchEvents({ organising: [event('a')], attending: [] })).toBe(false);
    expect(canSwitchEvents({ organising: [], attending: [] })).toBe(false);
    expect(canSwitchEvents({ organising: [event('a')], attending: [ticket('t', event('b'))] })).toBe(true);
  });
});

describe('filterSwitcherEvents', () => {
  const groups = {
    organising: [
      { ...event('scrapyard-sf'), name: 'Scrapyard San Francisco', location_city: 'San Francisco' },
      { ...event('haven-cbr'), name: 'Haven Canberra', location_city: 'Canberra' },
    ],
    attending: [ticket('t1', { ...event('campfire-cbr'), name: 'Campfire', location_city: 'Canberra' })],
  };

  it('keeps everything for an empty query', () => {
    expect(filterSwitcherEvents(groups, '  ')).toBe(groups);
  });

  it('matches name, slug and city, case-insensitively, on every word', () => {
    const byCity = filterSwitcherEvents(groups, 'canberra');
    expect(byCity.organising.map((e) => e.id)).toEqual(['haven-cbr']);
    expect(byCity.attending.map((t) => t.id)).toEqual(['t1']);
    expect(filterSwitcherEvents(groups, 'SCRAP san').organising.map((e) => e.id)).toEqual(['scrapyard-sf']);
    expect(switcherEventCount(filterSwitcherEvents(groups, 'nowhere'))).toBe(0);
  });
});
