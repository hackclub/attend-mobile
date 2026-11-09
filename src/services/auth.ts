import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { secureStorage, KeychainLockedError } from './storage';
import { api } from './api';
import { biometricService } from './biometric';
import { notificationService } from './notifications';
import { syncService } from './sync';
import { clearHeadshotCache } from './headshotCache';
import { liveActivityService } from './liveActivity';
import type { User } from '../types';

// Sign-out waits at most this long for the server before clearing locally.
export const LOGOUT_NETWORK_TIMEOUT_MS = 3_000;

// Settles with the promise, or rejects once `ms` has passed. The promise
// itself keeps running; its result is just no longer waited for.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Everything a sign-out removes from the device apart from the credentials:
 * the biometric unlock, cached rosters, scans, events and the current event,
 * queued scans (unless `keepQueuedScans`), headshots, and the Live
 * Activities / Live Updates. Every sign-out path runs it via
 * authService.logout. Never throws.
 */
export async function clearLocalSessionData(
  { keepQueuedScans = false }: { keepQueuedScans?: boolean } = {}
): Promise<void> {
  biometricService.clearSession();
  const results = await Promise.allSettled([
    syncService.clear({ keepQueuedScans }),
    clearHeadshotCache(),
    liveActivityService.stopAll(),
  ]);
  results.forEach(result => {
    if (result.status === 'rejected') {
      console.warn('[Logout] Cleanup failed:', result.reason);
    }
  });
}

export interface LogoutOptions {
  // Tell the server (revoke the token, drop the push token). Off when the
  // server already rejected the token.
  revoke?: boolean;
  // An expired session, not a choice to sign out: keep that user's queued
  // scans, to send if the same user signs back in. Another user signing in
  // discards them.
  keepQueuedScans?: boolean;
}

WebBrowser.maybeCompleteAuthSession();

const OAUTH_CONFIG = {
  clientId: process.env.EXPO_PUBLIC_OAUTH_CLIENT_ID!,
  // Client secret is kept server-side - token exchange goes through Rails backend
  authorizationEndpoint: 'https://auth.hackclub.com/oauth/authorize',
  scopes: ['email'],
};

const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'attend',
  path: 'oauth/callback',
});

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
  // Keychain unreadable (background launch while locked); retry once active.
  locked?: boolean;
}

