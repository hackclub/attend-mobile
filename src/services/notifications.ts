import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api, ApiError } from './api';
import { asyncStorage } from './storage';
import { hackClubColors } from '../theme/tokens';

// The Account sheet's Notifications switch. On by default; off unregisters
// this device's push token and keeps it from registering again.
export const PUSH_ENABLED_KEY = 'attend.pushNotificationsEnabled';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const EXPO_PROJECT_ID = '1eae2e71-70e1-49b2-8b6a-6aeda7e22b93';

// The token this install last registered, so sign-out can remove it without
// asking Expo for it again.
let registeredToken: string | null = null;

export const notificationService = {
  async registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: hackClubColors.red,
      });
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });

    return token.data;
  },

  async isPushEnabled(): Promise<boolean> {
    const stored = await asyncStorage.get<boolean>(PUSH_ENABLED_KEY).catch(() => null);
    return stored !== false;
  },

  /**
   * Turns this device's notifications on or off. Turning on registers the
   * push token (and asks for permission); it resolves false, and stays off,
   * when permission is refused.
   */
  async setPushEnabled(enabled: boolean): Promise<boolean> {
    if (enabled) {
      await asyncStorage.set(PUSH_ENABLED_KEY, true);
      const registered = await this.registerTokenWithServer();
      if (!registered) await asyncStorage.set(PUSH_ENABLED_KEY, false);
      return registered;
    }
    await asyncStorage.set(PUSH_ENABLED_KEY, false);
    await this.unregisterToken().catch((error: unknown) => {
      console.warn('Failed to unregister push token:', error);
    });
    return true;
  },

  async registerTokenWithServer(): Promise<boolean> {
    if (!(await this.isPushEnabled())) return false;
    try {
      const token = await this.registerForPushNotifications();
      if (!token) return false;

      registeredToken = token;
      await api.registerPushToken(token);
      return true;
    } catch (error) {
      // 422 "Token has already been taken" means it's already registered - treat as success
      if (error instanceof ApiError && error.status === 422) {
        return true;
      }
      console.error('Failed to register push token:', error);
      return false;
    }
  },

  // Removes this device's push token from the signed-in account, so a
  // signed-out phone stops getting that user's messages. Throws on failure;
  // the caller decides whether that matters.
  async unregisterToken(timeoutMs?: number): Promise<void> {
    let token = registeredToken;
    if (!token) {
      // Never registered this launch. Only look the token up if we could
      // have registered it, so sign-out never triggers a permission prompt.
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted' || !Device.isDevice) return;
      token = (await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID })).data;
    }
    await api.unregisterPushToken(token, timeoutMs);
    registeredToken = null;
  },

  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ) {
    return Notifications.addNotificationReceivedListener(callback);
  },

  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  },

  // The notification tap that opened the app, if any. The listener above can
  // miss it on a cold start, before the app has mounted or signed in.
  getLastNotificationResponse(): Notifications.NotificationResponse | null {
    return Notifications.getLastNotificationResponse();
  },

  clearLastNotificationResponse() {
    Notifications.clearLastNotificationResponse();
  },
};
