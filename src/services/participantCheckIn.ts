import type { Participant } from '../types';
import { participantStateLabel } from './participantStatus';

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "11:20 AM" today, "Sat 11:20 AM" on another day. */
export function formatCheckInTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isSameDay(date, now)) return time;
  return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

/**
 * The scan context that checked the participant in: the earliest
 * check-in context scan Attend reports. Undefined when the payload has none.
 */
export function checkInContextName(participant: Pick<Participant, 'scans_by_context'>): string | undefined {
  const scans = (participant.scans_by_context ?? []).filter((s) => s.checks_in);
  if (scans.length === 0) return undefined;
  const sorted = [...scans].sort((a, b) =>
    (a.first_scanned_at ?? '￿').localeCompare(b.first_scanned_at ?? '￿'),
  );
  return sorted[0].scan_context_name || undefined;
}

/** "11:20 AM · Check-in", or just the time when the context isn't known. */
export function checkInDetail(
  participant: Pick<Participant, 'checked_in_at' | 'scans_by_context'>,
  now?: Date,
): string | null {
  if (!participant.checked_in_at) return null;
  const time = formatCheckInTime(participant.checked_in_at, now);
  const context = checkInContextName(participant);
  return [time, context].filter(Boolean).join(' · ');
}

/** When and where they checked in, or where their registration stands. */
export function participantDetailLine(
  participant: Pick<Participant, 'checked_in_at' | 'scans_by_context' | 'status'>,
  now?: Date,
): string {
  const checkIn = checkInDetail(participant, now);
  if (checkIn) return checkIn;
  return participantStateLabel(participant);
}
