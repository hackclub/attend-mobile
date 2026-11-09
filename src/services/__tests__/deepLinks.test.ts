import { fallbackToRegisteredRoute, homeRouteName, participantDetailTarget } from '../deepLinks';

const scan = { routes: [{ name: 'Main', state: { routes: [{ name: 'Scanner' }] } }] };
const tickets = { routes: [{ name: 'ParticipantMain' }] };

describe('homeRouteName', () => {
  it('prefers the organizer tabs, then tickets', () => {
    expect(homeRouteName(['Main', 'ParticipantMain'])).toBe('Main');
    expect(homeRouteName(['ParticipantMain', 'TicketDetail'])).toBe('ParticipantMain');
    expect(homeRouteName(['Login'])).toBeUndefined();
  });
});

describe('fallbackToRegisteredRoute', () => {
  it('keeps links to registered routes', () => {
    expect(fallbackToRegisteredRoute(scan, ['Main', 'SwitchEvent'])).toBe(scan);
    expect(fallbackToRegisteredRoute(tickets, ['Main', 'ParticipantMain'])).toBe(tickets);
  });

  it('sends a participant-only user from Scan to their tickets', () => {
    expect(fallbackToRegisteredRoute(scan, ['ParticipantMain', 'TicketDetail'])).toEqual(tickets);
  });

  it('sends an organizer-only user from My tickets to the event tabs', () => {
    expect(fallbackToRegisteredRoute(tickets, ['Main', 'SwitchEvent'])).toEqual({ routes: [{ name: 'Main' }] });
  });

  it('drops the link when the user has no home (signed out)', () => {
    expect(fallbackToRegisteredRoute(scan, ['Login'])).toBeUndefined();
  });

  it('passes through before the navigator has mounted', () => {
    expect(fallbackToRegisteredRoute(scan, undefined)).toBe(scan);
    expect(fallbackToRegisteredRoute(undefined, ['Main'])).toBeUndefined();
  });
});

describe('participantDetailTarget', () => {
  it('uses a pushed participant object', () => {
    const participant = { participant_id: 'p1' };
    expect(participantDetailTarget({ participant })).toEqual({ participant });
  });

  it('takes the id path for a deep link', () => {
    expect(participantDetailTarget({ id: 'abc' })).toEqual({ id: 'abc' });
  });

  it('ignores a string smuggled in as the participant', () => {
    expect(participantDetailTarget({ id: 'abc', participant: 'foo' })).toEqual({ id: 'abc' });
    expect(participantDetailTarget({ participant: 'foo' })).toEqual({ id: undefined });
    expect(participantDetailTarget({ participant: ['x'] })).toEqual({ id: undefined });
    expect(participantDetailTarget(undefined)).toEqual({ id: undefined });
  });
});
