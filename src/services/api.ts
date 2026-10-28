import { secureStorage } from './storage';
import { forbiddenParticipants } from './eventAccess';
import type {
  TravelCalendarData,
  TravelCalendarEntry,
  ApiResponse,
  BroadcastMessage,
  CreateScanOptions,
  CreateScanResponse,
  EscalationInput,
  Event,
  InboxMessage,
  InboxPage,
  Incident,
  IncidentFormOptions,
  IncidentInput,
  IncidentReportInput,
  IncidentReportOptions,
  IncidentStatus,
  IncidentSummary,
  MessageFormOptions,
  MessageInput,
  MessagePreview,
  MessageSummary,
  WithNotice,
  Participant,
  ParticipantNote,
  ParticipantsSyncPage,
  ScanContext,
  ScansSyncPage,
  Ticket,
  User,
} from '../types';

// Use local Rails server for development
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://192.168.0.218:3000' : 'https://attend.hackclub.com');
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const SCAN_REQUEST_TIMEOUT_MS = 8_000;

// What the travel calendar sends instead of a car journey's route for a role
// that can't see addresses. A sentinel, not data.
const HIDDEN_ADDRESS_SENTINEL = 'Address hidden';

/**
 * Strips the address-hidden sentinel out of a travel entry.
 *
 * A car journey's `route` is the participant's doorstep, so for a PII-restricted
 * role the API replaces it with a fixed string. Turning it back into a null
 * route plus a flag keeps it out of search haystacks, map links, and anything
 * else that would treat it as a real address.
 */
