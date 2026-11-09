import type { Event } from '../types';

// Calendar arithmetic for an event's banner and switcher card. Days are the
// event's own calendar days (its timezone when the API sends one), so "Day 1
// of 2" turns over at the venue's midnight, not the phone's.

const MS_PER_DAY = 86_400_000;

function validDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function partsIn(date: Date, timeZone?: string, options: Intl.DateTimeFormatOptions = {}) {
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).formatToParts(date);
  } catch {
    // An unknown zone name falls back to the device's.
    return new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  }
}

/** Days since the epoch of the calendar day `date` falls on in `timeZone`. */
function dayNumber(date: Date, timeZone?: string): number {
  const parts = partsIn(date, timeZone, { year: 'numeric', month: 'numeric', day: 'numeric' });
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Math.round(Date.UTC(get('year'), get('month') - 1, get('day')) / MS_PER_DAY);
}

export interface EventDays {
  /** Days from today to the first day; negative once it has started. */
  untilStart: number;
  /** Days from today to the last day; negative once it has finished. */
  untilEnd: number;
  /** How many calendar days the event runs. */
  length: number;
}

export function eventDays(event: Pick<Event, 'starts_at' | 'ends_at' | 'timezone'>, now = new Date()): EventDays | null {
  const starts = validDate(event.starts_at);
  if (!starts) return null;
  const ends = validDate(event.ends_at) ?? starts;
  const today = dayNumber(now, event.timezone);
  const first = dayNumber(starts, event.timezone);
  const last = Math.max(first, dayNumber(ends, event.timezone));
  return { untilStart: first - today, untilEnd: last - today, length: last - first + 1 };
}

/** Finished before today. An event with no dates is never past. */
export function isPastEvent(event: Pick<Event, 'starts_at' | 'ends_at' | 'timezone'>, now = new Date()): boolean {
  const days = eventDays(event, now);
  return !!days && days.untilEnd < 0;
}

/**
 * Where the event is relative to today: "Day 1 of 2", "Today", "Tomorrow",
 * "5 days away" (`style: 'away'`, the banner) or "In 5 days" (`'in'`, the
 * switcher), or "Ended". Null without a start date.
 */
export function eventPhaseLabel(
  event: Pick<Event, 'starts_at' | 'ends_at' | 'timezone'>,
  now = new Date(),
  style: 'away' | 'in' = 'away'
): string | null {
  const days = eventDays(event, now);
  if (!days) return null;
  if (days.untilEnd < 0) return 'Ended';
  if (days.untilStart <= 0) {
    if (days.length === 1) return 'Today';
    return `Day ${1 - days.untilStart} of ${days.length}`;
  }
  if (days.untilStart === 1) return 'Tomorrow';
  return style === 'in' ? `In ${days.untilStart} days` : `${days.untilStart} days away`;
}

function dayParts(date: Date, timeZone?: string) {
  const parts = partsIn(date, timeZone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { weekday: get('weekday'), day: get('day'), month: get('month'), year: get('year') };
}

/**
 * The event's dates in the console's short form: "Sat 14 Nov",
 * "Sat 14 – Sun 15 Nov", "Sat 31 Oct – Sun 1 Nov". Null without a start date.
 */
export function formatEventDateRange(event: Pick<Event, 'starts_at' | 'ends_at' | 'timezone'>): string | null {
  const starts = validDate(event.starts_at);
  if (!starts) return null;
  const ends = validDate(event.ends_at);
  const a = dayParts(starts, event.timezone);
  const single = `${a.weekday} ${a.day} ${a.month}`;
  if (!ends) return single;
  const b = dayParts(ends, event.timezone);
  if (a.year === b.year && a.month === b.month && a.day === b.day) return single;
  if (a.year === b.year && a.month === b.month) {
    return `${a.weekday} ${a.day} – ${b.weekday} ${b.day} ${b.month}`;
  }
  return `${a.weekday} ${a.day} ${a.month} – ${b.weekday} ${b.day} ${b.month}`;
}
