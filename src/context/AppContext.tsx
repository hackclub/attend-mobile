import React, { createContext, useContext, useReducer, useEffect, useCallback, ReactNode } from 'react';
import { authService } from '../services/auth';
import { syncService, SyncStatus } from '../services/sync';
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
  | { type: 'UPDATE_PARTICIPANT'; payload: Participant }
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
      return {
        ...state,
        participants: state.participants.map(p =>
          (p.participant_event_id === action.payload.participant_event_id) ? action.payload : p
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
  logout: () => Promise<void>;
  selectEvent: (event: Event) => Promise<void>;
  refreshParticipants: () => Promise<void>;
  updateParticipant: (participant: Participant) => void;
  syncNow: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    const restoreAuth = async () => {
      const result = await authService.restoreSession();
      if (result.success && result.user) {
        const token = await authService.getToken();
        dispatch({ type: 'SET_AUTH', payload: { user: result.user, token: token! } });
        
        const cachedEvent = await syncService.getCurrentEvent();
        if (cachedEvent) {
          dispatch({ type: 'SET_CURRENT_EVENT', payload: cachedEvent });
          const participants = await syncService.getCachedParticipants(cachedEvent.id);
          dispatch({ type: 'SET_PARTICIPANTS', payload: participants });
        }
        
        const events = await syncService.getCachedEvents();
        dispatch({ type: 'SET_EVENTS', payload: events });
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    restoreAuth();
  }, []);

  useEffect(() => {
    const unsubscribe = syncService.subscribe((status) => {
      dispatch({ type: 'SET_SYNC_STATUS', payload: status });
    });

    syncService.getStatus().then((status) => {
      dispatch({ type: 'SET_SYNC_STATUS', payload: status });
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

  const logout = useCallback(async (): Promise<void> => {
    await authService.logout();
    await syncService.clear();
    dispatch({ type: 'CLEAR_AUTH' });
  }, []);

  const selectEvent = useCallback(async (event: Event): Promise<void> => {
    dispatch({ type: 'SET_CURRENT_EVENT', payload: event });
    await syncService.setCurrentEvent(event);
    
    const cached = await syncService.getCachedParticipants(event.id);
    dispatch({ type: 'SET_PARTICIPANTS', payload: cached });

    try {
      const fresh = await syncService.refreshParticipants(event.id);
      dispatch({ type: 'SET_PARTICIPANTS', payload: fresh });
    } catch {
    }
  }, []);

  const refreshParticipants = useCallback(async (): Promise<void> => {
    if (!state.currentEvent) return;
    const participants = await syncService.refreshParticipants(state.currentEvent.id);
    dispatch({ type: 'SET_PARTICIPANTS', payload: participants });
  }, [state.currentEvent]);

  const updateParticipant = useCallback((participant: Participant): void => {
    dispatch({ type: 'UPDATE_PARTICIPANT', payload: participant });
  }, []);

  const syncNow = useCallback(async (): Promise<void> => {
    if (!state.currentEvent) return;
    await syncService.syncAll(state.currentEvent.id);
    const participants = await syncService.getCachedParticipants(state.currentEvent.id);
    dispatch({ type: 'SET_PARTICIPANTS', payload: participants });
  }, [state.currentEvent]);

  const value: AppContextValue = {
    state,
    login,
    logout,
    selectEvent,
    refreshParticipants,
    updateParticipant,
    syncNow,
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
