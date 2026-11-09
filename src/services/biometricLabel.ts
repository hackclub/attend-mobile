import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

// The user-facing name for "unlock with your device". iOS users know their
// sensor by name; Android's BiometricPrompt covers face, fingerprint and iris
// under one system sheet, so "biometrics" is the honest word there. Devices
// without biometric hardware fall back to the passcode or screen lock, which
// is what LocalAuthentication then asks for.

const IOS_FALLBACK = 'device passcode';
const ANDROID_FALLBACK = 'screen lock';

function fallback(): string {
  return Platform.OS === 'ios' ? IOS_FALLBACK : ANDROID_FALLBACK;
}

export async function getBiometricLabel(): Promise<string> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return fallback();

    if (Platform.OS !== 'ios') return 'biometrics';

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Touch ID';
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'Optic ID';
    return fallback();
  } catch {
    return fallback();
  }
}

let cached: Promise<string> | null = null;

/**
 * The biometric label for this device, resolved once per app run. Renders
 * the platform's generic wording until the lookup finishes.
 */
export function useBiometricLabel(): string {
  const [label, setLabel] = useState(() => (Platform.OS === 'ios' ? 'Face ID' : 'biometrics'));

  useEffect(() => {
    let active = true;
    cached ??= getBiometricLabel();
    cached.then((value) => {
      if (active) setLabel(value);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return label;
}

/** Test seam: forget the cached lookup. */
export function resetBiometricLabelCache(): void {
  cached = null;
}
