import { useCallback, useEffect, useRef, useState } from 'react';
import { biometricService } from '../services/biometric';

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

  return { status, unlock, isUnlocked: status === 'unlocked' };
}
