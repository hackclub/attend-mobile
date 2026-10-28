import { activeParticipants } from './participantStatus';
import type { Participant, ScanContext } from '../types';

export interface ContextProgress {
  id: string;
  name: string;
  checksIn: boolean;
  scanned: number;
  total: number;
  // 0–1, so a bar can use it as a width directly.
  fraction: number;
}

export interface EventStats {
  // Attending participants: withdrawn and rejected registrations stay in the
  // synced roster but never count, matching the Live Activity's total.
  total: number;
  checkedIn: number;
  checkedInFraction: number;
  contexts: ContextProgress[];
}

const fractionOf = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

export function formatPercent(fraction: number): string {
  if (fraction <= 0) return '0%';
  // Never round a partial count up to a finished-looking 100%, nor a first
  // scan down to 0%.
  if (fraction < 0.01) return '<1%';
  if (fraction < 1 && fraction > 0.99) return '99%';
  return `${Math.round(fraction * 100)}%`;
}

/**
 * Check-in and per-context progress for an event, from the synced roster. A
 * participant counts towards a context once they have at least one scan in it.
 * Contexts come back in the event's own order (position, then start time).
 */
export function computeEventStats(
  participants: Participant[],
  contexts: ScanContext[]
): EventStats {
  const active = activeParticipants(participants);
  const total = active.length;
  const checkedIn = active.filter((p) => p.checked_in_at).length;

  const scannedByContext = new Map<string, number>();
  for (const participant of active) {
    for (const scan of participant.scans_by_context ?? []) {
      if (scan.scan_count > 0) {
        scannedByContext.set(scan.scan_context_id, (scannedByContext.get(scan.scan_context_id) ?? 0) + 1);
      }
    }
  }

  const ordered = [...contexts].sort((a, b) => {
    const byPosition = (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
    if (byPosition !== 0) return byPosition;
    return (a.starts_at ?? '').localeCompare(b.starts_at ?? '');
  });

  return {
    total,
    checkedIn,
    checkedInFraction: fractionOf(checkedIn, total),
    contexts: ordered.map((context) => {
      const scanned = scannedByContext.get(context.id) ?? 0;
      return {
        id: context.id,
        name: context.name,
        checksIn: context.checks_in,
        scanned,
        total,
        fraction: fractionOf(scanned, total),
      };
    }),
  };
}
