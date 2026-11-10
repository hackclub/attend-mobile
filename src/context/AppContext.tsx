import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { AppState as RNAppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { authService, type SessionValidation } from '../services/auth';
import { createSessionRecheck, type SessionRecheck } from '../services/sessionRecheck';
import { syncService, SyncStatus } from '../services/sync';
import { scanQueue } from '../services/scanQueue';
import { notificationService } from '../services/notifications';
import { liveActivityService } from '../services/liveActivity';
import { mergeParticipant, type ParticipantUpdate } from '../services/participantIndex';
import { forbiddenParticipants } from '../services/eventAccess';
import { scheduleHeadshotPrefetch } from '../services/headshotCache';
import { activeParticipants } from '../services/participantStatus';
import { biometricService } from '../services/biometric';
import { resetSwitcherEventsCache } from '../hooks/switcherEventsCache';
import { PrivacyCover } from '../components/PrivacyCover';
import type { User, Event, Participant, AuthState, SyncState } from '../types';

// Withdrawn and rejected registrations are still in the synced roster but are
// not attending, so they never count towards the event total.
function checkInCounts(participants: Participant[]): { checkedInCount: number; totalCount: number } {
  const active = activeParticipants(participants);
  return {
    checkedInCount: active.filter(p => p.checked_in_at).length,
    totalCount: active.length,
  };
}

// Structural equality for the plain JSON data the reducer holds (events,
// participants, users), so a refresh that changed nothing keeps the previous
// state and re-renders no consumer.
export function isSameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!isSameData(a[index], b[index])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  if (aKeys.length !== Object.keys(bRecord).length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bRecord, key)) return false;
    if (!isSameData(aRecord[key], bRecord[key])) return false;
  }
  return true;
}

export interface AppState {
  auth: AuthState;
  sync: SyncState;
  currentEvent: Event | null;
  events: Event[];
  participants: Participant[];
}

export type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_AUTH'; payload: { user: User; token: string } }
  | { type: 'CLEAR_AUTH' }
  | { type: 'SET_EVENTS'; payload: Event[] }
  | { type: 'SET_CURRENT_EVENT'; payload: Event | null }
  | { type: 'SET_PARTICIPANTS'; payload: Participant[] }
  | { type: 'UPDATE_PARTICIPANT'; payload: ParticipantUpdate }
  | { type: 'SET_SYNC_STATUS'; payload: SyncStatus }
  | { type: 'SET_ONLINE'; payload: boolean };

// How long sign-out waits for queued scans to send before asking whether to
// discard them.
export const SIGN_OUT_FLUSH_TIMEOUT_MS = 5_000;

export const initialState: AppState = {
  auth: {
    isAuthenticated: false,
    isLoading: true,
    user: null,
    token: null,
  },
  sync: {
    lastSyncAt: null,
    pendingScans: 0,
    isSyncing: false,
    isOnline: true,
  },
  currentEvent: null,
  events: [],
  participants: [],
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        auth: { ...state.auth, isLoading: action.payload },
      };
    case 'SET_AUTH':
      if (
        state.auth.isAuthenticated
        && !state.auth.isLoading
        && state.auth.token === action.payload.token
        && isSameData(state.auth.user, action.payload.user)
      ) {
        return state;
      }
      return {
        ...state,
        auth: {
          isAuthenticated: true,
          isLoading: false,
          user: action.payload.user,
          token: action.payload.token,
        },
      };
    case 'CLEAR_AUTH':
      return {
        ...state,
        auth: {
          isAuthenticated: false,
          isLoading: false,
          user: null,
          token: null,
        },
        currentEvent: null,
        events: [],
        participants: [],
      };
    case 'SET_EVENTS': {
      if (isSameData(state.events, action.payload)) return state;
      // Carry the fresh copy of the selected event across too: it holds the
      // caller's role on that event, which decides what the app offers.
      const refreshed = state.currentEvent
        ? action.payload.find(event => event.id === state.currentEvent!.id)
        : undefined;
      return {
        ...state,
        events: action.payload,
        currentEvent: refreshed ?? state.currentEvent,
      };
    }
    case 'SET_CURRENT_EVENT':
      // A different event's roster must never show under the new one, not
      // even for the render before its own roster loads.
      if (action.payload?.id === state.currentEvent?.id) {
        if (isSameData(state.currentEvent, action.payload)) return state;
        return { ...state, currentEvent: action.payload };
      }
      return { ...state, currentEvent: action.payload, participants: [] };
    case 'SET_PARTICIPANTS':
      if (isSameData(state.participants, action.payload)) return state;
      return { ...state, participants: action.payload };
    case 'UPDATE_PARTICIPANT':
      if (!state.participants.some(
        participant => participant.participant_event_id === action.payload.participant_event_id
      )) {
        return {
          ...state,
          participants: [...state.participants, mergeParticipant(undefined, action.payload)],
        };
      }
      return {
        ...state,
        participants: state.participants.map(p =>
          p.participant_event_id === action.payload.participant_event_id
            ? mergeParticipant(p, action.payload)
            : p
        ),
      };
    case 'SET_SYNC_STATUS':
      if (
        state.sync.lastSyncAt === action.payload.lastSyncAt
        && state.sync.pendingScans === action.payload.pendingScans
        && state.sync.isSyncing === action.payload.isSyncing
        && state.sync.isOnline === action.payload.isOnline
      ) {
        return state;
      }
      return {
        ...state,
        sync: {
          lastSyncAt: action.payload.lastSyncAt,
          pendingScans: action.payload.pendingScans,
          isSyncing: action.payload.isSyncing,
          isOnline: action.payload.isOnline,
        },
      };
    case 'SET_ONLINE':
      if (state.sync.isOnline === action.payload) return state;
      return { ...state, sync: { ...state.sync, isOnline: action.payload } };
    default:
      return state;
  }
}

