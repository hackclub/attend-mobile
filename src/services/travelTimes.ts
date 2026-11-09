// Travel times as staff read them: "2:15" with the period apart ("PM"), so
// a list can mute it, and "Sat 10:30 AM" for a one-line leg summary. Both
// take the event's timezone, falling back to the device's.

function parts(iso: string, timeZone: string | null | undefined, options: Intl.DateTimeFormatOptions) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timeZone || undefined }).formatToParts(date);
  } catch {
    // An unknown timezone name: fall back to the device's.
    return new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  }
}

/** { time: "2:15", period: "PM" }, or null for a missing or bad timestamp. */
export function travelClock(
  iso: string | null | undefined,
  timeZone?: string | null
): { time: string; period: string } | null {
  if (!iso) return null;
  const p = parts(iso, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true });
  if (!p) return null;
  const get = (type: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === type)?.value ?? '';
  return { time: `${get('hour')}:${get('minute')}`, period: get('dayPeriod').toUpperCase() };
}

/** "Sat", or null for a missing or bad timestamp. */
export function travelWeekday(iso: string | null | undefined, timeZone?: string | null): string | null {
  if (!iso) return null;
  return parts(iso, timeZone, { weekday: 'short' })?.find((x) => x.type === 'weekday')?.value ?? null;
}

/** "Sat 10:30 AM", or null for a missing or bad timestamp. */
export function travelDayTime(iso: string | null | undefined, timeZone?: string | null): string | null {
  const clock = travelClock(iso, timeZone);
  if (!clock || !iso) return null;
  return [travelWeekday(iso, timeZone), clock.time, clock.period].filter(Boolean).join(' ');
}
