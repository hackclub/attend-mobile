export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  // Role flags from the API (/session and /me). Used to decide which
  // experience to show: organizers get the scanner app, participants get
  // their tickets. A user can be both.
  global_admin?: boolean;
  is_organizer?: boolean;
  is_participant?: boolean;
}

// A participant's own ticket for an event (their participant_event), as
// returned by GET /api/v1/tickets. Distinct from the organizer-facing
// Participant type.
export interface Ticket {
  id: string; // participant_event id
  participant_id: string;
  status: string;
  display_status: string;
  // True once the attendee has finished onboarding. Only confirmed tickets
  // show a check-in QR; unconfirmed ones link out to onboarding.
  confirmed: boolean;
  checked_in: boolean;
  attendee_name: string;
  // QR payload the scanner reads, e.g. "attend://checkin/{participant_id}".
  qr_payload: string;
  short_code: string;
  apple_wallet_url?: string | null;
  onboarding_url: string;
  event: Event;
  travel_inbound?: Travel | null;
  messages?: TicketMessage[];
  can_download_ticket?: boolean;
  can_download_excuse_letter?: boolean;
}

// A delivered message from an event organizer, shown on the ticket.
export interface TicketMessage {
  id: string;
  subject?: string | null;
  body: string;
  sender_name?: string | null;
  delivered_at?: string | null;
}

// A user's standing on one event, as reported by GET /api/v1/events. Mirrors
// EventRoleAssignment's enum plus the two standings that are inherited rather
// than stored: a global admin, and a member of the event's series.
export type EventRole =
  | 'global_admin'
  | 'series_member'
  | 'event_admin'
  | 'safeguarding_lead'
  | 'ops'
  | 'limited'
  | 'read_only';

export interface Event {
  id: string;
  name: string;
  slug: string;
  starts_at?: string;
  ends_at?: string;
  timezone?: string;
  location_city?: string;
  location_address?: string;
  location_country?: string;
  location_latitude?: number | null;
  location_longitude?: number | null;
  logo_url?: string;
  banner_url?: string;
  // The caller's standing on this event, and whether that standing includes
  // participants' exact dates of birth and addresses. Both are absent on
  // servers that predate the fields, and on any event cached by an older
  // build, so "missing" means unknown — never treat it as a restriction.
  // A role this build doesn't recognise must fall through to a safe default.
  role?: EventRole | (string & {});
  can_view_participant_pii?: boolean;
  // Explicit capability flags, same "missing means unknown" rule. When present
  // they win over anything inferred from the role.
  can_view_participants?: boolean;
  can_view_sensitive_data?: boolean;
  // Whether the event runs travel at all; no Travel tab when it's false.
  travel_enabled?: boolean;
  // Whether the incident log answers for this role (any role on the event
  // itself; series membership alone doesn't count).
  can_view_incidents?: boolean;
}

export interface EmergencyContact {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  relationship?: string;
  priority?: number;
  is_primary?: boolean;
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
  // Omitted entirely (not sent as null) for a role that can't see PII, so
  // render `age` on its own rather than deriving it from the birthday.
  date_of_birth?: string;
  age?: number | null;
  tshirt_size?: string;
  secondary_email?: string;
  engagement_preference?: string;
  engagement_notes?: string;
  // Omitted entirely for a role that can't see PII.
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
  // The participant's doorstep for a car journey. Omitted entirely for a role
  // that can't see PII.
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
  headshot_url?: string | null;
  
  // Status
  status: string;
  checked_in_at?: string | null;
  
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
  // Only sent to roles that see sensitive data; absent isn't "not granted".
  freedom_waiver_granted?: boolean;
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
  position?: number;
  // iso8601 with the event's utc offset, e.g. "2026-07-15T18:00:00-04:00"
  starts_at?: string | null;
  ends_at?: string | null;
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
  scanned_at: string;
  scanned_by?: string;
  client_scan_id?: string | null;
  source?: ScanSource;
  scan_context?: ScanContext | null;
  created_at: string;
}

export type ScanSource = 'qr' | 'nfc' | 'manual';

export type ScanOutcome = 'scanned' | 'already_scanned';

export interface CreateScanOptions {
  scanContextId?: string;
  clientScanId: string;
  source: ScanSource;
  scannedAt: string;
  signal?: AbortSignal;
}

export interface CreateScanResponse {
  success: true;
  outcome?: ScanOutcome;
  first_scan_in_context: boolean;
  first_scanned_at?: string;
  deduplicated?: boolean;
  scan: RemoteScan;
  scan_context?: ScanContext;
  participant: Participant;
}

export interface ParticipantsSyncPage {
  participants: Participant[];
  synced_at: string;
}

