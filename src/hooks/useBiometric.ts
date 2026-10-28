import { useState, useEffect, useCallback } from 'react';
import { biometricService } from '../services/biometric';

// Protection is always on (see biometricService), so this only reports what
// the device offers and runs the prompt; there is nothing to toggle.
export function useBiometric() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('Biometric');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const [available, typeName] = await Promise.all([
        biometricService.isAvailable(),
        biometricService.getBiometricTypeName(),
      ]);
      setIsAvailable(available);
      setBiometricType(typeName);
      setIsLoading(false);
    }
    init();
  }, []);

  const authenticate = useCallback(async (reason?: string) => {
    return biometricService.authenticate(reason);
  }, []);

  const clearSession = useCallback(() => {
    biometricService.clearSession();
  }, []);

  return {
    isAvailable,
    biometricType,
    isLoading,
    authenticate,
    clearSession,
  };
}
