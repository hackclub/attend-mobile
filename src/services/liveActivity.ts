import { Platform } from 'react-native';
import {
  areLiveActivitiesEnabled,
  startLiveActivity,
  updateLiveActivity,
  stopLiveActivity,
  isLiveActivityRunning,
} from '../../modules/activity-controller/src';

interface LiveActivityState {
  eventId: string | null;
  eventName: string | null;
  checkedInCount: number;
  totalCount: number;
  isRunning: boolean;
}

class LiveActivityService {
  private state: LiveActivityState = {
    eventId: null,
    eventName: null,
    checkedInCount: 0,
    totalCount: 0,
    isRunning: false,
  };

  isSupported(): boolean {
    return Platform.OS === 'ios' && areLiveActivitiesEnabled();
  }

  async start(eventId: string, eventName: string, checkedInCount: number, totalCount: number): Promise<boolean> {
    if (!this.isSupported()) {
      return false;
    }

    try {
      const success = await startLiveActivity(eventId, eventName, checkedInCount, totalCount);
      if (success) {
        this.state = {
          eventId,
          eventName,
          checkedInCount,
          totalCount,
          isRunning: true,
        };
      }
      return success;
    } catch (error) {
      console.error('Failed to start Live Activity:', error);
      return false;
    }
  }

  async update(checkedInCount: number, totalCount: number): Promise<boolean> {
    if (!this.state.isRunning) {
      return false;
    }

    try {
      const success = await updateLiveActivity(checkedInCount, totalCount);
      if (success) {
        this.state.checkedInCount = checkedInCount;
        this.state.totalCount = totalCount;
      }
      return success;
    } catch (error) {
      console.error('Failed to update Live Activity:', error);
      return false;
    }
  }

  async stop(): Promise<boolean> {
    if (!this.state.isRunning) {
      return true;
    }

    try {
      const success = await stopLiveActivity();
      if (success) {
        this.state = {
          eventId: null,
          eventName: null,
          checkedInCount: 0,
          totalCount: 0,
          isRunning: false,
        };
      }
      return success;
    } catch (error) {
      console.error('Failed to stop Live Activity:', error);
      return false;
    }
  }

  isRunning(): boolean {
    return isLiveActivityRunning();
  }

  getState(): LiveActivityState {
    return { ...this.state };
  }

  async syncState(): Promise<void> {
    this.state.isRunning = this.isRunning();
  }
}

export const liveActivityService = new LiveActivityService();
