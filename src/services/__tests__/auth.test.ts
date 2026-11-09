jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'attend://oauth/callback'),
  AuthRequest: jest.fn(),
  ResponseType: { Code: 'code' },
}));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('../storage', () => ({
  KeychainLockedError: class extends Error {},
  secureStorage: {
    getToken: jest.fn(),
    getUser: jest.fn(),
    setUser: jest.fn().mockResolvedValue(undefined),
    upgradeKeychainAccessibility: jest.fn().mockResolvedValue(undefined),
    clearPersisted: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../sync', () => ({
  syncService: { clear: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../headshotCache', () => ({
  clearHeadshotCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../liveActivity', () => ({
  liveActivityService: { stopAll: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../api', () => ({
  api: {
    deleteSession: jest.fn(),
    validateToken: jest.fn(),
  },
}));
jest.mock('../notifications', () => ({
  notificationService: { unregisterToken: jest.fn() },
}));
jest.mock('../biometric', () => ({
  biometricService: { clearSession: jest.fn() },
}));

import { authService, LOGOUT_NETWORK_TIMEOUT_MS } from '../auth';
import { secureStorage } from '../storage';
import { api } from '../api';
import { notificationService } from '../notifications';
import { biometricService } from '../biometric';
import { syncService } from '../sync';
import { clearHeadshotCache } from '../headshotCache';
import { liveActivityService } from '../liveActivity';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  jest.mocked(secureStorage.getToken).mockResolvedValue('token-1');
  jest.mocked(api.deleteSession).mockResolvedValue(undefined);
  jest.mocked(notificationService.unregisterToken).mockResolvedValue(undefined);
});

describe('authService.logout', () => {
  it('revokes the session and push token, ends the unlock and clears storage', async () => {
    await authService.logout();

    expect(api.deleteSession).toHaveBeenCalledWith(LOGOUT_NETWORK_TIMEOUT_MS);
    expect(notificationService.unregisterToken).toHaveBeenCalledWith(LOGOUT_NETWORK_TIMEOUT_MS);
    expect(biometricService.clearSession).toHaveBeenCalled();
    expect(secureStorage.clear).toHaveBeenCalled();
  });

  it('deletes the stored token before talking to the server, then forgets it', async () => {
    const order: string[] = [];
    jest.mocked(secureStorage.clearPersisted).mockImplementation(async () => { order.push('clearPersisted'); });
    jest.mocked(api.deleteSession).mockImplementation(async () => { order.push('delete'); });
    jest.mocked(secureStorage.clear).mockImplementation(async () => { order.push('clear'); });

    await authService.logout();

    expect(order).toEqual(['clearPersisted', 'delete', 'clear']);
  });

  it('runs the full local cleanup', async () => {
    await authService.logout();

    expect(syncService.clear).toHaveBeenCalledWith({ keepQueuedScans: false });
    expect(clearHeadshotCache).toHaveBeenCalled();
    expect(liveActivityService.stopAll).toHaveBeenCalled();
    expect(biometricService.clearSession).toHaveBeenCalled();
  });

  it('still clears local data when deleting the stored token fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(secureStorage.clearPersisted).mockRejectedValueOnce(new Error('keychain'));

    await authService.logout();

    expect(syncService.clear).toHaveBeenCalled();
    expect(secureStorage.clear).toHaveBeenCalled();
  });

  it('still signs out when the server calls fail', async () => {
    jest.mocked(api.deleteSession).mockRejectedValue(new Error('offline'));
    jest.mocked(notificationService.unregisterToken).mockRejectedValue(new Error('offline'));

    await expect(authService.logout()).resolves.toBeUndefined();
    expect(secureStorage.clear).toHaveBeenCalled();
  });

  it('gives up on a hanging server after the timeout', async () => {
    jest.useFakeTimers();
    jest.mocked(api.deleteSession).mockReturnValue(new Promise(() => {}));
    jest.mocked(notificationService.unregisterToken).mockReturnValue(new Promise(() => {}));

    const done = authService.logout();
    await jest.advanceTimersByTimeAsync(LOGOUT_NETWORK_TIMEOUT_MS);
    await done;

    expect(secureStorage.clear).toHaveBeenCalled();
  });

  it('skips the server when there is no token to revoke', async () => {
    jest.mocked(secureStorage.getToken).mockResolvedValue(null);

    await authService.logout();

    expect(api.deleteSession).not.toHaveBeenCalled();
    expect(notificationService.unregisterToken).not.toHaveBeenCalled();
    expect(secureStorage.clear).toHaveBeenCalled();
  });

  it('skips the server when told the token is already dead', async () => {
    await authService.logout({ revoke: false });

    expect(api.deleteSession).not.toHaveBeenCalled();
    expect(biometricService.clearSession).toHaveBeenCalled();
    expect(secureStorage.clear).toHaveBeenCalled();
  });

  it('gives an expired session the same full cleanup, keeping its queued scans', async () => {
    jest.mocked(secureStorage.getUser).mockResolvedValue({ id: 'u1' } as never);
    jest.mocked(api.validateToken).mockResolvedValue(null);

    const result = await authService.restoreSession();

    expect(result).toMatchObject({ success: false, error: 'Session expired' });
    expect(api.deleteSession).not.toHaveBeenCalled();
    expect(secureStorage.clearPersisted).toHaveBeenCalled();
    expect(secureStorage.clear).toHaveBeenCalled();
    expect(syncService.clear).toHaveBeenCalledWith({ keepQueuedScans: true });
    expect(clearHeadshotCache).toHaveBeenCalled();
    expect(liveActivityService.stopAll).toHaveBeenCalled();
    expect(biometricService.clearSession).toHaveBeenCalled();
  });

  it("doesn't wipe a new sign-in that landed while it waited", async () => {
    jest.mocked(secureStorage.getToken)
      .mockResolvedValueOnce('token-1')
      .mockResolvedValueOnce('token-2');

    await authService.logout();

    expect(secureStorage.clear).not.toHaveBeenCalled();
  });
});

describe('authService.restoreSession', () => {
  it('replaces the stored user with the one /me returns', async () => {
    const stale = { id: 'u1', name: 'Old', is_participant: false };
    const fresh = { id: 'u1', name: 'New', is_participant: true };
    jest.mocked(secureStorage.getUser).mockResolvedValue(stale as never);
    jest.mocked(api.validateToken).mockResolvedValue(fresh as never);

    const result = await authService.restoreSession();

    expect(result).toEqual({ success: true, user: fresh });
    expect(secureStorage.setUser).toHaveBeenCalledWith(fresh);
  });

  it('keeps the cached user when /me is unreachable', async () => {
    const cached = { id: 'u1', name: 'Cached' };
    jest.mocked(secureStorage.getUser).mockResolvedValue(cached as never);
    jest.mocked(api.validateToken).mockRejectedValue(new Error('offline'));

    const result = await authService.restoreSession();

    expect(result).toEqual({ success: true, user: cached });
    expect(secureStorage.setUser).not.toHaveBeenCalled();
  });
});
