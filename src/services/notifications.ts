import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api, ApiError } from './api';

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
        lightColor: '#EC3750',
      });
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });

    return token.data;
  },

  async registerTokenWithServer(): Promise<boolean> {
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
};