export const authService = {
  getRedirectUri(): string {
    return redirectUri;
  },

  createAuthRequest(): AuthSession.AuthRequest {
    return new AuthSession.AuthRequest({
      clientId: OAUTH_CONFIG.clientId,
      scopes: OAUTH_CONFIG.scopes,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    });
  },

  async authenticate(): Promise<AuthResult> {
    try {
      const request = this.createAuthRequest();

      // Never log the auth URL, the result params (they carry the one-time
      // code) or anything about the user: logs reach device consoles and
      // Sentry breadcrumbs. Only the outcome type, and only in dev builds.
      const result = await request.promptAsync({
        authorizationEndpoint: OAUTH_CONFIG.authorizationEndpoint,
      });

      if (__DEV__) {
        console.log('[Auth] OAuth result:', result.type);
      }

      if (result.type === 'success' && result.params.code) {
        try {
          // Pass code_verifier to backend for PKCE verification
          const codeVerifier = request.codeVerifier;
          const { token, user } = await api.exchangeCodeForToken(result.params.code, redirectUri, codeVerifier);
          await secureStorage.setToken(token);
          await secureStorage.setUser(user);
          
          return { success: true, user };
        } catch (exchangeError) {
          if (__DEV__) {
            console.error('[Auth] Token exchange failed:', exchangeError);
          }
          throw exchangeError;
        }
      }

      if (result.type === 'cancel') {
        return { success: false, error: 'Authentication cancelled' };
      }

      if (result.type === 'error') {
        if (__DEV__) {
          console.error('[Auth] OAuth error:', result.params?.error);
        }
        return { 
          success: false, 
          error: result.params?.error_description || 'Authentication failed' 
        };
      }

      return { success: false, error: 'Unknown authentication error' };
    } catch (error) {
      if (__DEV__) {
        console.error('[Auth] Sign-in failed:', error);
      }
      const message = error instanceof Error ? error.message : 'Authentication failed';
      return { success: false, error: message };
    }
  },

  // Dev-only sign-in that bypasses OAuth by exchanging a known user_id or
  // email for a token. Only wired up behind __DEV__ in the UI.
  async devLogin(identifier: { userId: string } | { email: string }): Promise<AuthResult> {
    try {
      const { token, user } = await api.devSession(identifier);
      await secureStorage.setToken(token);
      await secureStorage.setUser(user);
      return { success: true, user };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dev login failed';
      return { success: false, error: message };
    }
  },

  async restoreSession(): Promise<AuthResult> {
    try {
      const token = await secureStorage.getToken();
      if (!token) {
        return { success: false };
      }

      const user = await secureStorage.getUser<User>();
      void secureStorage.upgradeKeychainAccessibility();
      
      // Try to validate token, but don't logout on network errors
      try {
        const freshUser = await api.validateToken();
        if (!freshUser) {
          // Token is explicitly invalid (401): nothing left to revoke. Same
          // local cleanup as any sign-out, but scans still waiting to sync
          // are kept for when this user signs back in.
          await this.logout({ revoke: false, keepQueuedScans: true });
          return { success: false, error: 'Session expired' };
        }
        
        // /me is the source of truth for the user (name, avatar, whether
        // they're a participant), so the stored copy follows it. Failing to
        // store it only means the next offline start uses the older copy.
        await secureStorage.setUser(freshUser).catch(() => {});
        return { success: true, user: freshUser };
      } catch {
        // Network error - if we have cached user, continue offline
        if (user) {
          return { success: true, user };
        }
        // No cached user and can't validate - fail but don't clear token
        return { success: false, error: 'Unable to verify session' };
      }
    } catch (error) {
      if (error instanceof KeychainLockedError) {
        return { success: false, locked: true };
      }
      // Only logout on explicit auth failures, not storage errors
      console.error('Session restore error:', error);
      return { success: false, error: 'Failed to restore session' };
    }
  },

  /**
   * Signs out of this device. Every sign-out path (the user's, an expired
   * session) comes through here.
   *
   * 1. Ends the biometric unlock.
   * 2. Reads the token into memory and deletes the stored token and user, so
   *    an app killed at any later point is still signed out.
   * 3. Clears local data (clearLocalSessionData).
   * 4. With `revoke` (the default), tells the server, best-effort, using the
   *    in-memory token: removes this device's push token and revokes the
   *    bearer token. Each call is capped at LOGOUT_NETWORK_TIMEOUT_MS and any
   *    failure is ignored: being offline must never keep someone signed in.
   * 5. Forgets the in-memory token.
   */
  async logout({ revoke = true, keepQueuedScans = false }: LogoutOptions = {}): Promise<void> {
    biometricService.clearSession();
    const signedOutToken = await secureStorage.getToken().catch(() => null);
    await secureStorage.clearPersisted().catch(error => {
      console.warn('[Logout] Failed to delete the stored session:', error);
    });
    await clearLocalSessionData({ keepQueuedScans });
    if (revoke && signedOutToken) {
      await Promise.allSettled([
        withTimeout(notificationService.unregisterToken(LOGOUT_NETWORK_TIMEOUT_MS), LOGOUT_NETWORK_TIMEOUT_MS),
        withTimeout(api.deleteSession(LOGOUT_NETWORK_TIMEOUT_MS), LOGOUT_NETWORK_TIMEOUT_MS),
      ]);
    }
    // Someone signed straight back in while we waited: their new token isn't
    // ours to wipe.
    const current = await secureStorage.getToken().catch(() => null);
    if (current && current !== signedOutToken) return;
    await secureStorage.clear();
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await secureStorage.getToken();
    return !!token;
  },

  async getToken(): Promise<string | null> {
    return secureStorage.getToken();
  },

  async getUser(): Promise<User | null> {
    return secureStorage.getUser<User>();
  },
};
