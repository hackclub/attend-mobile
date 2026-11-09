jest.mock('../../../modules/activity-controller/src', () => ({
  isLiveActivityAvailable: jest.fn(() => true),
  startLiveActivity: jest.fn().mockResolvedValue(true),
  updateLiveActivity: jest.fn().mockResolvedValue(true),
  stopLiveActivity: jest.fn().mockResolvedValue(true),
  isLiveActivityRunning: jest.fn(() => false),
  stopTicketActivity: jest.fn().mockResolvedValue(true),
  isTicketActivityRunning: jest.fn(() => false),
}));

import * as native from '../../../modules/activity-controller/src';
import { liveActivityService } from '../liveActivity';

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(native.isLiveActivityRunning).mockReturnValue(false);
  jest.mocked(native.isTicketActivityRunning).mockReturnValue(false);
});

describe('liveActivityService', () => {
  it('stops an activity started by an earlier launch', async () => {
    // Nothing started in this JS runtime, but the native side has one.
    jest.mocked(native.isLiveActivityRunning).mockReturnValue(true);

    await liveActivityService.stop();

    expect(native.stopLiveActivity).toHaveBeenCalled();
  });

  it('updates a running activity it did not start, passing the event id', async () => {
    jest.mocked(native.isLiveActivityRunning).mockReturnValue(true);

    expect(await liveActivityService.update('evt-1', 3, 10)).toBe(true);

    expect(native.updateLiveActivity).toHaveBeenCalledWith('evt-1', 3, 10);
  });

  it('skips the update when nothing is showing', async () => {
    expect(await liveActivityService.update('evt-1', 3, 10)).toBe(false);
    expect(native.updateLiveActivity).not.toHaveBeenCalled();
  });

  it('stopAll ends both the check-in and the ticket activity', async () => {
    jest.mocked(native.isLiveActivityRunning).mockReturnValue(true);
    jest.mocked(native.isTicketActivityRunning).mockReturnValue(true);

    await liveActivityService.stopAll();

    expect(native.stopLiveActivity).toHaveBeenCalled();
    expect(native.stopTicketActivity).toHaveBeenCalled();
  });

  it('syncState reads the native state', () => {
    jest.mocked(native.isLiveActivityRunning).mockReturnValue(true);
    liveActivityService.syncState();
    expect(liveActivityService.getState().isRunning).toBe(true);

    jest.mocked(native.isLiveActivityRunning).mockReturnValue(false);
    liveActivityService.syncState();
    expect(liveActivityService.getState().isRunning).toBe(false);
  });
});
