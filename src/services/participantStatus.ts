import type { Participant } from '../types';

// Registration statuses that mean the person is no longer attending. The API
// sends the raw participant_event status enum ("invited", "in_progress",
// "awaiting_guardian", "complete", "withdrawn", "rejected") and does not
// filter these out of the roster sync, so the app has to.
const INACTIVE_STATUSES = new Set(['withdrawn', 'rejected']);

export function isWithdrawn(participant: Pick<Participant, 'status'>): boolean {
  return participant.status?.toLowerCase() === 'withdrawn';
}

export function isActiveParticipant(participant: Pick<Participant, 'status'>): boolean {
  return !INACTIVE_STATUSES.has(participant.status?.toLowerCase() ?? '');
}

export function activeParticipants<T extends Pick<Participant, 'status'>>(participants: T[]): T[] {
  return participants.filter(isActiveParticipant);
}
