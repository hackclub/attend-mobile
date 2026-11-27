import { eventDays } from './eventDates';
import type { Event } from '../types';

// Where an event stands right now, for the status card under the pass: about
// to start, running, or over. Day counts follow the event's own calendar (see
// eventDates), and every time is shown in the event's timezone.

export type EventPhase = 'upcoming' | 'live' | 'ended';

export interface EventStatus {
  phase: EventPhase;
  /** The card's small heading, e.g. "Event ended". */
  title: string;
  /** The line under it, e.g. "Starts in 5 days" or "Thanks for coming!". */
  headline: string;
}

type EventTimes = Pick<Event, 'starts_at' | 'ends_at' | 'timezone'>;

function validDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function partsIn(date: Date, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).formatToParts(date);
  } catch {
    // An unknown zone name falls back to the device's.
    return new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  }
}

/** "3:00 PM" in `timeZone`. */
export function formatEventTime(date: Date, timeZone?: string): string {
  const parts = partsIn(date, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true });
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
}

/** "Sat 11 Jul" in `timeZone`, the console's short date. */
export function formatEventDay(date: Date, timeZone?: string): string {
  const parts = partsIn(date, timeZone, { weekday: 'short', day: 'numeric', month: 'short' });
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}`;
}

/** "Sat 11 Jul, 3:00 PM" in the event's timezone, or null for a missing or bad date. */
export function formatEventMoment(iso?: string | null, timeZone?: string): string | null {
  const date = validDate(iso);
  if (!date) return null;
  return `${formatEventDay(date, timeZone)}, ${formatEventTime(date, timeZone)}`;
}

/**
 * The event's phase at `now`, with a day count rather than a ticking clock.
 * Without an end time an event runs until the end of its start day. Null
 * without a start date.
 */
export function eventStatus(
  event: EventTimes,
  { now = new Date(), checkedIn = false }: { now?: Date; checkedIn?: boolean } = {}
): EventStatus | null {
  const starts = validDate(event.starts_at);
  const days = eventDays(event, now);
  if (!starts || !days) return null;
  const ends = validDate(event.ends_at);
  const t = now.getTime();

  const over = ends && ends >= starts ? t > ends.getTime() : days.untilEnd < 0;
  if (over) {
    return {
      phase: 'ended',
      title: 'Event ended',
      headline: checkedIn ? 'Thanks for coming!' : 'This event has finished.',
    };
  }

  if (t >= starts.getTime()) {
    const day = Math.min(days.length, Math.max(1, 1 - days.untilStart));
    return {
      phase: 'live',
      title: 'Happening now',
      headline:
        days.length > 1
          ? `Day ${day} of ${days.length}`
          : ends
            ? `Until ${formatEventTime(ends, event.timezone)}`
            : 'Today',
    };
  }

  let headline: string;
  if (days.untilStart <= 0) headline = `Starts today at ${formatEventTime(starts, event.timezone)}`;
  else if (days.untilStart === 1) headline = `Starts tomorrow at ${formatEventTime(starts, event.timezone)}`;
  else headline = `Starts in ${days.untilStart} days`;
  return { phase: 'upcoming', title: 'Upcoming', headline };
}
