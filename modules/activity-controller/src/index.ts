import { Platform } from 'react-native';

interface ActivityControllerModule {
  areLiveActivitiesEnabled(): boolean;
  startLiveActivity(eventId: string, eventName: string, checkedInCount: number, totalCount: number): Promise<boolean>;
  updateLiveActivity(checkedInCount: number, totalCount: number): Promise<boolean>;
  stopLiveActivity(): Promise<boolean>;
  isLiveActivityRunning(): boolean;
  startTicketActivity(eventName: string, venue: string, shortCode: string, startsAtIso: string, checkedIn: boolean): Promise<boolean>;
  stopTicketActivity(): Promise<boolean>;
  isTicketActivityRunning(): boolean;
}

const ActivityController: ActivityControllerModule | null = (() => {
  if (Platform.OS !== 'ios') {
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

export async function startLiveActivity(
  eventId: string,
  eventName: string,
  checkedInCount: number,
  totalCount: number
): Promise<boolean> {
  if (!ActivityController) return false;
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
