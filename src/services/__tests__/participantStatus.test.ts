import { activeParticipants, isActiveParticipant, isWithdrawn, participantState, participantStateLabel } from '../participantStatus';

describe('participantStatus', () => {
  it('treats withdrawn registrations as withdrawn', () => {
    expect(isWithdrawn({ status: 'withdrawn' })).toBe(true);
    expect(isWithdrawn({ status: 'Withdrawn' })).toBe(true);
    expect(isWithdrawn({ status: 'complete' })).toBe(false);
    expect(isWithdrawn({ status: undefined as unknown as string })).toBe(false);
  });

  it('excludes withdrawn and rejected registrations from the active roster', () => {
    const roster = [
      { status: 'complete' },
      { status: 'withdrawn' },
      { status: 'rejected' },
      { status: 'in_progress' },
      { status: 'invited' },
      { status: 'awaiting_guardian' },
    ];
    expect(activeParticipants(roster).map(p => p.status)).toEqual([
      'complete',
      'in_progress',
      'invited',
      'awaiting_guardian',
    ]);
  });

  it('counts an unknown or missing status as active', () => {
    expect(isActiveParticipant({ status: 'something_new' })).toBe(true);
    expect(isActiveParticipant({ status: undefined as unknown as string })).toBe(true);
  });
});

describe('participantState', () => {
  it('derives the state from status and check-in', () => {
    expect(participantState({ status: 'complete', checked_in_at: null })).toBe('not_here');
    expect(participantState({ status: 'complete', checked_in_at: '2026-11-14T09:00:00Z' })).toBe('here');
    expect(participantState({ status: 'awaiting_guardian' })).toBe('awaiting_parent');
    expect(participantState({ status: 'in_progress' })).toBe('registering');
    expect(participantState({ status: 'invited' })).toBe('invited');
    expect(participantState({ status: 'something_new' })).toBe('registering');
  });

  it('puts an inactive registration ahead of a check-in', () => {
    expect(participantState({ status: 'withdrawn', checked_in_at: '2026-11-14T09:00:00Z' })).toBe('withdrawn');
    expect(participantState({ status: 'Rejected' })).toBe('rejected');
  });

  it('labels each state', () => {
    expect(participantStateLabel({ status: 'awaiting_guardian' })).toBe('Awaiting parent');
    expect(participantStateLabel({ status: 'complete' })).toBe('Not here');
  });
});
