import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { biometricService } from '../services/biometric';
import { haptics } from '../services/haptics';

export type BiometricGateStatus = 'authenticating' | 'unlocked' | 'locked';

export const DEFAULT_GATE_REASON = 'Authenticate to view participant details';

/**
 * Drives one biometric gate.
 *
 * - Starts unlocked only if the shared five-minute session is still valid;
 *   otherwise it prompts once on mount.
 * - Fails closed: a cancelled, failed or throwing prompt leaves it locked,
 *   and only a successful one unlocks it.
 * - Locks again whenever the session ends (app backgrounded, sign-out). A
 *   lock that arrives while a prompt is still open is left to that prompt's
 *   result: on Android the passcode screen briefly backgrounds the app.
 * - Locks when the five-minute unlock runs out, even with nothing else
 *   happening.
 * - Never re-prompts by itself after a lock; the user taps Unlock.
 */
export function useBiometricGate(reason: string = DEFAULT_GATE_REASON) {
  const [status, setStatus] = useState<BiometricGateStatus>(() =>
    biometricService.isSessionValid() ? 'unlocked' : 'authenticating'
  );
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const reasonRef = useRef(reason);
  useEffect(() => {
    reasonRef.current = reason;
  }, [reason]);

  const unlock = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setStatus('authenticating');

    // Only a prompt the user just passed earns a haptic, not a session that
    // was still valid.
    const prompted = !biometricService.isSessionValid();
    let success = false;
    try {
      success = await biometricService.authenticate(reasonRef.current);
    } catch {
      success = false;
    } finally {
      inFlight.current = false;
    }

    if (mounted.current) {
      setStatus(success === true ? 'unlocked' : 'locked');
      // Android's biometric prompt already vibrates on success; Face ID and
      // Touch ID don't.
      if (success === true && prompted && Platform.OS === 'ios') haptics.success();
    }
    return success === true;
  }, []);

  useEffect(() => {
    mounted.current = true;

    const unsubscribe = biometricService.onLock(() => {
      if (!inFlight.current && mounted.current) {
        setStatus('locked');
      }
    });

    // The initial state already covers a valid session.
    if (!biometricService.isSessionValid()) {
      void unlock();
    }

    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [unlock]);

  // Re-armed on every unlock; checks again on expiry in case another gate's
  // prompt extended the shared session meanwhile.
  useEffect(() => {
    if (status !== 'unlocked') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const remaining = biometricService.sessionRemainingMs();
      if (remaining <= 0) {
        if (!inFlight.current) setStatus('locked');
        return;
      }
      timer = setTimeout(arm, remaining);
    };
    arm();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [status]);

  return { status, unlock, isUnlocked: status === 'unlocked' };
}
