import * as LocalAuthentication from 'expo-local-authentication';
import { asyncStorage } from './storage';

const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

class BiometricService {
  private lastAuthTime: number | null = null;

  async isAvailable(): Promise<boolean> {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  }

  async getSupportedTypes(): Promise<LocalAuthentication.AuthenticationType[]> {
    return LocalAuthentication.supportedAuthenticationTypesAsync();
  }

  async isEnabled(): Promise<boolean> {
    const enabled = await asyncStorage.get<boolean>(BIOMETRIC_ENABLED_KEY);
    return enabled ?? false;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await asyncStorage.set(BIOMETRIC_ENABLED_KEY, enabled);
    if (!enabled) {
      this.lastAuthTime = null;
    }
  }

  isSessionValid(): boolean {
    if (!this.lastAuthTime) return false;
    const elapsed = Date.now() - this.lastAuthTime;
    return elapsed < SESSION_TIMEOUT_MS;
  }

  clearSession(): void {
    this.lastAuthTime = null;
  }

  // Always prompts, even when protection is off or a recent unlock is still
  // valid, so changing the setting can't ride on an earlier authentication.
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
    const isEnabled = await this.isEnabled();
    if (!isEnabled) return true;

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
