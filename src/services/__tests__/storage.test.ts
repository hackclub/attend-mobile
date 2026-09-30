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


function keychainError(message: string) {
  return Object.assign(new Error(`Calling the 'getValueWithKeyAsync' function has failed\n→ Caused by: ${message}`), {
    code: 'ERR_KEY_CHAIN',
  });
}

let SecureStore: typeof import('expo-secure-store');
let secureStorage: typeof import('../storage').secureStorage;
let KeychainLockedError: typeof import('../storage').KeychainLockedError;

beforeEach(() => {
  jest.resetModules();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  SecureStore = require('expo-secure-store');
  ({ secureStorage, KeychainLockedError } = require('../storage'));
});

describe('secureStorage.getToken', () => {
  it('throws KeychainLockedError instead of reporting signed out while locked', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(keychainError('User interaction is not allowed.'));
    await expect(secureStorage.getToken()).rejects.toBeInstanceOf(KeychainLockedError);
  });

  it('does not cache the failure, so a later read succeeds', async () => {
    jest.mocked(SecureStore.getItemAsync)
      .mockRejectedValueOnce(keychainError('User interaction is not allowed.'))
      .mockResolvedValueOnce('tok');
    await expect(secureStorage.getToken()).rejects.toThrow();
    await expect(secureStorage.getToken()).resolves.toBe('tok');
  });

  it('still returns null for other keychain errors', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(keychainError('Unable to decode the provided data.'));
    await expect(secureStorage.getToken()).resolves.toBeNull();
  });
});

describe('secureStorage.setToken', () => {
  it('stores with AFTER_FIRST_UNLOCK so background launches can read it', async () => {
    await secureStorage.setToken('tok');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('auth_token', 'tok', {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  });
});
