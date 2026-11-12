import type { HapticNotification } from './haptics';
import type { ScannerOutcome } from './scannerCore';

export type ScanSound = 'scanned' | 'already-scanned' | 'not-scanned';

export interface ScanFeedback {
  sound: ScanSound;
  haptic: HapticNotification;
}

export function feedbackForOutcome(outcome: ScannerOutcome): ScanFeedback | null {
  switch (outcome) {
    case 'scanned':
      return {
        sound: 'scanned',
        haptic: 'success',
      };
    case 'already_scanned':
      return {
        sound: 'already-scanned',
        haptic: 'warning',
      };
    // Saved offline, not confirmed: the attention tone rather than the
    // success one, so staff never hear a check-in that hasn't happened.
    case 'queued':
      return {
        sound: 'already-scanned',
        haptic: 'warning',
      };
    case 'not_scanned':
      return {
        sound: 'not-scanned',
        haptic: 'error',
      };
    case 'confirming':
      return null;
  }
}
