jest.mock('react-native', () => ({ AppState: { addEventListener: jest.fn() } }));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn() }));
jest.mock('../../services/auth', () => ({}));
jest.mock('../../services/sync', () => ({}));
jest.mock('../../services/scanQueue', () => ({}));
jest.mock('../../services/notifications', () => ({}));
jest.mock('../../services/liveActivity', () => ({}));
jest.mock('../../services/eventAccess', () => ({}));
jest.mock('../../services/headshotCache', () => ({}));
jest.mock('../../services/biometric', () => ({}));
jest.mock('../../components/PrivacyCover', () => ({ PrivacyCover: () => null }));

import { appReducer, initialState, restoredSelectionActions } from '../AppContext';
import type { Event, Participant, User } from '../../types';

const event = { id: 'evt-a', name: 'A' } as Event;
const freshEvent = { id: 'evt-a', name: 'A (renamed)' } as Event;
const other = { id: 'evt-b', name: 'B' } as Event;
const roster = [{ participant_event_id: 'pe-1' } as Participant];
const user = { id: 'u1' } as User;

describe('restoredSelectionActions', () => {
  it('puts the event first, then its roster, then the event list', () => {
    expect(restoredSelectionActions({ event, participants: roster, events: [other] }).map(a => a.type))
      .toEqual(['SET_CURRENT_EVENT', 'SET_PARTICIPANTS', 'SET_EVENTS']);
  });

  it('only restores the event list when no event was selected', () => {
    expect(restoredSelectionActions({ event: null, participants: [], events: [other] }))
      .toEqual([{ type: 'SET_EVENTS', payload: [other] }]);
  });

  it('leaves the first signed-in state with the event and roster in place', () => {
    const state = [
      ...restoredSelectionActions({ event, participants: roster, events: [freshEvent, other] }),
      { type: 'SET_AUTH' as const, payload: { user, token: 't' } },
    ].reduce(appReducer, initialState);

    expect(state.auth).toMatchObject({ isAuthenticated: true, isLoading: false });
    // The event list's copy replaces the cached one; the roster survives.
    expect(state.currentEvent).toBe(freshEvent);
    expect(state.participants).toBe(roster);
    expect(state.events).toEqual([freshEvent, other]);
  });
});
