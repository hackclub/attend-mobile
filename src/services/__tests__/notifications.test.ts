jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-secure-store', () => ({}));
jest.mock('../api', () => ({
  api: { registerPushToken: jest.fn(), unregisterPushToken: jest.fn() },
  ApiError: class extends Error {},
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { api } from '../api';
import { notificationService, PUSH_ENABLED_KEY } from '../notifications';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: 'ExpoToken[1]', type: 'expo' });
});

describe('push notification preference', () => {
  it('is on by default and registers the token', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
    await expect(notificationService.isPushEnabled()).resolves.toBe(true);
    await expect(notificationService.registerTokenWithServer()).resolves.toBe(true);
    expect(api.registerPushToken).toHaveBeenCalledWith('ExpoToken[1]');
  });

  it('turning it off unregisters the token and stops later registration', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
    await notificationService.setPushEnabled(false);
    expect(api.unregisterPushToken).toHaveBeenCalledWith('ExpoToken[1]', undefined);
    await expect(notificationService.registerTokenWithServer()).resolves.toBe(false);
    expect(api.registerPushToken).not.toHaveBeenCalled();
  });

  it('stays off when permission is refused', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied' } as never);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: 'denied' } as never);
    await expect(notificationService.setPushEnabled(true)).resolves.toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(PUSH_ENABLED_KEY)) ?? 'null')).toBe(false);
  });
});
