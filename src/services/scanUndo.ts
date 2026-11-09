import type { Participant } from '../types';

/**
 * A participant as they stand after DELETE /scans removes their scans in one
 * context (or in every context, without one). Checked-in only survives while
 * a check-in scan is left.
 */
export function participantAfterUndo(participant: Participant, scanContextId?: string): Participant {
  const scans = scanContextId
    ? (participant.scans_by_context ?? []).filter((scan) => scan.scan_context_id !== scanContextId)
    : [];
  const stillCheckedIn = scans.some((scan) => scan.checks_in && scan.scan_count > 0);
  return {
    ...participant,
    checked_in_at: stillCheckedIn ? participant.checked_in_at : null,
    scans_by_context: scans,
  };
}
