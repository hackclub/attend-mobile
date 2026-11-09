import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// One place for tactile feedback. iOS keeps the Taptic Engine's notification,
// impact and selection patterns; Android uses the system's own haptic
// constants (performHapticFeedback), which follow the user's vibration
// settings and feel native, instead of iOS-shaped vibrator patterns.
//
// Every call is fire-and-forget: haptics are a nicety, so a device without a
// motor, a disabled setting or a native error never reaches the caller.

export type HapticNotification = 'success' | 'warning' | 'error';
export type HapticImpact = 'light' | 'medium';

const isAndroid = Platform.OS === 'android';

function run(task: () => Promise<void>): void {
  try {
    void task().catch(() => {});
  } catch {
    // The native module can throw synchronously when it isn't linked.
  }
}

function android(type: Haptics.AndroidHaptics): void {
  run(() => Haptics.performAndroidHapticsAsync(type));
}

const ANDROID_NOTIFICATION: Record<HapticNotification, Haptics.AndroidHaptics> = {
  success: Haptics.AndroidHaptics.Confirm,
  // Android has no "warning" constant; a long-press tick is distinct from both
  // confirm and reject without reading as a failure.
  warning: Haptics.AndroidHaptics.Long_Press,
  error: Haptics.AndroidHaptics.Reject,
};

const IOS_NOTIFICATION: Record<HapticNotification, Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

const ANDROID_IMPACT: Record<HapticImpact, Haptics.AndroidHaptics> = {
  light: Haptics.AndroidHaptics.Keyboard_Tap,
  medium: Haptics.AndroidHaptics.Virtual_Key,
};

const IOS_IMPACT: Record<HapticImpact, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
};

export function notify(type: HapticNotification): void {
  if (isAndroid) android(ANDROID_NOTIFICATION[type]);
  else run(() => Haptics.notificationAsync(IOS_NOTIFICATION[type]));
}

export function impact(style: HapticImpact = 'light'): void {
  if (isAndroid) android(ANDROID_IMPACT[style]);
  else run(() => Haptics.impactAsync(IOS_IMPACT[style]));
}

export function selection(): void {
  if (isAndroid) android(Haptics.AndroidHaptics.Clock_Tick);
  else run(() => Haptics.selectionAsync());
}

export const haptics = {
  success: () => notify('success'),
  warning: () => notify('warning'),
  error: () => notify('error'),
  selection,
  impact,
  notify,
};
