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
    // Saved offline, not confirmed. Only a ticket whose signature checked
    // out on the device gets the success tone; anything unchecked gets the
    // attention one, so staff look again.
    case 'saved':
      return {
        sound: 'scanned',
        haptic: 'success',
      };
    case 'saved_unchecked':
      return {
        sound: 'already-scanned',
        haptic: 'warning',
      };
    case 'saved_cancelled':
    case 'not_scanned':
      return {
        sound: 'not-scanned',
        haptic: 'error',
      };
    case 'confirming':
      return null;
  }
}
