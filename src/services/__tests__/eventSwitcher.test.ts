import { canSwitchEvents, groupSwitcherEvents } from '../eventSwitcher';
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
