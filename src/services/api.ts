import { secureStorage } from './storage';
import type {
  AirportModeData,
  ApiResponse,
  CreateScanOptions,
  CreateScanResponse,
  Event,
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

  // Dev-only: exchange a user_id for a token (the Rails /session endpoint
  // accepts user_id in development). Used by the LoginScreen dev shortcut.
  async devSession(userId: string): Promise<{ token: string; user: User }> {
    return this.request<{ token: string; user: User }>('/api/v1/session', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
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
    return response.events || [];
  }

  async getEvent(eventId: string): Promise<Event> {
    const response = await this.request<ApiResponse<Event>>(`/api/v1/events/${eventId}`);
    return response.data;
  }

  async getParticipants(eventId: string, updatedSince?: string): Promise<ParticipantsSyncPage> {
    const query = updatedSince ? `?updated_since=${encodeURIComponent(updatedSince)}` : '';
    const response = await this.request<Partial<ParticipantsSyncPage>>(
      `/api/v1/events/${eventId}/participants${query}`
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
    const response = await this.request<{ results: Participant[] }>(
      `/api/v1/events/${eventId}/participants/search?q=${encodedQuery}`,
      { signal }
    );
    return response.results || [];
  }

  async getParticipant(eventId: string, participantId: string): Promise<Participant> {
    const response = await this.request<{ participant: Participant }>(
      `/api/v1/events/${eventId}/participants/${participantId}`
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

  async getAirportMode(eventId: string, tab: 'inbound' | 'outbound' = 'inbound'): Promise<AirportModeData> {
    const response = await this.request<AirportModeData>(
      `/api/v1/events/${eventId}/airport_mode?tab=${tab}`
    );
    return response;
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
