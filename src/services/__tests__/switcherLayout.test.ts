import type { SwitcherGroups } from '../eventSwitcher';
import {
  cardHeightOf,
  centredPaddingTop,
  centreTargetTop,
  contentHeight,
  currentRowIndex,
  initialScrollOffset,
  rowOffsets,
  switcherCardHeight,
  switcherCardScale,
  switcherRows,
  type SwitcherMetrics,
} from '../switcherLayout';
import type { Event, Ticket } from '../../types';

const event = (id: string): Event => ({ id, name: id, slug: id, timezone: 'UTC' });
const ticket = (id: string, e: Event): Ticket => ({ id, event: e } as Ticket);

const metrics: SwitcherMetrics = {
  cardHeight: 100,
  pastCardHeight: 60,
  cardGap: 10,
  headerHeight: 40,
  paddingTop: 8,
  paddingBottom: 20,
};

const groups: SwitcherGroups = {
  organising: [event('a'), event('b')],
  attending: [ticket('t1', event('c'))],
  past: [{ kind: 'organising', event: event('old') }, { kind: 'attending', ticket: ticket('t2', event('older')) }],
};

const keys = (rows: ReturnType<typeof switcherRows>) => rows.map((row) => row.key);
const loaded = { loading: false };

describe('switcherRows', () => {
  it('lists Organizing, Attending, then Past, each under its heading', () => {
    expect(keys(switcherRows(groups, { eventId: 'a' }, loaded))).toEqual([
      'organising',
      'event-a',
      'event-b',
      'attending',
      'ticket-t1',
      'past',
      'event-old',
      'ticket-t2',
    ]);
  });

  it('marks ended events as past', () => {
    const past = switcherRows(groups, {}, loaded)
      .filter((row) => (row.kind === 'event' || row.kind === 'ticket') && row.past)
      .map((row) => row.key);
    expect(past).toEqual(['event-old', 'ticket-t2']);
  });

  it('marks the event as current, or the ticket when opened from a pass', () => {
    const fromEvent = switcherRows(groups, { eventId: 'c' }, loaded);
    expect(currentRowIndex(fromEvent)).toBe(-1);
    const fromPass = switcherRows(groups, { eventId: 'c', ticketId: 't1' }, loaded);
    expect(fromPass[currentRowIndex(fromPass)].key).toBe('ticket-t1');
  });

  it('shows placeholders only while nothing has loaded', () => {
    const empty: SwitcherGroups = { organising: [], attending: [], past: [] };
    expect(switcherRows(empty, {}, { loading: true }).every((row) => row.kind === 'placeholder')).toBe(true);
    expect(switcherRows(groups, {}, { loading: true })[0].kind).toBe('header');
  });
});

describe('rowOffsets and contentHeight', () => {
  it('stacks the fixed heights after the top padding, past cards shorter', () => {
    const rows = switcherRows(groups, {}, loaded);
    // header, card, card, header, card, header, past card, past card
    expect(rowOffsets(rows, metrics)).toEqual([8, 48, 158, 268, 308, 418, 458, 528]);
    expect(contentHeight(rows, metrics)).toBe(8 + 40 + 110 * 2 + 40 + 110 + 40 + 70 * 2 + 20);
  });

  it('keeps a current past card full height', () => {
    const rows = switcherRows(groups, { eventId: 'old' }, loaded);
    expect(cardHeightOf(rows[6], metrics)).toBe(metrics.cardHeight);
    expect(cardHeightOf(rows[7], metrics)).toBe(metrics.pastCardHeight);
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

describe('centredPaddingTop', () => {
  const rows = switcherRows(groups, {}, loaded);
  const content = contentHeight(rows, metrics);

  it('centres a list shorter than the viewport', () => {
    expect(centredPaddingTop(rows, metrics, content + 200)).toBe(metrics.paddingTop + 100);
  });

  it('keeps the usual padding when the list fills the viewport', () => {
    expect(centredPaddingTop(rows, metrics, content - 50)).toBe(metrics.paddingTop);
  });
});

describe('centreTargetTop', () => {
  it('puts the card in the middle of the viewport', () => {
    expect(centreTargetTop(800, 200)).toBe(300);
  });
});

describe('card size', () => {
  it('is the banner photo scaled to the card width', () => {
    // 412 wide: a 232 photo, scaled by 380 / 412.
    expect(switcherCardScale(412)).toBeCloseTo(380 / 412);
    expect(switcherCardHeight(412)).toBe(Math.round(232 * (380 / 412)));
  });
});