export interface ScansSyncPage {
  scans: RemoteScan[];
  // Next sync cursor. When has_more is true this is the created_at of the
  // last scan in the page (ISO8601 with fractional seconds) — store it
  // verbatim, never round-trip it through Date.
  synced_at: string;
  has_more: boolean;
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
  ParticipantMain: undefined;
  ParticipantDetail: { participant: Participant };
  TicketDetail: { ticket: Ticket };
  IncidentList: undefined;
  IncidentDetail: { incidentId: string };
  IncidentForm: { incidentId?: string };
  MessageList: undefined;
  MessageDetail: { messageId: string };
  MessageCompose: { messageId?: string };
  MessagePreview: { messageId: string };
  Inbox: undefined;
  InboxMessage: { messageId: string };
  IncidentReport: undefined;
  KioskSetup: { scanContextId?: string; scanContextName?: string };
  Kiosk: {
    pin: string;
    biometricUnlock: boolean;
    scanContextId?: string;
    scanContextName?: string;
  };
};

export type MainTabParamList = {
  Events: undefined;
  Scanner: undefined;
  Search: undefined;
  Travel: undefined;
};

export type ParticipantTabParamList = {
  MyTickets: undefined;
};

export type QRCodeData = {
  type: 'participant';
  id: string;
};

// Travel calendar (the successor to "airport mode"): the API returns every
// participant journey for an event, grouped client-side by agenda date.
export type TravelDirection = 'inbound' | 'outbound';
export type TravelMode = 'plane' | 'train' | 'car' | 'bus' | 'other';
export type TravelPickupState =
  | 'awaiting_pickup'
  | 'collected'
  | 'checked_in'
  | 'pickup_not_needed';

export interface TravelCalendarGroup {
  id: string;
  name: string;
  color?: string | null;
}

export interface TravelCalendarEntry {
  id: string;
  participantId: string;
  participantEventId: string;
  participantName: string;
  participantPreferredName?: string | null;
  direction: TravelDirection;
  mode: TravelMode;
  // ISO timestamp already expressed in the event's timezone offset.
  primaryTimeAt?: string | null;
  // YYYY-MM-DD in the event's timezone; null means unscheduled.
  agendaDate?: string | null;
  route?: string | null;
  // Set when the API replaced this entry's route with its address-hidden
  // sentinel, so the row can explain the gap instead of showing a blank.
  routeRedacted?: boolean;
  reference?: string | null;
  details?: string | null;
  pickupState?: TravelPickupState | null;
  isUnaccompaniedMinor: boolean;
  groups: TravelCalendarGroup[];
}

export interface TravelCalendarCounts {
  total: number;
  inbound: number;
  outbound: number;
  scheduled: number;
  unscheduled: number;
  awaitingPickup: number;
  collected: number;
  checkedIn: number;
  pickupNotNeeded: number;
}

export interface TravelCalendarData {
  eventTimezone?: string | null;
  dates: string[];
  entries: TravelCalendarEntry[];
  counts: TravelCalendarCounts;
}

// An option in a server-supplied pick list.
export interface SelectOption {
  value: string;
  label: string;
}

// One step of the S0–S3 triage scale (IncidentLevel on the server).
export interface IncidentLevel {
  value: string;
  code: string;
  name: string;
  target: string;
  label: string;
  color: 'red' | 'amber' | 'green' | 'blue' | (string & {});
  examples: string[];
}

export type IncidentCategory = 'safeguarding' | 'medical' | 'behavior' | 'other';
export type IncidentStatus = 'open' | 'in_review' | 'closed';
// An HQ report's status, which says "resolved" where an incident says "closed".
export type HqReportStatus = 'open' | 'in_review' | 'resolved';

export interface IncidentPerson {
  id: string;
  name: string;
  email?: string | null;
}

export interface IncidentMedication {
  id?: string;
  name: string;
  dose: string;
  notes?: string | null;
}

export interface IncidentSummary {
  id: string;
  category: IncidentCategory;
  severity: string;
  status: IncidentStatus;
  summary?: string | null;
  location?: string | null;
  occurred_at?: string | null;
  created_at: string;
  reported_by?: IncidentPerson | null;
  participant_names: string[];
  hq_report?: { id: string; status: HqReportStatus; created_at: string } | null;
}

export type IncidentTimelineItem =
  | {
      type: 'comment';
      id: string;
      body: string;
      new_status?: IncidentStatus | null;
      author_name?: string | null;
      source?: string | null;
      slack_url?: string | null;
      created_at: string;
    }
  | {
      type: 'change';
      id: string;
      action: 'created' | 'updated';
      actor_name: string;
      fields: string[];
      created_at: string;
    };

export interface Incident extends IncidentSummary {
  details?: string | null;
  // Null for a reporter who holds none of the incident's roles: they get a
  // receipt, not the casework.
  actions_taken?: string | null;
  visible_to_roles: string[];
  medication_dispensed: boolean;
  medications: IncidentMedication[];
  participants: IncidentPerson[];
  helping_staff: IncidentPerson[];
  timeline: IncidentTimelineItem[];
  permissions: {
    update: boolean;
    comment: boolean;
    change_status: boolean;
    view_casework: boolean;
    escalate: boolean;
  };
}

