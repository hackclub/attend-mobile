jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import {
  canViewParticipantPii,
  canViewParticipantRecords,
  eventRunsTravel,
  forbiddenParticipants,
  roleAllowsParticipantRecords,
} from '../eventAccess';
import { eventRoleDetails, eventRoleLabel } from '../eventRoles';
import type { Event } from '../../types';

function event(overrides: Partial<Event> = {}): Event {
  return { id: 'evt-1', name: 'Event', slug: 'event', ...overrides };
}

beforeEach(() => {
  forbiddenParticipants.reset();
});

describe('canViewParticipantPii', () => {
  it('is true when the server says so', () => {
    expect(canViewParticipantPii(event({ can_view_participant_pii: true }))).toBe(true);
  });

  it('is false only when the server says so explicitly', () => {
    expect(canViewParticipantPii(event({ can_view_participant_pii: false }))).toBe(false);
  });

  it('defaults to true when the field is missing, so older servers are unaffected', () => {
    expect(canViewParticipantPii(event())).toBe(true);
    expect(canViewParticipantPii(null)).toBe(true);
  });
});

describe('roleAllowsParticipantRecords', () => {
  it('allows limited: the payload is redacted, not refused', () => {
    expect(roleAllowsParticipantRecords(event({ role: 'limited' }))).toBe(true);
  });

  it.each(['event_admin', 'ops', 'safeguarding_lead', 'global_admin', 'series_member'])(
    'allows %s',
    role => {
      expect(roleAllowsParticipantRecords(event({ role }))).toBe(true);
    }
  );

  it('refuses read_only, which the participants API excludes', () => {
    expect(roleAllowsParticipantRecords(event({ role: 'read_only' }))).toBe(false);
  });

  it('allows a role it does not recognise rather than locking the app down', () => {
    expect(roleAllowsParticipantRecords(event({ role: 'future_role' }))).toBe(true);
  });

  it('lets the explicit flag win over the role in both directions', () => {
    expect(roleAllowsParticipantRecords(event({ role: 'read_only', can_view_participants: true }))).toBe(true);
    expect(roleAllowsParticipantRecords(event({ role: 'ops', can_view_participants: false }))).toBe(false);
  });
});

describe('eventRunsTravel', () => {
  it('hides travel only when the event says it has none', () => {
    expect(eventRunsTravel(event({ travel_enabled: false }))).toBe(false);
    expect(eventRunsTravel(event({ travel_enabled: true }))).toBe(true);
  });

  it('keeps travel for servers and cached events that predate the flag', () => {
    expect(eventRunsTravel(event())).toBe(true);
    expect(eventRunsTravel(null)).toBe(true);
  });
});

describe('canViewParticipantRecords', () => {
  it('follows the declared role', () => {
    expect(canViewParticipantRecords(event({ role: 'limited' }))).toBe(true);
    expect(canViewParticipantRecords(event({ role: 'read_only' }))).toBe(false);
  });

  it('follows an observed refusal even when the role says otherwise', () => {
    const limited = event({ role: 'limited' });
    forbiddenParticipants.mark(limited.id);
    expect(canViewParticipantRecords(limited)).toBe(false);
  });

  it('lets access back in after a successful request, with no sign-out', () => {
    forbiddenParticipants.mark('evt-1');
    forbiddenParticipants.clear('evt-1');
    expect(canViewParticipantRecords(event())).toBe(true);
  });
});

describe('forbiddenParticipants.applyEventRoles', () => {
  it('reconciles from the explicit flag when no role is sent', () => {
    forbiddenParticipants.applyEventRoles([event({ can_view_participants: false })]);
    expect(canViewParticipantRecords(event())).toBe(false);
    forbiddenParticipants.applyEventRoles([event({ can_view_participants: true })]);
    expect(canViewParticipantRecords(event())).toBe(true);
  });

  it('pre-marks events whose role has no participant access', () => {
    forbiddenParticipants.applyEventRoles([
      event({ id: 'a', role: 'read_only' }),
      event({ id: 'b', role: 'limited' }),
    ]);
    expect(forbiddenParticipants.has('a')).toBe(true);
    expect(forbiddenParticipants.has('b')).toBe(false);
  });

  it('clears a stale flag when the declared role does allow records', () => {
    // The deadlock this guards against: the sync layer will not issue the
    // participants request that would clear the flag, so without this a role
    // upgrade (or a flag left by a previous role) strands the user for good.
    forbiddenParticipants.mark('a');
    forbiddenParticipants.applyEventRoles([event({ id: 'a', role: 'limited' })]);
    expect(forbiddenParticipants.has('a')).toBe(false);
  });

  it('leaves a flag alone when the payload reports no role at all', () => {
    forbiddenParticipants.mark('a');
    forbiddenParticipants.applyEventRoles([event({ id: 'a' })]);
    expect(forbiddenParticipants.has('a')).toBe(true);
  });

  it('re-marks an event whose role loses access again', () => {
    forbiddenParticipants.applyEventRoles([event({ id: 'a', role: 'limited' })]);
    forbiddenParticipants.applyEventRoles([event({ id: 'a', role: 'read_only' })]);
    expect(forbiddenParticipants.has('a')).toBe(true);
  });

  it('notifies subscribers when a flag changes, and not otherwise', () => {
    const listener = jest.fn();
    const unsubscribe = forbiddenParticipants.subscribe(listener);

    forbiddenParticipants.mark('a');
    expect(listener).toHaveBeenCalledTimes(1);
    forbiddenParticipants.mark('a');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    forbiddenParticipants.mark('b');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('event role labels', () => {
  it('labels the limited role and describes what it gives up', () => {
    expect(eventRoleDetails('limited')).toEqual({
      label: 'Limited',
      summary: 'Day-to-day logistics, without addresses or exact birthdays.',
    });
  });

  it('returns nothing for a role this build does not know', () => {
    expect(eventRoleDetails('future_role')).toBeNull();
    expect(eventRoleLabel(undefined)).toBeNull();
  });
});
