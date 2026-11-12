import { bannerHeight } from './eventBanner';
import { switcherEventCount, type SwitcherGroups } from './eventSwitcher';
import type { Event, Ticket } from '../types';

// The event switcher overlay's list, laid out in fixed heights so where any
// card sits is known before anything renders: the opening animation shrinks
// the banner into the current event's card, so it needs that card's place on
// screen on the first frame.

export type SwitcherRow =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'past'; key: 'past'; count: number; open: boolean; toggleable: boolean }
  | { kind: 'event'; key: string; event: Event; current: boolean }
  | { kind: 'ticket'; key: string; ticket: Ticket; current: boolean }
  | { kind: 'placeholder'; key: string };

export interface SwitcherCurrent {
  eventId?: string;
  /** Opened from a pass: that ticket is current, not the event. */
  ticketId?: string;
}

export interface SwitcherMetrics {
  cardHeight: number;
  /** Space under each card. */
  cardGap: number;
  headerHeight: number;
  /** The Past group's toggle row. */
  toggleHeight: number;
  paddingTop: number;
  paddingBottom: number;
}

/** Cards are half the banner's photo, so the banner shrinks into one. */
export function switcherCardHeight(width: number): number {
  return Math.round(bannerHeight(width) / 2);
}

export function switcherMetrics(width: number, bottomInset = 0): SwitcherMetrics {
  return {
    cardHeight: switcherCardHeight(width),
    cardGap: 12,
    headerHeight: 40,
    toggleHeight: 48,
    paddingTop: 8,
    paddingBottom: bottomInset + 24,
  };
}

const PLACEHOLDERS = 4;

const isCurrentEvent = (event: Event, current: SwitcherCurrent) => !current.ticketId && event.id === current.eventId;
const isCurrentTicket = (ticket: Ticket, current: SwitcherCurrent) => ticket.id === current.ticketId;

/** Whether the current entry is an ended one, so Past starts open. */
export function currentIsPast(groups: SwitcherGroups, current: SwitcherCurrent): boolean {
  return groups.past.some((entry) =>
    entry.kind === 'organising' ? isCurrentEvent(entry.event, current) : isCurrentTicket(entry.ticket, current)
  );
}

/**
 * The list's rows, always in the same order: Organizing, Attending, then Past
 * (its cards only while open, or while searching). Placeholder cards stand in
 * while nothing has loaded yet.
 */
export function switcherRows(
  groups: SwitcherGroups,
  current: SwitcherCurrent,
  { pastOpen, searching, loading }: { pastOpen: boolean; searching: boolean; loading: boolean }
): SwitcherRow[] {
  if (loading && switcherEventCount(groups) === 0) {
    return Array.from({ length: PLACEHOLDERS }, (_, i) => ({ kind: 'placeholder' as const, key: `placeholder-${i}` }));
  }
  const rows: SwitcherRow[] = [];
  const eventRow = (event: Event): SwitcherRow => ({
    kind: 'event',
    key: `event-${event.id}`,
    event,
    current: isCurrentEvent(event, current),
  });
  const ticketRow = (ticket: Ticket): SwitcherRow => ({
    kind: 'ticket',
    key: `ticket-${ticket.id}`,
    ticket,
    current: isCurrentTicket(ticket, current),
  });

  if (groups.organising.length > 0) {
    rows.push({ kind: 'header', key: 'organising', label: 'Organizing' }, ...groups.organising.map(eventRow));
  }
  if (groups.attending.length > 0) {
    rows.push({ kind: 'header', key: 'attending', label: 'Attending' }, ...groups.attending.map(ticketRow));
  }
  if (groups.past.length > 0) {
    const open = pastOpen || searching;
    rows.push({ kind: 'past', key: 'past', count: groups.past.length, open, toggleable: !searching });
    if (open) {
      rows.push(...groups.past.map((entry) => (entry.kind === 'organising' ? eventRow(entry.event) : ticketRow(entry.ticket))));
    }
  }
  return rows;
}

export function rowHeight(row: SwitcherRow, metrics: SwitcherMetrics): number {
  switch (row.kind) {
    case 'header':
      return metrics.headerHeight;
    case 'past':
      return metrics.toggleHeight;
    default:
      return metrics.cardHeight + metrics.cardGap;
  }
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

/**
 * Where to aim the current card in the viewport: centred on the banner's
 * photo, which is `bannerTop` to `bannerBottom` on screen, with the list's
 * viewport starting `viewportTop` down the screen.
 */
export function bannerTargetTop(
  { bannerTop, bannerBottom, viewportTop }: { bannerTop: number; bannerBottom: number; viewportTop: number },
  cardHeight: number
): number {
  return (bannerTop + bannerBottom) / 2 - cardHeight / 2 - viewportTop;
}
