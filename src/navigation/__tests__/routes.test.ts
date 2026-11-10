import { eventHomeState, keepRootKeys, passHomeState } from '../routes';
import type { Ticket } from '../../types';

describe('eventHomeState', () => {
  it('opens the Overview with every stack at its root', () => {
    expect(eventHomeState()).toEqual({
      index: 0,
      routes: [
        {
          name: 'Main',
          state: { index: 0, routes: [{ name: 'Overview', state: { index: 0, routes: [{ name: 'EventHome' }] } }] },
        },
      ],
    });
  });

  it('can push one Overview screen above it', () => {
    const overview = eventHomeState('IncidentForm', {}).routes[0].state!.routes[0].state!;
    expect(overview).toEqual({
      index: 1,
      routes: [{ name: 'EventHome' }, { name: 'IncidentForm', params: {} }],
    });
  });
});

describe('passHomeState', () => {
  it('puts the pass at the bottom of the attendee stack', () => {
    const ticket = { id: 't1' } as Ticket;
    expect(passHomeState(ticket)).toEqual({
      index: 0,
      routes: [{ name: 'ParticipantMain', state: { index: 0, routes: [{ name: 'TicketDetail', params: { ticket } }] } }],
    });
  });
});

describe('keepRootKeys', () => {
  it('keeps the key of a root route that stays, and drops the switcher sheet over it', () => {
    const current = { routes: [{ name: 'Main', key: 'main-1' }, { name: 'SwitchEventSheet', key: 'switch-1' }] };
    const reset = keepRootKeys(eventHomeState(), current);
    expect(reset.routes).toHaveLength(1);
    expect(reset.routes[0]).toMatchObject({ name: 'Main', key: 'main-1' });
    expect(reset.routes[0].state).toEqual(eventHomeState().routes[0].state);
  });

  it('replaces the switcher sheet and the screen under it with a pass home', () => {
    const current = {
      routes: [
        { name: 'Main', key: 'main-1' },
        { name: 'SwitchEventSheet', key: 'switch-1' },
        { name: 'AccountSheet', key: 'account-1' },
      ],
    };
    const reset = keepRootKeys(passHomeState({ id: 't1' } as Ticket), current);
    expect(reset.routes.map((route) => route.name)).toEqual(['ParticipantMain']);
  });

  it('leaves new routes keyless', () => {
    const current = { routes: [{ name: 'Main', key: 'main-1' }] };
    expect(keepRootKeys(passHomeState({ id: 't1' } as Ticket), current).routes[0]).not.toHaveProperty('key');
    expect(keepRootKeys(eventHomeState(), undefined)).toEqual(eventHomeState());
  });
});
