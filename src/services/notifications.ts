import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api, ApiError } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
      projectId: '1eae2e71-70e1-49b2-8b6a-6aeda7e22b93',
    });

    return token.data;
  },

  async registerTokenWithServer(): Promise<boolean> {
    try {
      const token = await this.registerForPushNotifications();
      if (!token) return false;

      await api.registerPushToken(token);
      console.log('Push token registered with server');
      return true;
    } catch (error) {
      // 422 "Token has already been taken" means it's already registered - treat as success
      if (error instanceof ApiError && error.status === 422) {
        console.log('Push token already registered');
        return true;
      }
      console.error('Failed to register push token:', error);
      return false;
    }
  },

  async unregisterToken(): Promise<void> {
    try {
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: '1eae2e71-70e1-49b2-8b6a-6aeda7e22b93',
      });
      await api.unregisterPushToken(token.data);
    } catch (error) {
      console.error('Failed to unregister push token:', error);
    }
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
