import { feedbackForOutcome } from '../scanFeedback';

describe('feedbackForOutcome', () => {
  it('maps each final outcome to a distinct sound and haptic', () => {
    expect(feedbackForOutcome('scanned')).toEqual({ sound: 'scanned', haptic: 'success' });
    expect(feedbackForOutcome('already_scanned')).toEqual({ sound: 'already-scanned', haptic: 'warning' });
    expect(feedbackForOutcome('not_scanned')).toEqual({ sound: 'not-scanned', haptic: 'error' });
  });

  it('does not play final feedback while confirmation is pending', () => {
    expect(feedbackForOutcome('confirming')).toBeNull();
  });
});
