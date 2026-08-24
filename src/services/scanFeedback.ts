import * as Haptics from 'expo-haptics';
import type { ScannerOutcome } from './scannerCore';

export type ScanSound = 'scanned' | 'already-scanned' | 'not-scanned';

export interface ScanFeedback {
  sound: ScanSound;
  haptic: Haptics.NotificationFeedbackType;
}

export function feedbackForOutcome(outcome: ScannerOutcome): ScanFeedback | null {
  switch (outcome) {
    case 'scanned':
      return {
        sound: 'scanned',
        haptic: Haptics.NotificationFeedbackType.Success,
      };
    case 'already_scanned':
      return {
        sound: 'already-scanned',
        haptic: Haptics.NotificationFeedbackType.Warning,
      };
    case 'not_scanned':
      return {
        sound: 'not-scanned',
        haptic: Haptics.NotificationFeedbackType.Error,
      };
    case 'confirming':
      return null;
  }
}
