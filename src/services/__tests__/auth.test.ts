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
    clear: jest.fn().mockResolvedValue(undefined),
  },
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

  it('talks to the server before the token is wiped', async () => {
    const order: string[] = [];
    jest.mocked(api.deleteSession).mockImplementation(async () => { order.push('delete'); });
    jest.mocked(secureStorage.clear).mockImplementation(async () => { order.push('clear'); });

    await authService.logout();

    expect(order).toEqual(['delete', 'clear']);
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

  it("doesn't wipe a new sign-in that landed while it waited", async () => {
    jest.mocked(secureStorage.getToken)
      .mockResolvedValueOnce('token-1')
      .mockResolvedValueOnce('token-2');

    await authService.logout();

    expect(secureStorage.clear).not.toHaveBeenCalled();
  });
});
