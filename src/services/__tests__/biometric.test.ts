jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([2]),
  authenticateAsync: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn(),
}));

let LocalAuthentication: typeof import('expo-local-authentication');
let biometricService: typeof import('../biometric').biometricService;

beforeEach(() => {
  jest.resetModules();
  LocalAuthentication = require('expo-local-authentication');
  ({ biometricService } = require('../biometric'));
});

describe('biometricService.confirmIdentity', () => {
  it('prompts even when a recent unlock is still valid', async () => {
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: true });

    await biometricService.confirmIdentity('Disable Face ID protection');
    expect(biometricService.isSessionValid()).toBe(true);

    await biometricService.confirmIdentity('Disable Face ID protection');
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(2);
  });

  it('reports failure when the prompt is cancelled', async () => {
    jest.mocked(LocalAuthentication.authenticateAsync)
      .mockResolvedValue({ success: false, error: 'user_cancel' });

    await expect(biometricService.confirmIdentity('Disable Face ID protection')).resolves.toBe(false);
    expect(biometricService.isSessionValid()).toBe(false);
  });

  it('reports failure when the prompt cannot be shown', async () => {
    jest.mocked(LocalAuthentication.authenticateAsync).mockRejectedValue(new Error('no hardware'));

    await expect(biometricService.confirmIdentity('Disable Face ID protection')).resolves.toBe(false);
  });
});

describe('biometricService.authenticate', () => {
  it('prompts on a fresh session, whatever an older build stored', async () => {
    // Builds that had the toggle stored `false` here to switch protection off.
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(false));
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: false, error: 'user_cancel' });

    await expect(biometricService.authenticate()).resolves.toBe(false);
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('reuses a valid session instead of prompting again', async () => {
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: true });

    await expect(biometricService.authenticate()).resolves.toBe(true);
    await expect(biometricService.authenticate()).resolves.toBe(true);
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('prompts again once the session is cleared', async () => {
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: true });

    await biometricService.authenticate();
    biometricService.clearSession();
    await biometricService.authenticate();
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(2);
  });
});
