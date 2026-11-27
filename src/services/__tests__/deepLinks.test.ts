import { fallbackToRegisteredRoute, homeRouteName, limitLinkParams, participantDetailTarget, preferOrganizerTabs } from '../deepLinks';

const scan = { routes: [{ name: 'Main', state: { routes: [{ name: 'Scanner', state: { routes: [{ name: 'ScannerHome' }] } }] } }] };
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
    expect(fallbackToRegisteredRoute(scan, ['Main', 'SwitchEventSheet'])).toBe(scan);
    expect(fallbackToRegisteredRoute(tickets, ['Main', 'ParticipantMain'])).toBe(tickets);
  });

  it('sends a participant-only user from Scan to their tickets', () => {
    expect(fallbackToRegisteredRoute(scan, ['ParticipantMain', 'TicketDetail'])).toEqual(tickets);
  });

  it('sends an organizer-only user from My tickets to the event tabs', () => {
    expect(fallbackToRegisteredRoute(tickets, ['Main', 'SwitchEventSheet'])).toEqual({ routes: [{ name: 'Main' }] });
  });

  it('drops the link when the user has no home (signed out)', () => {
    expect(fallbackToRegisteredRoute(scan, ['Login'])).toBeUndefined();
  });

  it('sends a link to a tab this event lacks (Travel) to the user\'s home', () => {
    const travel = { routes: [{ name: 'Main', state: { routes: [{ name: 'Travel', state: { routes: [{ name: 'TravelHome' }] } }] } }] };
    const tabs = { Main: ['Overview', 'Scanner', 'Search'] };
    expect(fallbackToRegisteredRoute(travel, ['Main', 'ParticipantMain'], tabs)).toEqual({ routes: [{ name: 'Main' }] });
    expect(fallbackToRegisteredRoute(travel, ['Main'], { Main: [...tabs.Main, 'Travel'] })).toBe(travel);
  });

  it('keeps a tab link while the tabs aren\'t mounted yet', () => {
    expect(fallbackToRegisteredRoute(scan, ['Main'], {})).toBe(scan);
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

describe('preferOrganizerTabs', () => {
  const report = {
    routes: [
      {
        name: 'ParticipantMain',
        state: { index: 1, routes: [{ name: 'MyTickets' }, { name: 'IncidentReport' }] },
      },
    ],
  };
  const inbox = {
    routes: [{ name: 'ParticipantMain', state: { index: 1, routes: [{ name: 'MyTickets' }, { name: 'Inbox' }] } }],
  };

  it("opens an organizer's incident report link on the Overview", () => {
    expect(preferOrganizerTabs(report, ['Main', 'SwitchEventSheet', 'ParticipantMain'])).toEqual({
      routes: [
        {
          name: 'Main',
          state: {
            routes: [
              { name: 'Overview', state: { index: 1, routes: [{ name: 'EventHome' }, { name: 'IncidentReport' }] } },
            ],
          },
        },
      ],
    });
  });

  it('keeps it in the attendee stack for a participant-only user', () => {
    expect(preferOrganizerTabs(report, ['ParticipantMain'])).toBe(report);
  });

  it('leaves attendee-only screens alone', () => {
    expect(preferOrganizerTabs(inbox, ['Main', 'ParticipantMain'])).toBe(inbox);
  });

  it('passes through without a state or route names', () => {
    expect(preferOrganizerTabs(undefined, ['Main'])).toBeUndefined();
    expect(preferOrganizerTabs(report, undefined)).toBe(report);
  });
});

describe('limitLinkParams', () => {
  const overview = (leaf: { name: string; params?: object }) => ({
    routes: [{ name: 'Main', state: { routes: [{ name: 'Overview', state: { index: 1, routes: [{ name: 'EventHome' }, leaf] } }] } }],
  });

  it('drops params a link may not set, such as a message notice', () => {
    expect(limitLinkParams(overview({ name: 'MessageDetail', params: { messageId: 'm1', notice: 'Sent' } })))
      .toEqual(overview({ name: 'MessageDetail', params: { messageId: 'm1' } }));
    expect(limitLinkParams(overview({ name: 'IncidentDetail', params: { incidentId: 'i1', extra: 'x' } })))
      .toEqual(overview({ name: 'IncidentDetail', params: { incidentId: 'i1' } }));
  });

  it('leaves other screens alone', () => {
    const state = overview({ name: 'IncidentList' });
    expect(limitLinkParams(state)).toEqual(state);
    expect(limitLinkParams(undefined)).toBeUndefined();
  });
});
