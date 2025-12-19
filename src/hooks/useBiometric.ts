import { useState, useEffect, useCallback } from 'react';
import { biometricService } from '../services/biometric';

export function useBiometric() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('Biometric');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const [available, enabled, typeName] = await Promise.all([
        biometricService.isAvailable(),
        biometricService.isEnabled(),
        biometricService.getBiometricTypeName(),
      ]);
      setIsAvailable(available);
      setIsEnabled(enabled);
      setBiometricType(typeName);
      setIsLoading(false);
    }
    init();
  }, []);

  const toggleEnabled = useCallback(async () => {
    if (!isAvailable) return false;

    const newValue = !isEnabled;
    
    if (newValue) {
      const success = await biometricService.authenticate(
        `Enable ${biometricType} protection`
      );
      if (!success) return false;
    }

    await biometricService.setEnabled(newValue);
    setIsEnabled(newValue);
    return true;
  }, [isAvailable, isEnabled, biometricType]);

  const authenticate = useCallback(async (reason?: string) => {
    return biometricService.authenticate(reason);
  }, []);

  const clearSession = useCallback(() => {
    biometricService.clearSession();
  }, []);

  return {
    isAvailable,
    isEnabled,
    biometricType,
    isLoading,
    toggleEnabled,
    authenticate,
    clearSession,
  };
}
