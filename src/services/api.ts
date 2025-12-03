import { secureStorage } from './storage';
import type { Event, Participant, Scan, User, ApiResponse } from '../types';

// Use local Rails server for development
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://10.19.99.207:3000' : 'https://attend.hackclub.com');

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
        message = errorBody || message;
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

  async createScan(eventId: string, participantId: string): Promise<Scan> {
    const response = await this.request<{ scan: Scan; participant: Participant }>(
      `/api/v1/events/${eventId}/scans`,
      {
        method: 'POST',
        body: JSON.stringify({
          participant_id: participantId,
          scanned_at: new Date().toISOString(),
        }),
      }
    );
    return response.scan;
  }

  async undoCheckIn(eventId: string, participantEventId: string): Promise<void> {
    await this.request(`/api/v1/events/${eventId}/scans/${participantEventId}`, {
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
    } catch {
      return false;
    }
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
