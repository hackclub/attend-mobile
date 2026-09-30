import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';
const KEYCHAIN_UPGRADED_KEY = 'keychain_after_first_unlock';
let cachedToken: string | null | undefined;

// iOS can launch the app in the background (prewarming, pushes, Live Activity
// updates) while the phone is locked. The SecureStore default, WHEN_UNLOCKED,
// makes the keychain unreadable then, so store with AFTER_FIRST_UNLOCK.
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// Thrown when the keychain exists but can't be read yet — before the first
// unlock after boot, or while locked for items still on WHEN_UNLOCKED. Callers
// must not treat this as "signed out".
export class KeychainLockedError extends Error {
  constructor(cause: unknown) {
    super('Keychain is locked', { cause });
    this.name = 'KeychainLockedError';
  }
}

function isKeychainLocked(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  return code === 'ERR_KEY_CHAIN' && error.message.includes('User interaction is not allowed');
}

export const secureStorage = {
  async setToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token, KEYCHAIN_OPTIONS);
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
      if (isKeychainLocked(error)) {
        console.warn('SecureStore getToken: keychain locked, deferring');
        throw new KeychainLockedError(error);
      }
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
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user), KEYCHAIN_OPTIONS);
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
      if (isKeychainLocked(error)) throw new KeychainLockedError(error);
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

  // Items written before KEYCHAIN_OPTIONS keep WHEN_UNLOCKED: SecureStore's
  // update path only replaces the value, so delete and re-add them once.
  async upgradeKeychainAccessibility(): Promise<void> {
    try {
      if (await AsyncStorage.getItem(KEYCHAIN_UPGRADED_KEY)) return;
      for (const key of [TOKEN_KEY, USER_KEY]) {
        const value = await SecureStore.getItemAsync(key);
        if (value === null) continue;
        await SecureStore.deleteItemAsync(key);
        await SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS);
      }
      await AsyncStorage.setItem(KEYCHAIN_UPGRADED_KEY, '1');
    } catch (error) {
      console.warn('SecureStore accessibility upgrade failed:', error);
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
