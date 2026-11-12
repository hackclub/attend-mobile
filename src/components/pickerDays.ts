/**
 * Material's date picker works in UTC days: it shows the UTC date of the
 * millis it's given and returns the picked day as UTC midnight. These turn a
 * local date into that form and back, so the day shown and picked is the
 * local one in any time zone.
 */

/** The local calendar day of `date`, as UTC midnight, for the picker. */
export function toPickerDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** The picked UTC day as a local date, keeping `timeOf`'s hour and minute. */
export function fromPickerDay(picked: Date, timeOf: Date): Date {
  return new Date(
    picked.getUTCFullYear(),
    picked.getUTCMonth(),
    picked.getUTCDate(),
    timeOf.getHours(),
    timeOf.getMinutes()
  );
}

/** Whether the locale reads times on a 24-hour clock. */
export function prefers24Hour(locale?: string): boolean {
  try {
    const { hourCycle, hour12 } = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions();
    if (hourCycle) return hourCycle === 'h23' || hourCycle === 'h24';
    return hour12 === false;
  } catch {
    return false;
  }
}
