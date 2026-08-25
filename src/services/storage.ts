import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';
let cachedToken: string | null | undefined;

export const secureStorage = {
  async setToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      cachedToken = token;
    } catch (error) {
      console.error('SecureStore setToken failed:', error);
      throw error;
    }
  },

  async getToken(): Promise<string | null> {
    if (cachedToken !== undefined) return cachedToken;
    try {
      cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      return cachedToken;
    } catch (error) {
      console.error('SecureStore getToken failed:', error);
      return null;
    }
  },

  async removeToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      cachedToken = null;
    } catch (error) {
      console.error('SecureStore removeToken failed:', error);
    }
  },

  async setUser(user: object): Promise<void> {
    try {
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    } catch (error) {
      console.error('SecureStore setUser failed:', error);
      throw error;
    }
  },

  async getUser<T>(): Promise<T | null> {
    try {
      const data = await SecureStore.getItemAsync(USER_KEY);
      if (!data) return null;
      try {
        return JSON.parse(data) as T;
      } catch {
        return null;
      }
    } catch (error) {
      console.error('SecureStore getUser failed:', error);
      return null;
    }
  },

  async removeUser(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(USER_KEY);
    } catch (error) {
      console.error('SecureStore removeUser failed:', error);
    }
  },

  async clear(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
      cachedToken = null;
    } catch (error) {
      console.error('SecureStore clear failed:', error);
    }
  },
};

export const asyncStorage = {
  async set(key: string, value: unknown): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async get<T>(key: string): Promise<T | null> {
    const data = await AsyncStorage.getItem(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },

  async getAllKeys(): Promise<readonly string[]> {
    return await AsyncStorage.getAllKeys();
  },

  async multiGet(keys: string[]): Promise<Map<string, unknown>> {
    const pairs = await AsyncStorage.multiGet(keys);
    const result = new Map<string, unknown>();
    for (const [key, value] of pairs) {
      if (value) {
        try {
          result.set(key, JSON.parse(value));
        } catch {
          result.set(key, value);
        }
      }
    }
    return result;
  },

  async clear(): Promise<void> {
    await AsyncStorage.clear();
  },
};

export const STORAGE_KEYS = {
  PARTICIPANTS: (eventId: string) => `participants_${eventId}`,
  SCANS: (eventId: string) => `scans_${eventId}`,
  // Raw ISO8601 string from the server (may include fractional seconds) —
  // stored and re-sent verbatim, never parsed into a Date.
  SCAN_SYNC_CURSOR: (eventId: string) => `scan_sync_cursor_${eventId}`,
  PARTICIPANT_SYNC_CURSOR: (eventId: string) => `participant_sync_cursor_${eventId}`,
  SCAN_CONTEXTS: (eventId: string) => `scan_contexts_${eventId}`,
  POWER_MODE_ENABLED: 'scanner_power_mode_enabled',
  PENDING_SCANS: 'pending_scans',
  LAST_SYNC: 'last_sync',
  EVENTS: 'cached_events',
  CURRENT_EVENT: 'current_event',
} as const;
