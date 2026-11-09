import * as LocalAuthentication from 'expo-local-authentication';

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Participant details are always behind the device's own lock: Face ID or
// Touch ID where it's set up, the passcode otherwise. There is deliberately
// no setting to turn this off. A device with no lock at all can't pass the
// prompt, so it can't open participant details either.
//
// One unlock lasts five minutes, but only while the app stays in the
// foreground: going to the background, and signing out, end it at once.
// Mounted gates (see useBiometricGate) hear about that through onLock and
// hide what they were showing.

type LockListener = () => void;

class BiometricService {
  private lastAuthTime: number | null = null;
  private lockListeners = new Set<LockListener>();

  async isAvailable(): Promise<boolean> {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  }

  async getSupportedTypes(): Promise<LocalAuthentication.AuthenticationType[]> {
    return LocalAuthentication.supportedAuthenticationTypesAsync();
  }

  isSessionValid(): boolean {
    if (!this.lastAuthTime) return false;
    const elapsed = Date.now() - this.lastAuthTime;
    // A clock that jumped backwards doesn't extend the unlock.
    return elapsed >= 0 && elapsed < SESSION_TIMEOUT_MS;
  }

  // Ends the unlock and tells every mounted gate to lock.
  clearSession(): void {
    this.lastAuthTime = null;
    this.lockListeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // One broken listener mustn't stop the others from locking.
      }
    });
  }

  onLock(listener: LockListener): () => void {
    this.lockListeners.add(listener);
    return () => {
      this.lockListeners.delete(listener);
    };
  }

  // Fed from AppState. Only a real background ends the session: iOS makes
  // the app 'inactive' while the Face ID or passcode prompt itself is up.
  handleAppStateChange(next: string): void {
    if (next === 'background') {
      this.clearSession();
    }
  }

  // Always prompts, even when a recent unlock is still valid.
  async confirmIdentity(reason: string): Promise<boolean> {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        fallbackLabel: 'Use passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        this.lastAuthTime = Date.now();
        return true;
      }
    } catch {
      // A prompt that can't be shown counts as a failed authentication.
    }

    return false;
  }

  async authenticate(reason?: string): Promise<boolean> {
    if (this.isSessionValid()) {
      return true;
    }

    return this.confirmIdentity(reason || 'Authenticate to view sensitive information');
  }

  async getBiometricTypeName(): Promise<string> {
    const types = await this.getSupportedTypes();
    
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Touch ID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'Iris';
    }
    return 'Biometric';
  }
}

export const biometricService = new BiometricService();
