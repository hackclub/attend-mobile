import type { SwitcherGroups } from '../eventSwitcher';
import {
  bannerTargetTop,
  contentHeight,
  currentIsPast,
  currentRowIndex,
  initialScrollOffset,
  rowOffsets,
  switcherRows,
  type SwitcherMetrics,
} from '../switcherLayout';
import type { Event, Ticket } from '../../types';

const event = (id: string): Event => ({ id, name: id, slug: id, timezone: 'UTC' });
const ticket = (id: string, e: Event): Ticket => ({ id, event: e } as Ticket);

const metrics: SwitcherMetrics = {
  cardHeight: 100,
  cardGap: 10,
  headerHeight: 40,
  toggleHeight: 50,
  paddingTop: 8,
  paddingBottom: 20,
};

const groups: SwitcherGroups = {
  organising: [event('a'), event('b')],
  attending: [ticket('t1', event('c'))],
  past: [{ kind: 'organising', event: event('old') }, { kind: 'attending', ticket: ticket('t2', event('older')) }],
};

const keys = (rows: ReturnType<typeof switcherRows>) => rows.map((row) => row.key);

describe('switcherRows', () => {
  const closed = { pastOpen: false, searching: false, loading: false };

  it('lists Organizing, then Attending, then a collapsed Past', () => {
    expect(keys(switcherRows(groups, { eventId: 'a' }, closed))).toEqual([
      'organising',
      'event-a',
      'event-b',
      'attending',
      'ticket-t1',
      'past',
    ]);
  });

  it('lists the Past cards while open or searching', () => {
    const open = keys(switcherRows(groups, {}, { ...closed, pastOpen: true }));
    expect(open.slice(-3)).toEqual(['past', 'event-old', 'ticket-t2']);
    const searching = switcherRows(groups, {}, { ...closed, searching: true });
    expect(keys(searching)).toContain('event-old');
    expect(searching.find((row) => row.kind === 'past')).toMatchObject({ open: true, toggleable: false });
  });

  it('marks the event as current, or the ticket when opened from a pass', () => {
    const fromEvent = switcherRows(groups, { eventId: 'c' }, closed);
    expect(currentRowIndex(fromEvent)).toBe(-1);
    const fromPass = switcherRows(groups, { eventId: 'c', ticketId: 't1' }, closed);
    expect(fromPass[currentRowIndex(fromPass)].key).toBe('ticket-t1');
  });

  it('shows placeholders only while nothing has loaded', () => {
    const empty: SwitcherGroups = { organising: [], attending: [], past: [] };
    expect(switcherRows(empty, {}, { ...closed, loading: true }).every((row) => row.kind === 'placeholder')).toBe(true);
    expect(switcherRows(groups, {}, { ...closed, loading: true })[0].kind).toBe('header');
  });
});

describe('currentIsPast', () => {
  it('is true for an ended event or ticket that is current', () => {
    expect(currentIsPast(groups, { eventId: 'old' })).toBe(true);
    expect(currentIsPast(groups, { ticketId: 't2' })).toBe(true);
    expect(currentIsPast(groups, { eventId: 'a' })).toBe(false);
  });
});

describe('rowOffsets and contentHeight', () => {
  it('stacks the fixed heights after the top padding', () => {
    const rows = switcherRows(groups, {}, { pastOpen: false, searching: false, loading: false });
    // header, card, card, header, card, past toggle
    expect(rowOffsets(rows, metrics)).toEqual([8, 48, 158, 268, 308, 418]);
    expect(contentHeight(rows, metrics)).toBe(8 + 40 + 110 + 110 + 40 + 110 + 50 + 20);
  });
});

describe('initialScrollOffset', () => {
  it('scrolls so the card lands on the target', () => {
    expect(initialScrollOffset({ cardTop: 500, targetTop: 100, contentHeight: 2000, viewportHeight: 800 })).toBe(400);
  });

  it('never scrolls above the start', () => {
    expect(initialScrollOffset({ cardTop: 48, targetTop: 100, contentHeight: 2000, viewportHeight: 800 })).toBe(0);
  });

  it('never scrolls past the end, so a card near the end sits lower', () => {
    expect(initialScrollOffset({ cardTop: 1900, targetTop: 100, contentHeight: 2000, viewportHeight: 800 })).toBe(1200);
  });

  it('stays at the start when everything fits', () => {
    expect(initialScrollOffset({ cardTop: 300, targetTop: 0, contentHeight: 600, viewportHeight: 800 })).toBe(0);
  });
});

describe('bannerTargetTop', () => {
  it('centres the card on the banner, relative to the viewport', () => {
    // Banner 0–300 (centre 150), card 100 tall, viewport from 80.
    expect(bannerTargetTop({ bannerTop: 0, bannerBottom: 300, viewportTop: 80 }, 100)).toBe(20);
  });

  it('can be above the viewport when the banner is', () => {
    expect(bannerTargetTop({ bannerTop: -200, bannerBottom: 100, viewportTop: 136 }, 100)).toBeLessThan(0);
  });
});
