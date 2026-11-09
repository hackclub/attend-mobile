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

import { appReducer, initialState, type AppState } from '../AppContext';
import type { Event, Participant } from '../../types';

const eventA = { id: 'evt-a', name: 'A' } as Event;
const eventB = { id: 'evt-b', name: 'B' } as Event;
const roster = [{ participant_event_id: 'pe-1' } as Participant];

function withEvent(event: Event): AppState {
  return { ...initialState, currentEvent: event, participants: roster };
}

describe('appReducer', () => {
  it('clears the roster in the same update that switches events', () => {
    const next = appReducer(withEvent(eventA), { type: 'SET_CURRENT_EVENT', payload: eventB });
    expect(next.currentEvent).toBe(eventB);
    expect(next.participants).toEqual([]);
  });

  it('keeps the roster when the same event is set again (a refreshed copy)', () => {
    const refreshed = { ...eventA, name: 'A (renamed)' };
    const next = appReducer(withEvent(eventA), { type: 'SET_CURRENT_EVENT', payload: refreshed });
    expect(next.participants).toBe(roster);
  });

  it('tracks connectivity', () => {
    const offline = appReducer(initialState, { type: 'SET_ONLINE', payload: false });
    expect(offline.sync.isOnline).toBe(false);
    expect(appReducer(offline, { type: 'SET_ONLINE', payload: true }).sync.isOnline).toBe(true);
  });
});