export interface IncidentFormOptions {
  categories: SelectOption[];
  levels: IncidentLevel[];
  statuses: SelectOption[];
  roles: SelectOption[];
  default_visible_to_roles: string[];
  default_severity: string;
  emergency_level: string;
  participants: IncidentPerson[];
  staff: IncidentPerson[];
  reporter_phone?: string | null;
}

export interface IncidentInput {
  category: string;
  severity: string;
  status: string;
  summary: string;
  details: string;
  actions_taken: string;
  location: string;
  occurred_at: string | null;
  medication_dispensed: boolean;
  visible_to_roles: string[];
  participant_event_ids: string[];
  helping_staff_ids: string[];
  medications_attributes: (IncidentMedication & { _destroy?: boolean })[];
}

export interface EscalationInput {
  reporter_phone: string;
  emergency_services_called: boolean;
}

// Organizer broadcasts (Message on the server).
export type MessageStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'cancelled';
export type MessageChannel = 'slack' | 'email' | 'sms' | 'push';
export type DeliveryStatus = 'pending' | 'sending' | 'delivered' | 'failed';

export interface MessageSummary {
  id: string;
  subject?: string | null;
  status: MessageStatus;
  audience: string;
  audience_label: string;
  channels: MessageChannel[];
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  scheduled_at?: string | null;
  sent_at?: string | null;
  created_at: string;
  sent_by?: string | null;
  preview_text: string;
}

export interface MessageDelivery {
  id: string;
  channel: MessageChannel;
  status: DeliveryStatus;
  // Null for an SMS when the role can't see phone numbers.
  recipient_identifier?: string | null;
  error_message?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
}

export interface MessageRecipient {
  id: string;
  name: string;
  kind: 'attendee' | 'guardian';
  catch_up: boolean;
  deliveries: MessageDelivery[];
}

export interface BroadcastMessage extends MessageSummary {
  body: string;
  body_html: string;
  participant_event_ids: string[];
  group_ids: string[];
  opened_count?: number | null;
  pending_count: number;
  new_recipient_count: number;
  recipients: MessageRecipient[];
  permissions: {
    edit: boolean;
    send_now: boolean;
    destroy: boolean;
    cancel: boolean;
    retry_failed: boolean;
    send_to_new_recipients: boolean;
  };
}

export interface MessageFormOptions {
  audiences: SelectOption[];
  channels: (SelectOption & { disabled: boolean; description?: string | null })[];
  groups: { id: string; name: string; color?: string | null }[];
  participants: { id: string; name: string; email: string; status: string }[];
  defaults: { audience: string; channels: MessageChannel[] };
}

export interface MessageInput {
  subject: string;
  body: string;
  audience: string;
  channels: string[];
  participant_event_ids: string[];
  group_ids: string[];
  scheduled_at: string | null;
}

export interface MessagePreview {
  total_count: number;
  recipient_names: string[];
  audience_label: string;
  channel_labels: string;
  channels: MessageChannel[];
  slack_text?: string | null;
  email_subject?: string | null;
  body_html: string;
  sms_text?: string | null;
  sms_length: number;
  sms_segments: number;
  scheduled_at?: string | null;
  scheduled_in_future: boolean;
}

// Mutations answer with the record plus the flash the web would show.
export interface WithNotice<T> {
  record: T;
  notice?: string | null;
}

// The participant's inbox (/dashboard/messages).
export interface InboxMessageSummary {
  id: string;
  subject?: string | null;
  preview_text: string;
  event: { id: string; name: string };
  ticket_id?: string | null;
  channels: MessageChannel[];
  delivered_at?: string | null;
  sender_name?: string | null;
  unread: boolean;
}

export interface InboxPage {
  messages: InboxMessageSummary[];
  unread_count: number;
  events: { id: string; name: string }[];
}

export interface InboxMessage {
  id: string;
  subject?: string | null;
  body_html: string;
  event: { id: string; name: string };
  ticket_id?: string | null;
  channels: MessageChannel[];
  delivered_at?: string | null;
  sender_name?: string | null;
}

// The confidential report form (/incident).
export interface IncidentReportEventOption extends SelectOption {
  emergency_allowed: boolean;
}

export interface IncidentReportOptions {
  roles: SelectOption[];
  incident_types: SelectOption[];
  levels: IncidentLevel[];
  emergency_level: string;
  default_level: string;
  events: IncidentReportEventOption[];
  custom_events: IncidentReportEventOption[];
  organizer_events: { id: string; name: string }[];
  max_attachment_count: number;
  max_attachment_bytes: number;
  prefill: {
    reporter_name?: string | null;
    reporter_email?: string | null;
    reporter_phone?: string | null;
  };
}

export interface ReportAttachment {
  uri: string;
  name: string;
  mimeType: string;
  size?: number | null;
}

export interface IncidentReportInput {
  reporter_name: string;
  reporter_email: string;
  reporter_phone: string;
  reporter_role: string;
  incident_type: string;
  emergency_services_called: boolean;
  priority: string;
  summary: string;
  details: string;
  event_choice: string;
  attachments: ReportAttachment[];
}
