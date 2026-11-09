import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { secureStorage, KeychainLockedError } from './storage';
import { api } from './api';
import type { User } from '../types';

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
        const isValid = await api.validateToken();
        if (!isValid) {
          // Token is explicitly invalid (401), logout
          await this.logout();
          return { success: false, error: 'Session expired' };
        }
        
        // If we have a valid token but no cached user, fetch fresh user
        if (!user) {
          const freshUser = await api.getCurrentUser();
          await secureStorage.setUser(freshUser);
          return { success: true, user: freshUser };
        }
      } catch {
        // Network error - if we have cached user, continue offline
        if (user) {
          return { success: true, user };
        }
        // No cached user and can't validate - fail but don't clear token
        return { success: false, error: 'Unable to verify session' };
      }

      return { success: true, user };
    } catch (error) {
      if (error instanceof KeychainLockedError) {
        return { success: false, locked: true };
      }
      // Only logout on explicit auth failures, not storage errors
      console.error('Session restore error:', error);
      return { success: false, error: 'Failed to restore session' };
    }
  },

  async logout(): Promise<void> {
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
