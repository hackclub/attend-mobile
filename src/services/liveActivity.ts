import {
  isLiveActivityAvailable,
  startLiveActivity,
  updateLiveActivity,
  stopLiveActivity,
  isLiveActivityRunning,
  stopTicketActivity,
  isTicketActivityRunning,
} from '../../modules/activity-controller/src';

interface LiveActivityState {
  eventId: string | null;
  eventName: string | null;
  checkedInCount: number;
  totalCount: number;
  isRunning: boolean;
}

const EMPTY_STATE: LiveActivityState = {
  eventId: null,
  eventName: null,
  checkedInCount: 0,
  totalCount: 0,
  isRunning: false,
};

/**
 * The organiser's check-in Live Activity (iOS) / Live Update (Android).
 *
 * The activity outlives the JS runtime: it survives an app restart, and the
 * system or the user can end it. So whether one is showing is always asked
 * of the native side, never taken from this object's memory.
 */
class LiveActivityService {
  private state: LiveActivityState = { ...EMPTY_STATE };

  isSupported(): boolean {
    return isLiveActivityAvailable();
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

  /**
   * Updates the counts of the activity for `eventId`. The native side ignores
   * an update for any other event, so a stale count can't land on a newer
   * event's activity.
   */
  async update(eventId: string, checkedInCount: number, totalCount: number): Promise<boolean> {
    if (!this.isRunning()) {
      this.state = { ...EMPTY_STATE };
      return false;
    }

    try {
      const success = await updateLiveActivity(eventId, checkedInCount, totalCount);
      if (success) {
        this.state = { ...this.state, eventId, checkedInCount, totalCount, isRunning: true };
      }
      return success;
    } catch (error) {
      console.error('Failed to update Live Activity:', error);
      return false;
    }
  }

  // Always asks the native side to stop: an activity started by an earlier
  // launch is not in this object's memory.
  async stop(): Promise<boolean> {
    try {
      const success = await stopLiveActivity();
      if (success || !this.isRunning()) {
        this.state = { ...EMPTY_STATE };
      }
      return success;
    } catch (error) {
      console.error('Failed to stop Live Activity:', error);
      return false;
    }
  }

  /**
   * Ends the check-in activity and the attendee ticket activity. Runs on
   * sign-out and whenever the current event changes.
   */
  async stopAll(): Promise<void> {
    const results = await Promise.allSettled([
      this.isRunning() ? this.stop() : Promise.resolve(true),
      isTicketActivityRunning() ? stopTicketActivity() : Promise.resolve(true),
    ]);
    results.forEach(result => {
      if (result.status === 'rejected') {
        console.warn('[LiveActivity] Stop failed:', result.reason);
      }
    });
    this.state = { ...EMPTY_STATE };
  }

  isRunning(): boolean {
    try {
      return isLiveActivityRunning();
    } catch {
      return false;
    }
  }

  getState(): LiveActivityState {
    return { ...this.state };
  }

  /** Re-reads from the native side whether an activity is showing. */
  syncState(): void {
    const running = this.isRunning();
    this.state = running ? { ...this.state, isRunning: true } : { ...EMPTY_STATE };
  }
}

export const liveActivityService = new LiveActivityService();
