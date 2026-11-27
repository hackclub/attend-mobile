const mockPlatform = { OS: 'ios' };

jest.mock('react-native', () => ({ Platform: mockPlatform }));
jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  hasHardwareAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
}));

import * as LocalAuthentication from 'expo-local-authentication';
import { getBiometricLabel } from '../biometricLabel';

const hasHardware = jest.mocked(LocalAuthentication.hasHardwareAsync);
const types = jest.mocked(LocalAuthentication.supportedAuthenticationTypesAsync);

beforeEach(() => {
  mockPlatform.OS = 'ios';
  hasHardware.mockResolvedValue(true);
  types.mockResolvedValue([]);
});

describe('getBiometricLabel', () => {
  it('names the iOS sensor', async () => {
    types.mockResolvedValue([2]);
    await expect(getBiometricLabel()).resolves.toBe('Face ID');
    types.mockResolvedValue([1]);
    await expect(getBiometricLabel()).resolves.toBe('Touch ID');
    types.mockResolvedValue([3]);
    await expect(getBiometricLabel()).resolves.toBe('Optic ID');
  });

  it('says "biometrics" on Android', async () => {
    mockPlatform.OS = 'android';
    types.mockResolvedValue([1, 2]);
    await expect(getBiometricLabel()).resolves.toBe('biometrics');
  });

  it('falls back to the device lock without biometric hardware', async () => {
    hasHardware.mockResolvedValue(false);
    await expect(getBiometricLabel()).resolves.toBe('device passcode');
    mockPlatform.OS = 'android';
    await expect(getBiometricLabel()).resolves.toBe('screen lock');
  });

  it('falls back when the lookup fails', async () => {
    hasHardware.mockRejectedValue(new Error('unavailable'));
    await expect(getBiometricLabel()).resolves.toBe('device passcode');
  });
});
