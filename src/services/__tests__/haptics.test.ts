const mockPlatform = { OS: 'ios' };

jest.mock('react-native', () => ({ Platform: mockPlatform }));

jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  AndroidHaptics: {
    Confirm: 'confirm',
    Reject: 'reject',
    Long_Press: 'long-press',
    Clock_Tick: 'clock-tick',
    Keyboard_Tap: 'keyboard-tap',
    Virtual_Key: 'virtual-key',
    Toggle_On: 'toggle-on',
    Toggle_Off: 'toggle-off',
    Segment_Tick: 'segment-tick',
  },
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  performAndroidHapticsAsync: jest.fn().mockResolvedValue(undefined),
}));

import * as Haptics from 'expo-haptics';

function load(os: 'ios' | 'android'): typeof import('../haptics') {
  mockPlatform.OS = os;
  let mod: typeof import('../haptics') | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../haptics');
  });
  return mod!;
}

beforeEach(() => jest.clearAllMocks());

describe('haptics', () => {
  it('uses the Taptic Engine patterns on iOS', () => {
    const { haptics } = load('ios');
    haptics.success();
    haptics.error();
    haptics.selection();
    haptics.impact('medium');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it('uses the system haptic constants on Android', () => {
    const { haptics } = load('android');
    haptics.success();
    haptics.error();
    haptics.warning();
    haptics.selection();
    haptics.impact();
    haptics.toggle(true);
    haptics.toggle(false);
    haptics.segment();
    expect(jest.mocked(Haptics.performAndroidHapticsAsync).mock.calls.map((c) => c[0])).toEqual([
      'confirm',
      'reject',
      'long-press',
      'clock-tick',
      'keyboard-tap',
      'toggle-on',
      'toggle-off',
      'segment-tick',
    ]);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('swallows native failures', async () => {
    const { haptics } = load('ios');
    jest.mocked(Haptics.notificationAsync).mockRejectedValueOnce(new Error('no motor'));
    jest.mocked(Haptics.selectionAsync).mockImplementationOnce(() => {
      throw new Error('not linked');
    });
    expect(() => haptics.error()).not.toThrow();
    expect(() => haptics.selection()).not.toThrow();
    await Promise.resolve();
  });
});
