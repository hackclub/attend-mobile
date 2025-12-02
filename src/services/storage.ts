import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';

export const secureStorage = {
  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },

  async getToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  },

  async removeToken(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },

  async setUser(user: object): Promise<void> {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },

  async getUser<T>(): Promise<T | null> {
    const data = await SecureStore.getItemAsync(USER_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },

  async removeUser(): Promise<void> {
    await SecureStore.deleteItemAsync(USER_KEY);
  },

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
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
  PENDING_SCANS: 'pending_scans',
  LAST_SYNC: 'last_sync',
  EVENTS: 'cached_events',
  CURRENT_EVENT: 'current_event',
} as const;
