import type { Participant } from '../../types';
import { ParticipantIndex, mergeParticipant, mergeParticipants } from '../participantIndex';

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    participant_id: 'person-1',
    participant_event_id: 'registration-1',
    display_name: 'Test Attendee',
    full_name: 'Test Attendee',
    email: 'attendee@example.com',
    status: 'complete',
    has_anaphylaxis_risk: false,
    requires_refrigeration: false,
    cross_contamination_risk: false,
    freedom_waiver_granted: false,
    high_support_flag: false,
    can_leave_unaccompanied: false,
    waiver_signed: true,
    ...overrides,
  };
}

describe('mergeParticipant', () => {
  it('preserves rich cached fields omitted by a scan response', () => {
    const cached = participant({
      headshot_url: 'https://images.example/headshot',
      allergies: 'peanuts',
    });

    const merged = mergeParticipant(cached, {
      participant_event_id: cached.participant_event_id,
      display_name: 'Updated Name',
    });

    expect(merged.headshot_url).toBe('https://images.example/headshot');
    expect(merged.allergies).toBe('peanuts');
    expect(merged.display_name).toBe('Updated Name');
  });
});

describe('mergeParticipants', () => {
  it('updates known registrations and appends new ones without duplicates', () => {
    const current = participant({ display_name: 'Old Name' });
    const incoming = [
      participant({ display_name: 'New Name' }),
      participant({ participant_id: 'person-2', participant_event_id: 'registration-2' }),
    ];

    const merged = mergeParticipants([current], incoming);

    expect(merged).toHaveLength(2);
    expect(merged.find(item => item.participant_event_id === 'registration-1')?.display_name).toBe('New Name');
  });
});

describe('ParticipantIndex', () => {
  it('resolves participant, registration, and nfc identifiers', () => {
    const cached = participant({ nfc_badge_token: 'badge-1' });
    const index = new ParticipantIndex([cached]);

    expect(index.find('person-1')).toBe(cached);
    expect(index.find('registration-1')).toBe(cached);
    expect(index.findByNfcToken('badge-1')).toBe(cached);
    expect(index.find('missing')).toBeUndefined();
  });
});
