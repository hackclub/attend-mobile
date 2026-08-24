jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

import * as Haptics from 'expo-haptics';
import { feedbackForOutcome } from '../scanFeedback';

describe('feedbackForOutcome', () => {
  it('maps each final outcome to a distinct sound and haptic', () => {
    expect(feedbackForOutcome('scanned')).toEqual({
      sound: 'scanned',
      haptic: Haptics.NotificationFeedbackType.Success,
    });
    expect(feedbackForOutcome('already_scanned')).toEqual({
      sound: 'already-scanned',
      haptic: Haptics.NotificationFeedbackType.Warning,
    });
    expect(feedbackForOutcome('not_scanned')).toEqual({
      sound: 'not-scanned',
      haptic: Haptics.NotificationFeedbackType.Error,
    });
  });

  it('does not play final feedback while confirmation is pending', () => {
    expect(feedbackForOutcome('confirming')).toBeNull();
  });
});
