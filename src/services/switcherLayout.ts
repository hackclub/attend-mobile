import { bannerHeight } from './eventBanner';
import { switcherEventCount, type SwitcherGroups } from './eventSwitcher';
import type { Event, Ticket } from '../types';

// The event switcher overlay's list, laid out in fixed heights so where any
// card sits is known before anything renders: the opening animation shrinks
// the banner into the current event's card, so it needs that card's place on
// screen on the first frame.

export type SwitcherRow =
  | { kind: 'header'; key: string; label: string }
  /** `past`: an ended event, shown shorter and greyed out. */
  | { kind: 'event'; key: string; event: Event; current: boolean; past: boolean }
  | { kind: 'ticket'; key: string; ticket: Ticket; current: boolean; past: boolean }
  | { kind: 'placeholder'; key: string };

export interface SwitcherCurrent {
  eventId?: string;
  /** Opened from a pass: that ticket is current, not the event. */
  ticketId?: string;
}

export interface SwitcherMetrics {
  cardHeight: number;
  /** An ended event's card, shorter. */
  pastCardHeight: number;
  /** Space under each card. */
  cardGap: number;
  headerHeight: number;
  paddingTop: number;
  paddingBottom: number;
}

/** The cards' inset from each side of the screen. */
export const SWITCHER_CARD_INSET = 16;

/**
 * A card is the banner scaled down to the card's width (without the status
 * bar space above its photo), so the banner only shrinks into it (scale,
 * corners, its fade) and never changes shape.
 */
export function switcherCardScale(width: number): number {
  return (width - SWITCHER_CARD_INSET * 2) / width;
}

export function switcherCardHeight(width: number): number {
  return Math.round(bannerHeight(width) * switcherCardScale(width));
}

/** An ended event's card is this much of a card's height. */
const PAST_CARD_RATIO = 0.6;

export function switcherMetrics(width: number, bottomInset = 0): SwitcherMetrics {
  const cardHeight = switcherCardHeight(width);
  return {
    cardHeight,
    pastCardHeight: Math.round(cardHeight * PAST_CARD_RATIO),
    cardGap: 16,
    headerHeight: 40,
    paddingTop: 8,
    paddingBottom: bottomInset + 24,
  };
}

/**
 * The list's top padding: its usual one, or more to centre a list shorter
 * than its viewport.
 */
export function centredPaddingTop(rows: SwitcherRow[], metrics: SwitcherMetrics, viewportHeight: number): number {
  const content = contentHeight(rows, metrics);
  // Rounded down, so a centred list never comes out a fraction scrollable.
  return metrics.paddingTop + Math.max(0, Math.floor((viewportHeight - content) / 2));
}

const PLACEHOLDERS = 4;

const isCurrentEvent = (event: Event, current: SwitcherCurrent) => !current.ticketId && event.id === current.eventId;
const isCurrentTicket = (ticket: Ticket, current: SwitcherCurrent) => ticket.id === current.ticketId;

/**
 * The list's rows, always in the same order: Organizing, Attending, then
 * Past, each under its heading. Placeholder cards stand in while nothing
 * has loaded yet.
 */
export function switcherRows(
  groups: SwitcherGroups,
  current: SwitcherCurrent,
  { loading }: { loading: boolean }
): SwitcherRow[] {
  if (loading && switcherEventCount(groups) === 0) {
    return Array.from({ length: PLACEHOLDERS }, (_, i) => ({ kind: 'placeholder' as const, key: `placeholder-${i}` }));
  }
  const rows: SwitcherRow[] = [];
  const eventRow = (event: Event, past: boolean): SwitcherRow => ({
    kind: 'event',
    key: `event-${event.id}`,
    event,
    current: isCurrentEvent(event, current),
    past,
  });
  const ticketRow = (ticket: Ticket, past: boolean): SwitcherRow => ({
    kind: 'ticket',
    key: `ticket-${ticket.id}`,
    ticket,
    current: isCurrentTicket(ticket, current),
    past,
  });

  if (groups.organising.length > 0) {
    rows.push({ kind: 'header', key: 'organising', label: 'Organizing' }, ...groups.organising.map((e) => eventRow(e, false)));
  }
  if (groups.attending.length > 0) {
    rows.push({ kind: 'header', key: 'attending', label: 'Attending' }, ...groups.attending.map((t) => ticketRow(t, false)));
  }
  if (groups.past.length > 0) {
    rows.push(
      { kind: 'header', key: 'past', label: 'Past' },
      ...groups.past.map((entry) => (entry.kind === 'organising' ? eventRow(entry.event, true) : ticketRow(entry.ticket, true)))
    );
  }
  return rows;
}

/** The height of a card row's card: a past one is shorter, unless it's current. */
export function cardHeightOf(row: SwitcherRow, metrics: SwitcherMetrics): number {
  return (row.kind === 'event' || row.kind === 'ticket') && row.past && !row.current
    ? metrics.pastCardHeight
    : metrics.cardHeight;
}

export function rowHeight(row: SwitcherRow, metrics: SwitcherMetrics): number {
  return row.kind === 'header' ? metrics.headerHeight : cardHeightOf(row, metrics) + metrics.cardGap;
}

/** Each row's top in the list's content, after the top padding. */
export function rowOffsets(rows: SwitcherRow[], metrics: SwitcherMetrics): number[] {
  const offsets: number[] = [];
  let y = metrics.paddingTop;
  for (const row of rows) {
    offsets.push(y);
    y += rowHeight(row, metrics);
  }
  return offsets;
}

export function contentHeight(rows: SwitcherRow[], metrics: SwitcherMetrics): number {
  return rows.reduce((sum, row) => sum + rowHeight(row, metrics), metrics.paddingTop + metrics.paddingBottom);
}

export const currentRowIndex = (rows: SwitcherRow[]): number =>
  rows.findIndex((row) => (row.kind === 'event' || row.kind === 'ticket') && row.current);

/**
 * Where the list opens scrolled to, so the card at `cardTop` (in content)
 * sits `targetTop` from the top of the list's viewport, as near as the list
 * can scroll: never above its start or past its end.
 */
export function initialScrollOffset({
  cardTop,
  targetTop,
  contentHeight: content,
  viewportHeight,
}: {
  cardTop: number;
  targetTop: number;
  contentHeight: number;
  viewportHeight: number;
}): number {
  const max = Math.max(0, content - viewportHeight);
  return Math.min(max, Math.max(0, cardTop - targetTop));
}

/** Where to aim the current card: the middle of the list's viewport. */
export function centreTargetTop(viewportHeight: number, cardHeight: number): number {
  return (viewportHeight - cardHeight) / 2;
}
