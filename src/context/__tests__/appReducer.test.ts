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

import { appReducer, initialState, isSameData, type AppState } from '../AppContext';
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

  describe('unchanged updates keep the same state', () => {
    it('skips a roster equal to the current one', () => {
      const state = withEvent(eventA);
      const copy = roster.map(participant => ({ ...participant }));
      expect(appReducer(state, { type: 'SET_PARTICIPANTS', payload: copy })).toBe(state);
    });

    it('applies a roster that changed', () => {
      const state = withEvent(eventA);
      const changed = [{ ...roster[0], checked_in_at: '2026-11-09T10:00:00Z' }];
      expect(appReducer(state, { type: 'SET_PARTICIPANTS', payload: changed }).participants)
        .toBe(changed);
    });

    it('skips an equal event list and an equal current event', () => {
      const state = { ...withEvent(eventA), events: [eventA, eventB] };
      expect(appReducer(state, { type: 'SET_EVENTS', payload: [{ ...eventA }, { ...eventB }] }))
        .toBe(state);
      expect(appReducer(state, { type: 'SET_CURRENT_EVENT', payload: { ...eventA } })).toBe(state);
    });

    it('skips an equal sync status', () => {
      const state = { ...initialState };
      expect(appReducer(state, { type: 'SET_SYNC_STATUS', payload: { ...initialState.sync } }))
        .toBe(state);
    });

    it('skips re-applying the same signed-in user', () => {
      const signedIn = appReducer(initialState, {
        type: 'SET_AUTH',
        payload: { user: { id: 'u1', name: 'A' } as never, token: 't' },
      });
      expect(appReducer(signedIn, {
        type: 'SET_AUTH',
        payload: { user: { id: 'u1', name: 'A' } as never, token: 't' },
      })).toBe(signedIn);
      expect(appReducer(signedIn, {
        type: 'SET_AUTH',
        payload: { user: { id: 'u1', name: 'B' } as never, token: 't' },
      }).auth.user).toEqual({ id: 'u1', name: 'B' });
    });
  });
});

describe('isSameData', () => {
  it('compares nested JSON data by value', () => {
    expect(isSameData({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toBe(true);
    expect(isSameData({ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] })).toBe(false);
    expect(isSameData({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(isSameData([], {})).toBe(false);
    expect(isSameData(null, {})).toBe(false);
  });
});
