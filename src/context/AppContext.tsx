import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, ReactNode } from 'react';
import { authService } from '../services/auth';
import { syncService, SyncStatus } from '../services/sync';
import { notificationService } from '../services/notifications';
import { liveActivityService } from '../services/liveActivity';
import { mergeParticipant, type ParticipantUpdate } from '../services/participantIndex';
import { clearHeadshotCache, prefetchHeadshots } from '../services/headshotCache';
import type { User, Event, Participant, AuthState, SyncState } from '../types';

interface AppState {
  auth: AuthState;
  sync: SyncState;
  currentEvent: Event | null;
  events: Event[];
  participants: Participant[];
}

type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_AUTH'; payload: { user: User; token: string } }
  | { type: 'CLEAR_AUTH' }
  | { type: 'SET_EVENTS'; payload: Event[] }
  | { type: 'SET_CURRENT_EVENT'; payload: Event | null }
  | { type: 'SET_PARTICIPANTS'; payload: Participant[] }
  | { type: 'UPDATE_PARTICIPANT'; payload: ParticipantUpdate }
  | { type: 'SET_SYNC_STATUS'; payload: SyncStatus };

const initialState: AppState = {
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

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        auth: { ...state.auth, isLoading: action.payload },
      };
    case 'SET_AUTH':
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
    case 'SET_EVENTS':
      return { ...state, events: action.payload };
    case 'SET_CURRENT_EVENT':
      return { ...state, currentEvent: action.payload };
    case 'SET_PARTICIPANTS':
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
      return {
        ...state,
        sync: {
          lastSyncAt: action.payload.lastSyncAt,
          pendingScans: action.payload.pendingScans,
          isSyncing: action.payload.isSyncing,
          isOnline: action.payload.isOnline,
        },
      };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  login: () => Promise<boolean>;
  devLogin: (userId: string) => Promise<boolean>;
  logout: () => Promise<void>;
  selectEvent: (event: Event) => Promise<void>;
  refreshParticipants: () => Promise<void>;
  updateParticipant: (participant: ParticipantUpdate) => void;
  confirmParticipant: (eventId: string, participant: ParticipantUpdate) => Promise<Participant>;
  syncNow: () => Promise<void>;
  startLiveActivity: () => Promise<void>;
  stopLiveActivity: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const currentEventIdRef = useRef<string | null>(null);
  const eventSelectionGenerationRef = useRef(0);
  currentEventIdRef.current = state.currentEvent?.id ?? null;

  useEffect(() => {
    const restoreAuth = async () => {
      try {
        const result = await authService.restoreSession();
        if (result.success && result.user) {
          const token = await authService.getToken();
          dispatch({ type: 'SET_AUTH', payload: { user: result.user, token: token! } });
          
          try {
            const cachedEvent = await syncService.getCurrentEvent();
            if (cachedEvent) {
              const generation = ++eventSelectionGenerationRef.current;
              dispatch({ type: 'SET_CURRENT_EVENT', payload: cachedEvent });
              const participants = await syncService.getCachedParticipants(cachedEvent.id);
              if (eventSelectionGenerationRef.current === generation) {
                dispatch({ type: 'SET_PARTICIPANTS', payload: participants });
              }
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
            
            const events = await syncService.getCachedEvents();
            dispatch({ type: 'SET_EVENTS', payload: events });
          } catch (cacheError) {
            console.error('Failed to restore cached data:', cacheError);
          }
        } else {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch (error) {
        console.error('Failed to restore auth session:', error);
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    restoreAuth();
  }, []);

  // Register this device for push once authenticated (organizers get scan/flight
  // alerts; participants get organizer messages). No-op on simulators.
  useEffect(() => {
    if (state.auth.isAuthenticated) {
      notificationService.registerTokenWithServer().catch(() => {});
    }
  }, [state.auth.isAuthenticated]);

  useEffect(() => {
    if (state.participants.length > 0) {
      void prefetchHeadshots(state.participants).catch(error => {
        console.warn('[Images] Headshot prefetch failed:', error);
      });
    }
  }, [state.participants]);

  useEffect(() => {
    const unsubscribe = syncService.subscribe((status) => {
      dispatch({ type: 'SET_SYNC_STATUS', payload: status });
    });

    syncService.getStatus().then((status) => {
      dispatch({ type: 'SET_SYNC_STATUS', payload: status });
    }).catch((error) => {
      console.error('Failed to get sync status:', error);
    });

    return unsubscribe;
  }, []);

  const login = useCallback(async (): Promise<boolean> => {
    const result = await authService.authenticate();
    if (result.success && result.user) {
      const token = await authService.getToken();
      dispatch({ type: 'SET_AUTH', payload: { user: result.user, token: token! } });
      return true;
    }
    return false;
  }, []);

  const devLogin = useCallback(async (userId: string): Promise<boolean> => {
    const result = await authService.devLogin(userId);
    if (result.success && result.user) {
      const token = await authService.getToken();
      dispatch({ type: 'SET_AUTH', payload: { user: result.user, token: token! } });
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    eventSelectionGenerationRef.current += 1;
    dispatch({ type: 'CLEAR_AUTH' });
    const results = await Promise.allSettled([
      authService.logout(),
      syncService.clear(),
      clearHeadshotCache(),
    ]);
    results.forEach(result => {
      if (result.status === 'rejected') {
        console.warn('[Logout] Cleanup failed:', result.reason);
      }
    });
  }, []);

  const selectEvent = useCallback(async (event: Event): Promise<void> => {
    const generation = ++eventSelectionGenerationRef.current;
    dispatch({ type: 'SET_CURRENT_EVENT', payload: event });
    const [cached] = await Promise.all([
      syncService.getCachedParticipants(event.id),
      syncService.setCurrentEvent(event),
    ]);
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

  const refreshParticipants = useCallback(async (): Promise<void> => {
    if (!state.currentEvent) return;
    const eventId = state.currentEvent.id;
    const generation = eventSelectionGenerationRef.current;
    const participants = await syncService.refreshParticipants(eventId);
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
    if (!state.currentEvent) return;
    const eventId = state.currentEvent.id;
    const generation = eventSelectionGenerationRef.current;
    await syncService.syncAll(eventId);
    if (
      eventSelectionGenerationRef.current !== generation
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
    const checkedInCount = state.participants.filter(p => p.checked_in_at).length;
    const totalCount = state.participants.length;
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
      const checkedInCount = state.participants.filter(p => p.checked_in_at).length;
      const totalCount = state.participants.length;
      liveActivityService.update(checkedInCount, totalCount);
    }
  }, [state.participants, state.currentEvent]);

  const value: AppContextValue = {
    state,
    login,
    devLogin,
    logout,
    selectEvent,
    refreshParticipants,
    updateParticipant,
    confirmParticipant,
    syncNow,
    startLiveActivity,
    stopLiveActivity,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
