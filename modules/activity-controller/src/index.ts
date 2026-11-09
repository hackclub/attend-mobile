import { PermissionsAndroid, Platform } from 'react-native';

// iOS: ActivityKit Live Activities. Android: an ongoing notification, promoted
// to a Live Update on Android 16+ (see android/…/ActivityControllerModule.kt).
interface ActivityControllerModule {
  areLiveActivitiesEnabled(): boolean;
  startLiveActivity(eventId: string, eventName: string, checkedInCount: number, totalCount: number): Promise<boolean>;
  updateLiveActivity(checkedInCount: number, totalCount: number): Promise<boolean>;
  stopLiveActivity(): Promise<boolean>;
  isLiveActivityRunning(): boolean;
  startTicketActivity(eventName: string, venue: string, shortCode: string, startsAtIso: string, checkedIn: boolean): Promise<boolean>;
  stopTicketActivity(): Promise<boolean>;
  isTicketActivityRunning(): boolean;
  // Android only.
  canPostLiveUpdates?(): boolean;
  openLiveUpdateSettings?(): boolean;
}

const ActivityController: ActivityControllerModule | null = (() => {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return null;
  }

  try {
    const { requireNativeModule } = require('expo-modules-core');
    return requireNativeModule('ActivityController');
  } catch {
    return null;
  }
})();

export function areLiveActivitiesEnabled(): boolean {
  return ActivityController?.areLiveActivitiesEnabled() ?? false;
}

/**
 * Android 13+: notifications need the POST_NOTIFICATIONS runtime permission.
 * Asked when the user turns a live update on, not at launch. Resolves true
 * when notifications may be posted (always true on iOS / older Android).
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  try {
    if (await PermissionsAndroid.check(permission)) return true;
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Android 16+: whether the system will promote the notification to a Live
 * Update (the user can turn that off per app). False when notifications are
 * blocked. iOS: same as areLiveActivitiesEnabled.
 */
export function canPostLiveUpdates(): boolean {
  if (!ActivityController) return false;
  if (Platform.OS === 'android') return ActivityController.canPostLiveUpdates?.() ?? false;
  return ActivityController.areLiveActivitiesEnabled();
}

/** Android: opens the Live Updates (16+) or notification settings for Attend. */
export function openLiveUpdateSettings(): boolean {
  return ActivityController?.openLiveUpdateSettings?.() ?? false;
}

export async function startLiveActivity(
  eventId: string,
  eventName: string,
  checkedInCount: number,
  totalCount: number
): Promise<boolean> {
  if (!ActivityController) return false;
  if (!(await ensureNotificationPermission())) return false;
  try {
    return await ActivityController.startLiveActivity(eventId, eventName, checkedInCount, totalCount);
  } catch (error) {
    console.error('Failed to start Live Activity:', error);
    return false;
  }
}

export async function updateLiveActivity(
  checkedInCount: number,
  totalCount: number
): Promise<boolean> {
  if (!ActivityController) return false;
  try {
    return await ActivityController.updateLiveActivity(checkedInCount, totalCount);
  } catch (error) {
    console.error('Failed to update Live Activity:', error);
    return false;
  }
}

export async function stopLiveActivity(): Promise<boolean> {
  if (!ActivityController) return false;
  try {
    return await ActivityController.stopLiveActivity();
  } catch (error) {
    console.error('Failed to stop Live Activity:', error);
    return false;
  }
}

export function isLiveActivityRunning(): boolean {
  return ActivityController?.isLiveActivityRunning() ?? false;
}

// Participant ticket Live Activity (Lock Screen countdown + check-in status).
export async function startTicketActivity(
  eventName: string,
  venue: string,
  shortCode: string,
  startsAtIso: string,
  checkedIn: boolean
): Promise<boolean> {
  if (!ActivityController) return false;
  if (!(await ensureNotificationPermission())) return false;
  try {
    return await ActivityController.startTicketActivity(eventName, venue, shortCode, startsAtIso, checkedIn);
  } catch (error) {
    console.error('Failed to start ticket Live Activity:', error);
    return false;
  }
}

export async function stopTicketActivity(): Promise<boolean> {
  if (!ActivityController) return false;
  try {
    return await ActivityController.stopTicketActivity();
  } catch (error) {
    console.error('Failed to stop ticket Live Activity:', error);
    return false;
  }
}

export function isTicketActivityRunning(): boolean {
  return ActivityController?.isTicketActivityRunning() ?? false;
}

export function areLiveActivitiesSupported(): boolean {
  return ActivityController?.areLiveActivitiesEnabled() ?? false;
}

/**
 * Whether to offer the live activity toggle at all. Android: whenever the
 * native module is present (the notification permission is asked on start).
 * iOS: when Live Activities are enabled.
 */
export function isLiveActivityAvailable(): boolean {
  if (!ActivityController) return false;
  return Platform.OS === 'android' || ActivityController.areLiveActivitiesEnabled();
}
