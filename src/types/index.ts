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
  email?: string;
  relationship?: string;
  priority?: number;
}

export interface Address {
  line_1?: string;
  line_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface PersonalDetails {
  legal_first_name?: string;
  legal_last_name?: string;
  preferred_name?: string;
  date_of_birth?: string;
  age?: number | null;
  tshirt_size?: string;
  secondary_email?: string;
  engagement_preference?: string;
  engagement_notes?: string;
  address?: Address;
}

export interface Accommodation {
  check_in_date?: string;
  check_out_date?: string;
  gender_identity?: string;
  gender_identity_other?: string;
  assigned_room?: string;
  rooming_exempt?: boolean;
  venue_name?: string;
  preferred_roommate_genders?: string[];
  roommate_preferences?: string;
  roommate_exclusions?: string;
  quiet_room_preference?: boolean;
  room_type_preference?: string;
  accessibility_needs?: string;
  notes?: string;
}

export interface MedicalDetail {
  allergy_severity?: string;
  emergency_action_plan?: string;
  additional_notes?: string;
}

export interface DietaryDetail {
  intolerances?: string;
  notes?: string;
}

export interface AccessibilityDetail {
  mobility_needs?: string;
  uses_wheelchair?: boolean;
  step_free_required?: boolean;
  sensory_needs?: string;
  light_sensitivity?: boolean;
  noise_sensitivity?: boolean;
  strobe_sensitivity?: boolean;
  communication_needs?: string;
  needs_captioning?: boolean;
  needs_large_print?: boolean;
  needs_sign_language?: boolean;
  neurodivergent_notes?: string;
  has_adhd?: boolean;
  has_autism?: boolean;
  has_dyslexia?: boolean;
  religious_practices?: string;
  prayer_space_required?: boolean;
  requires_private_space?: boolean;
  distance_limitations?: string;
  unavailable_times?: string;
  other_needs?: string;
}

export interface SafeguardingDetail {
  high_support_notes?: string;
  authorized_pickup_adults?: string;
  other_instructions?: string;
  curfew_acknowledged?: boolean;
  overnight_rules_acknowledged?: boolean;
}

export interface Consent {
  id: string;
  consent_type: string;
  status: string;
  pending_on?: string;
  sent_at?: string;
  viewed_at?: string | null;
  participant_signed_at?: string;
  guardian_signed_at?: string;
  signed_at?: string;
  document_url?: string;
  failure_reason?: string;
}

export interface Guardian {
  id: string;
  guardian_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  relationship?: string;
  is_primary?: boolean;
  status?: string;
  accepted_at?: string;
  completed_at?: string;
  invited_via_email?: string;
  invite_token_sent_at?: string;
  media_permission?: boolean;
  photo_permission?: boolean;
  travel_permission?: boolean;
  emergency_medical_consent?: boolean;
  otc_medication_consent?: boolean;
  emergency_contacts?: EmergencyContact[];
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
  visa_required?: boolean;
  visa_status?: 'not_required' | 'pending' | 'applied' | 'approved' | 'denied';
  visa_type?: string;
  visa_number?: string;
  passport_nationality?: string;
  is_unaccompanied_minor: boolean;
  carrier?: string;
  flight_number?: string;
  train_departure_station?: string;
  train_arrival_station?: string;
  departure_station?: string;
  arrival_station?: string;
  departure_city?: string;
  arrival_city?: string;
  departure_time?: string;
  arrival_time?: string;
  expected_arrival_time?: string;
  bus_departure_location?: string;
  bus_arrival_location?: string;
  origin_address?: string;
  other_details?: string;
  notes?: string;
  pickup_dismissed_at?: string;
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

  // Scans by context
  scans_by_context?: ScanByContext[];

  // Detailed fields (only present when fetched via show endpoint)
  personal?: PersonalDetails;
  accommodation?: Accommodation;
  consents?: Consent[];
  guardians?: Guardian[];
  medical_detail?: MedicalDetail;
  dietary_detail?: DietaryDetail;
  accessibility?: AccessibilityDetail;
  safeguarding_detail?: SafeguardingDetail;
  
