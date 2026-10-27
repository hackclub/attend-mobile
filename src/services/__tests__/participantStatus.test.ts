import { activeParticipants, isActiveParticipant, isWithdrawn } from '../participantStatus';

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
