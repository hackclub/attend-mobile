import { secureStorage } from './storage';
import type { Event, Participant, ParticipantNote, Scan, ScansSyncPage, User, ApiResponse, AirportModeData, ScanContext } from '../types';

// Use local Rails server for development
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://192.168.0.218:3000' : 'https://attend.hackclub.com');

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const token = await secureStorage.getToken();
    console.log('[API] Token present:', !!token, token ? `${token.substring(0, 10)}...` : 'none');
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
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = await this.getHeaders();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

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

  async getCurrentUser(): Promise<User> {
    const response = await this.request<ApiResponse<User>>('/api/v1/me');
    return response.data;
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

  async getParticipants(eventId: string): Promise<Participant[]> {
    const response = await this.request<{ participants: Participant[] }>(
      `/api/v1/events/${eventId}/participants`
    );
    console.log('Participants response sample:', response.participants?.[0]);
    return response.participants || [];
  }

  async searchParticipants(eventId: string, query: string): Promise<Participant[]> {
    const encodedQuery = encodeURIComponent(query);
    const response = await this.request<{ results: Participant[] }>(
      `/api/v1/events/${eventId}/participants/search?q=${encodedQuery}`
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

  async createScan(eventId: string, participantId: string, scanContextId?: string): Promise<{ scan: Scan; participant: Participant; first_scan_in_context: boolean }> {
    const response = await this.request<{ scan: Scan; participant: Participant; first_scan_in_context: boolean }>(
      `/api/v1/events/${eventId}/scans`,
      {
        method: 'POST',
        body: JSON.stringify({
          participant_id: participantId,
          scan_context_id: scanContextId,
          scanned_at: new Date().toISOString(),
        }),
      }
    );
    return response;
  }

  async createNfcScan(eventId: string, badgeToken: string, scanContextId?: string): Promise<{ scan: Scan; participant: Participant; first_scan_in_context: boolean }> {
    const response = await this.request<{ scan: Scan; participant: Participant; first_scan_in_context: boolean }>(
      `/api/v1/events/${eventId}/scans`,
      {
        method: 'POST',
        body: JSON.stringify({
          badge_token: badgeToken,
          scan_context_id: scanContextId,
          scanned_at: new Date().toISOString(),
        }),
      }
    );
    return response;
  }

  async undoCheckIn(eventId: string, participantEventId: string, scanContextId?: string): Promise<void> {
    const url = scanContextId 
      ? `/api/v1/events/${eventId}/scans/${participantEventId}?scan_context_id=${scanContextId}`
      : `/api/v1/events/${eventId}/scans/${participantEventId}`;
    await this.request(url, {
      method: 'DELETE',
    });
  }

  async syncScans(eventId: string, scans: Array<{ participantId: string; scannedAt: string }>): Promise<void> {
    await this.request(`/api/v1/events/${eventId}/scans/bulk`, {
      method: 'POST',
      body: JSON.stringify({
        scans: scans.map(s => ({
          participant_id: s.participantId,
          scanned_at: s.scannedAt,
        })),
      }),
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
