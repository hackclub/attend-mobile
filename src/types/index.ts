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

export interface ParticipantNote {
  id: string;
  content: string;
  note_type?: 'ops' | 'safeguarding' | 'logistical';
  sensitivity?: 'normal' | 'restricted';
  created_at: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
}

export interface TravelLeg {
  id: string;
  position: number;
  flight_code?: string;
  departure_airport?: string;
  arrival_airport?: string;
  departure_time?: string;
  arrival_time?: string;
  live_status?: string;
  live_departure_time?: string;
  live_arrival_time?: string;
  airport_picked_up_at?: string;
}

export interface Travel {
  id: string;
  direction: 'inbound' | 'outbound';
  mode?: 'plane' | 'train' | 'car' | 'bus' | 'other';
  visa_status?: 'not_required' | 'pending' | 'applied' | 'approved' | 'denied';
  is_unaccompanied_minor: boolean;
  legs: TravelLeg[];
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
  headshot_url?: string;
  
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
  
  // Parent/Guardian contact
  parent_guardian_name?: string;
  parent_guardian_phone?: string;
  parent_guardian_email?: string;
  
  // Travel
  travel_inbound?: Travel;
  travel_outbound?: Travel;
  
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
  Search: undefined;
  AirportMode: undefined;
  Blasts: undefined;
};

export type QRCodeData = {
  type: 'participant';
  id: string;
};

export interface FlightLeg {
  id: string;
  flightCode: string;
  origin: string;
  destination: string;
  departureTime?: string;
  arrivalTime?: string;
  status: string;
}

export interface Flight {
  id: string;
  participantId: string;
  participantEventId: string;
  participantName: string;
  flightCode: string;
  legs: FlightLeg[];
  origin: string;
  destination: string;
  eta?: string;
  status: string;
  statusColor: string;
  isUnaccompaniedMinor: boolean;
  checkedInAt?: string;
}

export interface FlightAlert {
  id: string;
  type: 'delayed' | 'cancelled' | 'diverted';
  participantName: string;
  flightCode: string;
  message: string;
}

export interface FlightSection {
  title: string;
  data: Flight[];
}

export interface AirportModeStats {
  inbound: number;
  in_flight: number;
  arriving: number;
  waiting: number;
  checked_in: number;
}

export interface AirportModeData {
  stats: AirportModeStats;
  alerts: FlightAlert[];
  sections: FlightSection[];
}

export interface SlackBlast {
  id: string;
  message: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_by: string;
}

export interface SlackBlastCreateResponse {
  slack_blast: SlackBlast;
  message: string;
}

export type BlastsStackParamList = {
  BlastsList: undefined;
  NewBlast: undefined;
  BlastDetail: { blastId: string };
};