  // NFC Badge
  nfc_badge_token?: string;
  nfc_badge_assigned?: boolean;
  slack_user_id?: string;
  
  // Timestamp
  updated_at?: string;
}

export interface ScanContext {
  id: string;
  name: string;
  checks_in: boolean;
  is_airport: boolean;
  position: number;
}

export interface ScanByContext {
  scan_context_id: string;
  scan_context_name: string;
  checks_in: boolean;
  is_airport: boolean;
  scan_count: number;
  first_scanned_at?: string;
  last_scanned_at?: string;
}

export interface Scan {
  id?: string;
  participantId: string;
  eventId: string;
  scannedAt: string;
  scannedById: string;
  synced: boolean;
  scan_context?: {
    id: string;
    name: string;
    checks_in: boolean;
    is_airport: boolean;
  };
}

// Scan as returned by GET /api/v1/events/:event_id/scans (server shape)
export interface RemoteScan {
  id: string;
  participant_id?: string;
  participant_event_id?: string;
  scan_context_id?: string;
  scanned_at?: string;
  created_at: string;
}

export interface ScansSyncPage {
  scans: RemoteScan[];
  // Next sync cursor. When has_more is true this is the created_at of the
  // last scan in the page (ISO8601 with fractional seconds) — store it
  // verbatim, never round-trip it through Date.
  synced_at: string;
  has_more: boolean;
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
  KioskSetup: undefined;
  Kiosk: { pin: string; biometricUnlock: boolean };
};

export type MainTabParamList = {
  Events: undefined;
  Scanner: undefined;
  Search: undefined;
  AirportMode: undefined;
};

export type QRCodeData = {
  type: 'participant';
  id: string;
};

export type JourneyStatus =
  | 'scheduled'
  | 'in_flight'
  | 'landed'
  | 'picked_up'
  | 'cancelled'
  | 'diverted';

export type StatusColor = 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'orange';

export type AirportTab = 'inbound' | 'outbound';

export interface FlightLeg {
  id: string;
  flightCode: string;
  origin: string;
  destination: string;
  departureTime?: string;
  arrivalTime?: string;
  status: JourneyStatus | string;
  statusLabel?: string;
  statusColor?: StatusColor;
  departureTerminal?: string;
  departureGate?: string;
  arrivalTerminal?: string;
  arrivalGate?: string;
  delayMinutes?: number;
  isDelayed?: boolean;
}

export interface Journey {
  id: string;
  participantId: string;
  participantEventId: string;
  participantName: string;
  participantFullName: string;
  participantHasHeadshot: boolean;
  participantHeadshotUrl?: string | null;
  direction: AirportTab;
  status: JourneyStatus;
  statusLabel: string;
  statusColor: StatusColor;
  isDelayed: boolean;
  delayMinutes: number;
  isUnaccompaniedMinor: boolean;
  arrivingNow: boolean;
  isAlert: boolean;
  scannedIn: boolean;
  scannedAt?: string | null;
  legCount: number;
  primaryAirport?: string | null;
  primaryTerminal?: string | null;
  primaryGate?: string | null;
  primaryTimezone?: string | null;
  primaryTimeIso?: string | null;
  primaryScheduledIso?: string | null;
  progress?: number | null;
  lastTrackedAt?: string | null;
  legs: FlightLeg[];
}

export interface AirportCounts {
  total: number;
  alerts: number;
  cancelled: number;
  diverted: number;
  delayed: number;
  landed_waiting: number;
  picked_up: number;
  in_flight: number;
  scheduled: number;
  arriving_now: number;
  ums: number;
}

export interface AirportModeData {
  tab: AirportTab;
  last_refreshed_at?: string | null;
  event_timezone?: string;
  counts: {
    inbound: Partial<AirportCounts>;
    outbound: Partial<AirportCounts>;
  };
  airports: string[];
  terminals: string[];
  journeys: Journey[];
}


