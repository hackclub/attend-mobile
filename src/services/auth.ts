import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { secureStorage } from './storage';
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
      
      console.log('=== OAuth Debug ===');
      console.log('Client ID:', OAUTH_CONFIG.clientId);
      console.log('Redirect URI:', redirectUri);
      console.log('Auth Endpoint:', OAUTH_CONFIG.authorizationEndpoint);
      
      const authUrl = await request.makeAuthUrlAsync({
        authorizationEndpoint: OAUTH_CONFIG.authorizationEndpoint,
      });
      console.log('Full Auth URL:', authUrl);
      console.log('===================');
      
      const result = await request.promptAsync({
        authorizationEndpoint: OAUTH_CONFIG.authorizationEndpoint,
      });

      console.log('=== OAuth Result ===');
      console.log('Result type:', result.type);
      if ('params' in result) {
        console.log('Result params:', JSON.stringify(result.params, null, 2));
      }
      console.log('====================');

      if (result.type === 'success' && result.params.code) {
        console.log('Got auth code, exchanging for token...');
        try {
          // Pass code_verifier to backend for PKCE verification
          const codeVerifier = request.codeVerifier;
          const { token, user } = await api.exchangeCodeForToken(result.params.code, redirectUri, codeVerifier);
          console.log('Token exchange successful, user:', user?.email);
          
          await secureStorage.setToken(token);
          await secureStorage.setUser(user);
          
          return { success: true, user };
        } catch (exchangeError) {
          console.error('Token exchange failed:', exchangeError);
          throw exchangeError;
        }
      }

      if (result.type === 'cancel') {
        console.log('Auth cancelled by user');
        return { success: false, error: 'Authentication cancelled' };
      }

      if (result.type === 'error') {
        console.error('Auth error:', result.params?.error, result.params?.error_description);
        return { 
          success: false, 
          error: result.params?.error_description || 'Authentication failed' 
        };
      }

      console.error('Unknown auth result:', result);
      return { success: false, error: 'Unknown authentication error' };
    } catch (error) {
      console.error('Auth exception:', error);
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
      } catch (error) {
        // Network error - if we have cached user, continue offline
        if (user) {
          console.log('Network error during token validation, using cached session');
          return { success: true, user };
        }
        // No cached user and can't validate - fail but don't clear token
        return { success: false, error: 'Unable to verify session' };
      }

      return { success: true, user };
    } catch (error) {
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
