import NetInfo from '@react-native-community/netinfo';
import { toast } from './toast';

export const OFFLINE_REFRESH_MESSAGE = "You're offline, so this can't refresh right now.";

/**
 * After a pull to refresh: if the phone has no connection, a toast says so,
 * since the screen otherwise just keeps what it had. True when it showed.
 * Like the rest of the app, only "no network at all" counts: a network the OS
 * hasn't validated (isInternetReachable false) can still reach Attend.
 */
export async function toastIfOffline(options: { bottomOffset?: number } = {}): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    const offline = state.isConnected === false;
    if (offline) toast.show(OFFLINE_REFRESH_MESSAGE, options);
    return offline;
  } catch {
    return false;
  }
}