export interface CachedSelection {
  event: Event | null;
  participants: Participant[];
  events: Event[];
}

// The last selected event, its roster and the event list, from disk. A failed
// read restores nothing rather than blocking sign-in.
async function loadCachedSelection(): Promise<CachedSelection> {
  try {
    const [event, events] = await Promise.all([
      syncService.getCurrentEvent(),
      syncService.getCachedEvents(),
    ]);
    const participants = event ? await syncService.getCachedParticipants(event.id) : [];
    return { event, participants, events };
  } catch (error) {
    console.error('Failed to restore cached data:', error);
    return { event: null, participants: [], events: [] };
  }
}

/**
 * The actions that put a restored session's cached data in place, in order:
 * the event first (it clears any other event's roster), then its roster, then
 * the event list (which refreshes the selected event's copy). Dispatched just
 * before SET_AUTH.
 */
export function restoredSelectionActions(cached: CachedSelection): AppAction[] {
  const actions: AppAction[] = [];
  if (cached.event) {
    actions.push({ type: 'SET_CURRENT_EVENT', payload: cached.event });
    actions.push({ type: 'SET_PARTICIPANTS', payload: cached.participants });
  }
  actions.push({ type: 'SET_EVENTS', payload: cached.events });
  return actions;
}

interface AppContextValue {
  state: AppState;
  login: () => Promise<boolean>;
  devLogin: (identifier: { userId: string } | { email: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  selectEvent: (event: Event) => Promise<void>;
  setEvents: (events: Event[]) => void;
  refreshParticipants: () => Promise<void>;
  updateParticipant: (participant: ParticipantUpdate) => void;
  confirmParticipant: (eventId: string, participant: ParticipantUpdate) => Promise<Participant>;
  // Sends every queued scan (all events) and refreshes the current event.
  syncNow: () => Promise<void>;
  /**
   * Before sign-out: tries to send queued scans for up to
   * SIGN_OUT_FLUSH_TIMEOUT_MS and resolves with how many are still unsent
   * (and would be lost by signing out). state.sync.pendingScans is the live
   * count.
   */
  flushBeforeSignOut: () => Promise<number>;
  startLiveActivity: () => Promise<void>;
  stopLiveActivity: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const currentEventIdRef = useRef<string | null>(null);
  // The signed-in token, set wherever SET_AUTH / CLEAR_AUTH change it.
  const authTokenRef = useRef<string | null>(null);
  const eventSelectionGenerationRef = useRef(0);
  currentEventIdRef.current = state.currentEvent?.id ?? null;

  // Acts on a background /me check of `token`: the fresh user, or (on a 401,
  // after authService's own sign-out cleanup) the signed-out state.
  const applySessionValidation = useCallback((token: string, outcome: SessionValidation) => {
    // Signed out, or someone else signed in, in the meantime.
    if (authTokenRef.current !== token) return;
    if (outcome.status === 'valid') {
      dispatch({ type: 'SET_AUTH', payload: { user: outcome.user, token } });
    } else if (outcome.status === 'expired') {
      // authService already ran the full sign-out cleanup.
      eventSelectionGenerationRef.current += 1;
      authTokenRef.current = null;
      resetSwitcherEventsCache();
      dispatch({ type: 'CLEAR_AUTH' });
    }
  }, []);

  // A check left `unverified` (offline, server error) is run again on
  // reconnect and on returning to the foreground, at most once a minute.
  const sessionRecheckRef = useRef<SessionRecheck | null>(null);
  useEffect(() => {
    const recheck = createSessionRecheck({
      validate: (token) => authService.validateSession(token),
      onOutcome: applySessionValidation,
    });
    sessionRecheckRef.current = recheck;
    let wasConnected: boolean | null = null;
    const netSub = NetInfo.addEventListener((netState) => {
      const connected = netState.isConnected !== false;
      if (connected && wasConnected === false) recheck.trigger();
      wasConnected = connected;
    });
    const appStateSub = RNAppState.addEventListener('change', (next) => {
      if (next === 'active') recheck.trigger();
    });
    return () => {
      netSub();
      appStateSub.remove();
      recheck.dispose();
      if (sessionRecheckRef.current === recheck) sessionRecheckRef.current = null;
    };
  }, [applySessionValidation]);

  const refreshSyncStatus = useCallback(() => {
    syncService.getStatus().then((status) => {
      dispatch({ type: 'SET_SYNC_STATUS', payload: status });
    }).catch((error) => {
      console.error('Failed to get sync status:', error);
    });
  }, []);

  // Scopes the scan queue to this user (discarding anyone else's queued
  // scans) before the app shows them as signed in.
  // `preload` (a restored session's cached event and roster) is dispatched in
  // the same tick as SET_AUTH, so the first signed-in render already has them.
  const beginSession = useCallback(async (
    user: User,
    { restored, token: knownToken, preload }: {
      restored: boolean;
      token?: string;
      preload?: Promise<AppAction[]>;
    }
  ) => {
    const [, preloadActions] = await Promise.all([
      scanQueue.setUser(user.id, { adoptUntagged: restored }).catch(error => {
        console.warn('[Session] Failed to scope the scan queue:', error);
      }),
      preload ?? Promise.resolve([]),
    ]);
    const token = knownToken ?? await authService.getToken();
    sessionRecheckRef.current?.clear();
    authTokenRef.current = token;
    for (const action of preloadActions) dispatch(action);
    dispatch({ type: 'SET_AUTH', payload: { user, token: token! } });
    refreshSyncStatus();
  }, [refreshSyncStatus]);

  useEffect(() => {
    let appStateSub: { remove: () => void } | null = null;

    const restoreAuth = async () => {
      try {
        // Before anything renders: which events have already refused
        // participant records, so no roster entry point flashes into view.
        await forbiddenParticipants.hydrate();
        const result = await authService.restoreSession();
        if (result.locked) {
          // Launched in the background with the keychain locked. Stay on the
          // loading state rather than showing Login, and retry once the user
          // opens the app (which means it's unlocked).
          appStateSub ??= RNAppState.addEventListener('change', (next) => {
            if (next !== 'active') return;
            appStateSub?.remove();
            appStateSub = null;
            restoreAuth();
          });
          return;
        }
        if (result.success && result.user) {
          // Signed in from the cached user straight away; /me may still be
          // checking the token in the background (result.validation). The
          // cached event and roster are read alongside and land with SET_AUTH,
          // so home never flashes "Choose an event" or a spinner.
          const cached = loadCachedSelection();
          await beginSession(result.user, {
            restored: true,
            token: result.token,
            preload: cached.then(restoredSelectionActions),
          });

          const { event: cachedEvent } = await cached;
          if (cachedEvent) {
            const generation = ++eventSelectionGenerationRef.current;
            void syncService.refreshParticipants(cachedEvent.id)
              .then(fresh => {
                if (
                  eventSelectionGenerationRef.current === generation
                  && currentEventIdRef.current === cachedEvent.id
                ) {
                  dispatch({ type: 'SET_PARTICIPANTS', payload: fresh });
                }
              })
              .catch(() => {});
          }

          // Handled after the cached data, so an expired session's sign-out
          // always lands last.
          const token = result.token;
          void result.validation?.then((outcome) => {
            if (!token || authTokenRef.current !== token) return;
            sessionRecheckRef.current?.record(token, outcome);
            applySessionValidation(token, outcome);
          });
        } else {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch (error) {
        console.error('Failed to restore auth session:', error);
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    // A Live Activity can outlive the app; find out whether one is showing.
    liveActivityService.syncState();
    restoreAuth();
    return () => appStateSub?.remove();
  }, [applySessionValidation, beginSession]);

  // Sends queued scans by itself while signed in: at start, on reconnect, on
  // returning to the foreground, and on a backoff timer while any remain.
  const signedInUserId = state.auth.user?.id ?? null;
  useEffect(() => {
    if (!signedInUserId) return;
    return scanQueue.start(RNAppState);
  }, [signedInUserId]);

  // Keeps isOnline current, so "Sync now" comes back after reconnecting.
  useEffect(() => {
    return NetInfo.addEventListener((netState) => {
      dispatch({ type: 'SET_ONLINE', payload: netState.isConnected !== false });
    });
  }, []);

  // A Live Activity or Live Update belongs to one event: switching events (or
  // signing out) ends it, along with the ticket activity.
  const liveEventIdRef = useRef<string | null | undefined>(undefined);
  const currentEventId = state.currentEvent?.id ?? null;
  useEffect(() => {
    const previous = liveEventIdRef.current;
    liveEventIdRef.current = currentEventId;
    // First run, or restoring the event the activity was started for.
    if (previous === undefined || previous === null || previous === currentEventId) return;
    void liveActivityService.stopAll();
  }, [currentEventId]);

  // Register this device for push once authenticated (organizers get scan/flight
  // alerts; participants get organizer messages). No-op on simulators.
  useEffect(() => {
    if (state.auth.isAuthenticated) {
      notificationService.registerTokenWithServer().catch(() => {});
    }
  }, [state.auth.isAuthenticated]);

  // Deferred, and only fetches headshots not already on disk.
  useEffect(() => {
    if (state.participants.length === 0) return;
    return scheduleHeadshotPrefetch(state.participants);
  }, [state.participants]);

  // Signed out there's no status worth reading; beginSession reads it once
  // the scan queue belongs to the signed-in user, and changes arrive here.
  useEffect(() => {
    return syncService.subscribe((status) => {
      dispatch({ type: 'SET_SYNC_STATUS', payload: status });
    });
  }, []);

  const login = useCallback(async (): Promise<boolean> => {
    const result = await authService.authenticate();
    if (result.success && result.user) {
      await beginSession(result.user, { restored: false });
      return true;
    }
    return false;
  }, [beginSession]);

  const devLogin = useCallback(async (identifier: { userId: string } | { email: string }): Promise<boolean> => {
    const result = await authService.devLogin(identifier);
    if (result.success && result.user) {
      await beginSession(result.user, { restored: false });
      return true;
    }
    return false;
  }, [beginSession]);

  // The UI signs out at once. authService.logout does the rest, the same as
  // for an expired session: deletes the stored token first, clears every
  // local cache, the queued scans and the Live Activities, then tells the
  // server (best-effort, time-limited). Callers wanting to keep unsent scans
  // call flushBeforeSignOut first.
  const logout = useCallback(async (): Promise<void> => {
    eventSelectionGenerationRef.current += 1;
    biometricService.clearSession();
    authTokenRef.current = null;
    sessionRecheckRef.current?.clear();
    resetSwitcherEventsCache();
    dispatch({ type: 'CLEAR_AUTH' });
    try {
      await authService.logout();
    } catch (error) {
      console.warn('[Logout] Cleanup failed:', error);
    }
  }, []);

  const flushBeforeSignOut = useCallback(async (): Promise<number> => {
    try {
      return await syncService.flushQueuedScans(SIGN_OUT_FLUSH_TIMEOUT_MS);
    } catch (error) {
      console.warn('[Logout] Flush before sign-out failed:', error);
      return scanQueue.getPendingCount().catch(() => 0);
    }
  }, []);

  const selectEvent = useCallback(async (event: Event): Promise<void> => {
    const generation = ++eventSelectionGenerationRef.current;
    dispatch({ type: 'SET_CURRENT_EVENT', payload: event });
    // Persisting the choice can queue behind other cache writes, so the
    // cached people don't wait for it.
    void syncService.setCurrentEvent(event).catch(() => {});
    const cached = await syncService.getCachedParticipants(event.id);
    if (eventSelectionGenerationRef.current !== generation) return;
    dispatch({ type: 'SET_PARTICIPANTS', payload: cached });

    void syncService.refreshParticipants(event.id)
      .then(fresh => {
        if (
          eventSelectionGenerationRef.current === generation
          && currentEventIdRef.current === event.id
        ) {
          dispatch({ type: 'SET_PARTICIPANTS', payload: fresh });
        }
      })
      .catch(() => {});

    // Register for push notifications
    notificationService.registerTokenWithServer().catch(() => {
      // Silently fail - notifications are optional
    });
  }, []);

  const setEvents = useCallback((events: Event[]): void => {
    dispatch({ type: 'SET_EVENTS', payload: events });
  }, []);

  // Pull-to-refresh is user-initiated, so it re-probes an event previously
  // found to refuse participants rather than trusting a possibly stale flag.
  const refreshParticipants = useCallback(async (): Promise<void> => {
    if (!state.currentEvent) return;
    const eventId = state.currentEvent.id;
    const generation = eventSelectionGenerationRef.current;
    const participants = await syncService.refreshParticipants(eventId, generation, {
      probeForbidden: true,
    });
    if (
      eventSelectionGenerationRef.current === generation
      && currentEventIdRef.current === eventId
    ) {
      dispatch({ type: 'SET_PARTICIPANTS', payload: participants });
    }
  }, [state.currentEvent]);

  const updateParticipant = useCallback((participant: ParticipantUpdate): void => {
    dispatch({ type: 'UPDATE_PARTICIPANT', payload: participant });
  }, []);

  const confirmParticipant = useCallback(async (
    eventId: string,
    participant: ParticipantUpdate
  ): Promise<Participant> => {
    if (currentEventIdRef.current === eventId) {
      const current = state.participants.find(
        item => item.participant_event_id === participant.participant_event_id
      );
      const immediate = mergeParticipant(current, participant);
      dispatch({ type: 'UPDATE_PARTICIPANT', payload: immediate });
    }

    const persisted = await syncService.cacheConfirmedParticipant(
      eventId,
      participant
    );
    return persisted;
  }, [state.participants]);

  const syncNow = useCallback(async (): Promise<void> => {
    const eventId = state.currentEvent?.id ?? null;
    const generation = eventSelectionGenerationRef.current;
    await syncService.syncAll(eventId);
    if (
      !eventId
      || eventSelectionGenerationRef.current !== generation
      || currentEventIdRef.current !== eventId
    ) return;
    const participants = await syncService.getCachedParticipants(eventId);
    if (
      eventSelectionGenerationRef.current === generation
      && currentEventIdRef.current === eventId
    ) {
      dispatch({ type: 'SET_PARTICIPANTS', payload: participants });
    }
  }, [state.currentEvent]);

  const startLiveActivity = useCallback(async (): Promise<void> => {
    if (!state.currentEvent) return;
    const { checkedInCount, totalCount } = checkInCounts(state.participants);
    await liveActivityService.start(
      state.currentEvent.id,
      state.currentEvent.name,
      checkedInCount,
      totalCount
    );
  }, [state.currentEvent, state.participants]);

  const stopLiveActivity = useCallback(async (): Promise<void> => {
    await liveActivityService.stop();
  }, []);

  // Update Live Activity when participants change
  useEffect(() => {
    if (liveActivityService.isRunning() && state.currentEvent) {
      const { checkedInCount, totalCount } = checkInCounts(state.participants);
      void liveActivityService.update(state.currentEvent.id, checkedInCount, totalCount);
    }
  }, [state.participants, state.currentEvent]);

  // A new value only when the state or an action changes, so consumers
  // don't re-render whenever the provider's parent does.
  const value = useMemo<AppContextValue>(() => ({
    state,
    login,
    devLogin,
    logout,
    selectEvent,
    setEvents,
    refreshParticipants,
    updateParticipant,
    confirmParticipant,
    syncNow,
    flushBeforeSignOut,
    startLiveActivity,
    stopLiveActivity,
  }), [
    state,
    login,
    devLogin,
    logout,
    selectEvent,
    setEvents,
    refreshParticipants,
    updateParticipant,
    confirmParticipant,
    syncNow,
    flushBeforeSignOut,
    startLiveActivity,
    stopLiveActivity,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
      <PrivacyCover />
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
