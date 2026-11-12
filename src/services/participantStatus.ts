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

/**
 * Where someone stands for this event, from the two fields the offline
 * roster keeps (`status` and `checked_in_at`), as better-attend shows it:
 * an inactive registration wins, then being here, then how far registration
 * got. "Not here" is a finished registration that hasn't arrived; anything
 * short of "complete" is not expected at the door yet.
 */
export type ParticipantState =
  | 'here'
  | 'not_here'
  | 'awaiting_parent'
  | 'registering'
  | 'invited'
  | 'withdrawn'
  | 'rejected';

export function participantState(
  participant: Pick<Participant, 'status' | 'checked_in_at'>
): ParticipantState {
  const status = participant.status?.toLowerCase() ?? '';
  if (status === 'withdrawn') return 'withdrawn';
  if (status === 'rejected') return 'rejected';
  if (participant.checked_in_at) return 'here';
  switch (status) {
    case 'complete': return 'not_here';
    case 'awaiting_guardian': return 'awaiting_parent';
    case 'invited': return 'invited';
    // in_progress, and any status Attend adds later.
    default: return 'registering';
  }
}

export const PARTICIPANT_STATE_LABELS: Record<ParticipantState, string> = {
  here: 'Here',
  not_here: 'Not here',
  awaiting_parent: 'Awaiting parent',
  registering: 'Registering',
  invited: 'Invited',
  withdrawn: 'Withdrawn',
  rejected: 'Rejected',
};

/** The Status sort's order: who's here first, then the furthest along. */
export const PARTICIPANT_STATE_RANK: Record<ParticipantState, number> = {
  here: 0,
  not_here: 1,
  awaiting_parent: 2,
  registering: 3,
  invited: 4,
  withdrawn: 5,
  rejected: 6,
};

export function participantStateLabel(
  participant: Pick<Participant, 'status' | 'checked_in_at'>
): string {
  return PARTICIPANT_STATE_LABELS[participantState(participant)];
}
