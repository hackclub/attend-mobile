export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface Event {
  id: string;
  name: string;
  slug: string;
  starts_at?: string;
  ends_at?: string;
  timezone?: string;
  location_city?: string;
}

export interface EmergencyContact {
  id?: string;
  name: string;
  phone: string;
  relationship?: string;
  priority?: number;
}

export interface Participant {
  // Core identifiers (from API using snake_case)
  participant_id: string;
  participant_event_id: string;
  
  // Names
  display_name: string;
  full_name: string;
  
  // Contact
  email: string;
  phone?: string;
  pronouns?: string;
  
  // Status
  status: string;
  checked_in_at?: string;
  
  // Medical
  has_anaphylaxis_risk: boolean;
  requires_refrigeration: boolean;
  allergies?: string;
  medical_conditions?: string;
  medications?: string;
  
  // Dietary
  diet_type?: string;
  life_threatening_allergies?: string;
  cross_contamination_risk: boolean;
  
  // Safeguarding
  freedom_waiver_granted: boolean;
  high_support_flag: boolean;
  can_leave_unaccompanied: boolean;
  
  // Waiver
  waiver_signed: boolean;
  
  // Emergency contacts
  emergency_contacts?: EmergencyContact[];
  
  // Timestamp
  updated_at?: string;
}

export interface Scan {
  id?: string;
  participantId: string;
  eventId: string;
  scannedAt: string;
  scannedById: string;
  synced: boolean;
}

export interface PendingScan {
  localId: string;
  participantId: string;
  eventId: string;
  scannedAt: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  message: string;
  status: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
}

export interface SyncState {
  lastSyncAt: string | null;
  pendingScans: number;
  isSyncing: boolean;
  isOnline: boolean;
}

export interface AppState {
  auth: AuthState;
  sync: SyncState;
  currentEvent: Event | null;
  events: Event[];
  participants: Map<string, Participant[]>;
}

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  ParticipantDetail: { participant: Participant };
};

export type MainTabParamList = {
  Events: undefined;
  Scanner: undefined;
  CheckedIn: undefined;
  Search: undefined;
};

export type QRCodeData = {
  type: 'participant';
  id: string;
};