export function normalizeTravelCalendarEntry(entry: TravelCalendarEntry): TravelCalendarEntry {
  if (entry.route?.trim() !== HIDDEN_ADDRESS_SENTINEL) return entry;
  return { ...entry, route: null, routeRedacted: true };
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const token = await secureStorage.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = await this.getHeaders();
    const controller = new AbortController();
    const externalSignal = options.signal;
    const abortFromExternalSignal = () => controller.abort();
    if (externalSignal?.aborted) {
      controller.abort();
    } else {
      externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
    }
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    let response: Response;

    // A multipart body sets its own Content-Type, boundary included.
    if (options.body instanceof FormData) {
      delete (headers as Record<string, string>)['Content-Type'];
    }

    try {
      response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...headers,
          ...options.headers,
        },
      });
    } catch (error) {
      if (timedOut) {
        throw new ApiError('Request timed out. No scan was confirmed.', 0);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternalSignal);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      let message = `API Error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorBody);
        message = errorJson.message || errorJson.error || message;
      } catch {
        // If the response is HTML (like a Rails error page), show a generic message
        if (errorBody.includes('<!DOCTYPE') || errorBody.includes('<html')) {
          console.error(`[API] Server error ${response.status} at ${endpoint}:`, errorBody);
          message = `Server error (${response.status})`;
        } else if (errorBody && errorBody.length < 200) {
          message = errorBody;
        }
      }
      throw new ApiError(message, response.status);
    }

    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  /**
   * Runs a participants request, recording whether this event's participant
   * records are reachable at all.
   *
   * Every roster, search, and detail call goes through here so a single 403
   * teaches the whole app to stop offering the roster, and a later success
   * lets it back in without a sign-out.
   */
  private async trackParticipantAccess<T>(
    eventId: string,
    run: () => Promise<T>
  ): Promise<T> {
    try {
      const result = await run();
      forbiddenParticipants.clear(eventId);
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.isForbidden) {
        forbiddenParticipants.mark(eventId);
      }
      throw error;
    }
  }

  async exchangeCodeForToken(code: string, redirectUri?: string, codeVerifier?: string): Promise<{ token: string; user: User }> {
    console.log('Exchanging code for token:', { code: code.substring(0, 10) + '...', redirectUri });
    return this.request<{ token: string; user: User }>('/api/v1/session', {
      method: 'POST',
      body: JSON.stringify({ 
        code, 
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
  }

  // Dev-only: exchange a user_id or email for a token (the Rails /session
  // endpoint accepts either in development). Used by the LoginScreen dev
  // shortcuts. Emails are stable across dev databases; UUIDs are not.
  async devSession(identifier: { userId: string } | { email: string }): Promise<{ token: string; user: User }> {
    const body = 'userId' in identifier
      ? { user_id: identifier.userId }
      : { dev_email: identifier.email };
    return this.request<{ token: string; user: User }>('/api/v1/session', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getCurrentUser(): Promise<User> {
    // /api/v1/me returns the user fields at the top level (not wrapped in
    // `data`). Tolerate a legacy `{ data }` shape just in case.
    const response = await this.request<User & { data?: User }>('/api/v1/me');
    return response.data ?? response;
  }

  async getMyTickets(): Promise<Ticket[]> {
    const response = await this.request<{ tickets: Ticket[] }>('/api/v1/tickets');
    return response.tickets || [];
  }

  async getMyTicket(ticketId: string): Promise<Ticket> {
    const response = await this.request<{ ticket: Ticket }>(`/api/v1/tickets/${ticketId}`);
    return response.ticket;
  }

  async getGoogleWalletUrl(ticketId: string): Promise<string> {
    const response = await this.request<{ url: string }>(
      `/api/v1/tickets/${ticketId}/google_wallet`
    );
    return response.url;
  }

  async getEvents(): Promise<Event[]> {
    const response = await this.request<{ events: Event[] }>('/api/v1/events');
    console.log('Events response:', response);
    const events = response.events || [];
    // The payload carries each event's role, so roster access can be settled
    // before any screen asks for participants.
    forbiddenParticipants.applyEventRoles(events);
    return events;
  }

  async getEvent(eventId: string): Promise<Event> {
    const response = await this.request<ApiResponse<Event>>(`/api/v1/events/${eventId}`);
    return response.data;
  }

  async getParticipants(eventId: string, updatedSince?: string): Promise<ParticipantsSyncPage> {
    const query = updatedSince ? `?updated_since=${encodeURIComponent(updatedSince)}` : '';
    const response = await this.trackParticipantAccess(eventId, () =>
      this.request<Partial<ParticipantsSyncPage>>(
        `/api/v1/events/${eventId}/participants${query}`
      )
    );
    console.log('Participants response sample:', response.participants?.[0]);
    return {
      participants: response.participants ?? [],
      synced_at: response.synced_at ?? '',
    };
  }

  async searchParticipants(
    eventId: string,
    query: string,
    signal?: AbortSignal
  ): Promise<Participant[]> {
    const encodedQuery = encodeURIComponent(query);
    const response = await this.trackParticipantAccess(eventId, () =>
      this.request<{ results: Participant[] }>(
        `/api/v1/events/${eventId}/participants/search?q=${encodedQuery}`,
        { signal }
      )
    );
    return response.results || [];
  }

  async getParticipant(eventId: string, participantId: string): Promise<Participant> {
    const response = await this.trackParticipantAccess(eventId, () =>
      this.request<{ participant: Participant }>(
        `/api/v1/events/${eventId}/participants/${participantId}`
      )
    );
    return response.participant;
  }

  async getScanContexts(eventId: string): Promise<ScanContext[]> {
    const response = await this.request<{ scan_contexts: ScanContext[] }>(
      `/api/v1/events/${eventId}/scan_contexts`
    );
    return response.scan_contexts || [];
  }

  async getScans(eventId: string, since?: string): Promise<ScansSyncPage> {
    const query = since ? `?since=${encodeURIComponent(since)}` : '';
    const response = await this.request<Partial<ScansSyncPage>>(
      `/api/v1/events/${eventId}/scans${query}`
    );
    return {
      scans: response.scans ?? [],
      synced_at: response.synced_at ?? '',
      has_more: response.has_more ?? false,
    };
  }

  async createScan(
    eventId: string,
    participantId: string,
    options: CreateScanOptions
  ): Promise<CreateScanResponse> {
    return this.request<CreateScanResponse>(
      `/api/v1/events/${eventId}/scans`,
      {
        method: 'POST',
        signal: options.signal,
        body: JSON.stringify({
          participant_id: participantId,
          scan_context_id: options.scanContextId,
          client_scan_id: options.clientScanId,
          source: options.source,
          scanned_at: options.scannedAt,
        }),
      },
      SCAN_REQUEST_TIMEOUT_MS
    );
  }

  async createNfcScan(
    eventId: string,
    badgeToken: string,
    options: CreateScanOptions
  ): Promise<CreateScanResponse> {
    return this.request<CreateScanResponse>(
      `/api/v1/events/${eventId}/scans`,
      {
        method: 'POST',
        signal: options.signal,
        body: JSON.stringify({
          badge_token: badgeToken,
          scan_context_id: options.scanContextId,
          client_scan_id: options.clientScanId,
          source: options.source,
          scanned_at: options.scannedAt,
        }),
      },
      SCAN_REQUEST_TIMEOUT_MS
    );
  }

  async undoCheckIn(eventId: string, participantEventId: string, scanContextId?: string): Promise<void> {
    const url = scanContextId 
      ? `/api/v1/events/${eventId}/scans/${participantEventId}?scan_context_id=${scanContextId}`
      : `/api/v1/events/${eventId}/scans/${participantEventId}`;
    await this.request(url, {
      method: 'DELETE',
    });
  }

  async validateToken(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      return true;
    } catch (error) {
      // If it's a 401, token is invalid - return false
      if (error instanceof ApiError && error.isUnauthorized) {
        return false;
      }
      // For network errors or other issues, rethrow so caller can decide
      throw error;
    }
  }

  async getTravelCalendar(eventId: string): Promise<TravelCalendarData> {
    const data = await this.request<TravelCalendarData>(`/api/v1/events/${eventId}/travel`);
    return {
      ...data,
      entries: (data.entries ?? []).map(normalizeTravelCalendarEntry),
    };
  }

  async registerPushToken(token: string): Promise<void> {
    await this.request(`/api/v1/push_tokens`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async unregisterPushToken(token: string): Promise<void> {
    await this.request(`/api/v1/push_tokens`, {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
  }

  async getParticipantNotes(eventId: string, participantEventId: string): Promise<ParticipantNote[]> {
    const response = await this.request<{ notes: ParticipantNote[] }>(
      `/api/v1/events/${eventId}/participants/${participantEventId}/notes`
    );
    return response.notes || [];
  }

  async createParticipantNote(eventId: string, participantEventId: string, content: string): Promise<ParticipantNote> {
    const response = await this.request<{ note: ParticipantNote }>(
      `/api/v1/events/${eventId}/participants/${participantEventId}/notes`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      }
    );
    return response.note;
  }

  // Event incident log. Access follows IncidentPolicy: any role on the event.

  async getIncidents(eventId: string): Promise<IncidentSummary[]> {
    const response = await this.request<{ incidents: IncidentSummary[] }>(
      `/api/v1/events/${eventId}/incidents`
    );
    return response.incidents || [];
  }

  async getIncidentFormOptions(eventId: string): Promise<IncidentFormOptions> {
    return this.request<IncidentFormOptions>(`/api/v1/events/${eventId}/incidents/options`);
  }

  async getIncident(eventId: string, incidentId: string): Promise<Incident> {
    const response = await this.request<{ incident: Incident }>(
      `/api/v1/events/${eventId}/incidents/${incidentId}`
    );
    return response.incident;
  }

  async createIncident(
    eventId: string,
    incident: IncidentInput,
    escalation?: EscalationInput | null
  ): Promise<WithNotice<Incident>> {
    const response = await this.request<{ incident: Incident; notice?: string }>(
      `/api/v1/events/${eventId}/incidents`,
      {
        method: 'POST',
        body: JSON.stringify({ incident, escalate: !!escalation, escalation: escalation ?? undefined }),
      }
    );
    return { record: response.incident, notice: response.notice };
  }

  async updateIncident(eventId: string, incidentId: string, incident: IncidentInput): Promise<WithNotice<Incident>> {
    const response = await this.request<{ incident: Incident; notice?: string }>(
      `/api/v1/events/${eventId}/incidents/${incidentId}`,
      { method: 'PATCH', body: JSON.stringify({ incident }) }
    );
    return { record: response.incident, notice: response.notice };
  }

  async escalateIncident(
    eventId: string,
    incidentId: string,
    escalation: EscalationInput
  ): Promise<WithNotice<Incident>> {
    const response = await this.request<{ incident: Incident; notice?: string }>(
      `/api/v1/events/${eventId}/incidents/${incidentId}/escalate`,
      { method: 'POST', body: JSON.stringify({ escalation }) }
    );
    return { record: response.incident, notice: response.notice };
  }

  async createIncidentComment(
    eventId: string,
    incidentId: string,
    body: string,
    newStatus?: IncidentStatus | null
  ): Promise<{ incident_status: IncidentStatus }> {
    return this.request<{ incident_status: IncidentStatus }>(
      `/api/v1/events/${eventId}/incidents/${incidentId}/comments`,
      { method: 'POST', body: JSON.stringify({ comment: { body, new_status: newStatus || '' } }) }
    );
  }

  // Organizer broadcasts. Access: anyone with access to the event.

  async getMessages(eventId: string): Promise<MessageSummary[]> {
    const response = await this.request<{ messages: MessageSummary[] }>(
      `/api/v1/events/${eventId}/messages`
    );
    return response.messages || [];
  }

  async getMessageFormOptions(eventId: string): Promise<MessageFormOptions> {
    return this.request<MessageFormOptions>(`/api/v1/events/${eventId}/messages/options`);
  }

  async getMessage(eventId: string, messageId: string): Promise<BroadcastMessage> {
    const response = await this.request<{ message: BroadcastMessage }>(
      `/api/v1/events/${eventId}/messages/${messageId}`
    );
    return response.message;
  }

  async createMessage(eventId: string, message: MessageInput): Promise<BroadcastMessage> {
    const response = await this.request<{ message: BroadcastMessage }>(
      `/api/v1/events/${eventId}/messages`,
      { method: 'POST', body: JSON.stringify({ message }) }
    );
    return response.message;
  }

  async updateMessage(eventId: string, messageId: string, message: MessageInput): Promise<BroadcastMessage> {
    const response = await this.request<{ message: BroadcastMessage }>(
      `/api/v1/events/${eventId}/messages/${messageId}`,
      { method: 'PATCH', body: JSON.stringify({ message }) }
    );
    return response.message;
  }

  async deleteMessage(eventId: string, messageId: string): Promise<void> {
    await this.request(`/api/v1/events/${eventId}/messages/${messageId}`, { method: 'DELETE' });
  }

  async previewMessage(eventId: string, messageId: string): Promise<MessagePreview> {
    const response = await this.request<{ preview: MessagePreview }>(
      `/api/v1/events/${eventId}/messages/${messageId}/preview`
    );
    return response.preview;
  }

  /**
   * One of the message's member actions (send_now, cancel, retry_failed,
   * retry_delivery, send_to_new_recipients). Each answers with the updated
   * message and the notice the web would flash.
   */
  async messageAction(
    eventId: string,
    messageId: string,
    action: 'send_now' | 'cancel' | 'retry_failed' | 'retry_delivery' | 'send_to_new_recipients',
    params: Record<string, string> = {}
  ): Promise<WithNotice<BroadcastMessage>> {
    const response = await this.request<{ message: BroadcastMessage; notice?: string }>(
      `/api/v1/events/${eventId}/messages/${messageId}/${action}`,
      { method: 'POST', body: JSON.stringify(params) }
    );
    return { record: response.message, notice: response.notice };
  }

  // The participant's own inbox.

  async getInbox(filters: { eventId?: string | null; q?: string } = {}, signal?: AbortSignal): Promise<InboxPage> {
    const query = new URLSearchParams();
    if (filters.eventId) query.set('event_id', filters.eventId);
    if (filters.q) query.set('q', filters.q);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await this.request<Partial<InboxPage>>(`/api/v1/messages${suffix}`, { signal });
    return {
      messages: response.messages ?? [],
      unread_count: response.unread_count ?? 0,
      events: response.events ?? [],
    };
  }

  async getInboxMessage(messageId: string): Promise<InboxMessage> {
    const response = await this.request<{ message: InboxMessage }>(`/api/v1/messages/${messageId}`);
    return response.message;
  }

  // The confidential report form, for anyone signed in.

  async getIncidentReportOptions(): Promise<IncidentReportOptions> {
    return this.request<IncidentReportOptions>('/api/v1/incident_reports/options');
  }

  async submitIncidentReport(report: IncidentReportInput): Promise<{ id: string; priority: string }> {
    const form = new FormData();
    const fields: (keyof IncidentReportInput)[] = [
      'reporter_name',
      'reporter_email',
      'reporter_phone',
      'reporter_role',
      'incident_type',
      'priority',
      'summary',
      'details',
    ];
    for (const field of fields) {
      form.append(`incident_report[${field}]`, String(report[field] ?? ''));
    }
    form.append('incident_report[emergency_services_called]', report.emergency_services_called ? '1' : '0');
    form.append('event_choice', report.event_choice);
    for (const file of report.attachments) {
      // React Native's FormData takes a { uri, name, type } descriptor for a file.
      form.append('incident_report[attachments][]', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
      } as unknown as Blob);
    }

    const response = await this.request<{ incident_report: { id: string; priority: string } }>(
      '/api/v1/incident_reports',
      { method: 'POST', body: form },
      // Attachments can be large; give the upload longer than a JSON call.
      120_000
    );
    return response.incident_report;
  }

}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export const api = new ApiClient();

export const setApiBaseUrl = (url: string) => {
  Object.assign(api, new ApiClient(url));
};
