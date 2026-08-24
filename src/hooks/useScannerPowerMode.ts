import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { asyncStorage, STORAGE_KEYS } from '../services/storage';
import { ScannerPowerController } from '../services/scannerPower';

const SHARED_KEEP_AWAKE_TAG = 'attend-scanner';
const sharedPowerController = new ScannerPowerController({
  getBrightness: Brightness.getBrightnessAsync,
  setBrightness: Brightness.setBrightnessAsync,
  restoreBrightness: async originalBrightness => {
    if (Platform.OS === 'android') {
      await Brightness.restoreSystemBrightnessAsync();
    } else {
      await Brightness.setBrightnessAsync(originalBrightness);
    }
  },
  activateKeepAwake: () => activateKeepAwakeAsync(SHARED_KEEP_AWAKE_TAG),
  deactivateKeepAwake: () => deactivateKeepAwake(SHARED_KEEP_AWAKE_TAG),
}, {
  idleMs: 30_000,
  dimLevel: 0.2,
});

class ScannerPowerCoordinator {
  private activeConsumers = new Set<symbol>();
  private operationQueue: Promise<void> = Promise.resolve();

  setActive(consumer: symbol, active: boolean): void {
    if (active) {
      this.activeConsumers.add(consumer);
    } else {
      this.activeConsumers.delete(consumer);
    }

    this.operationQueue = this.operationQueue
      .then(async () => {
        if (this.activeConsumers.size > 0) {
          await sharedPowerController.enable();
          await sharedPowerController.recordActivity();
        } else {
          await sharedPowerController.disable();
        }
      })
      .catch(error => {
        console.warn('[Power Mode] Native state change failed:', error);
      });
  }

  recordActivity(): void {
    this.operationQueue = this.operationQueue
      .then(() => sharedPowerController.recordActivity())
      .catch(error => {
        console.warn('[Power Mode] Activity update failed:', error);
      });
  }
}

const powerCoordinator = new ScannerPowerCoordinator();

export function useScannerPowerMode(isScannerAvailable = true) {
  const [isPowerModeEnabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const focusedRef = useRef(false);
  const scannerAvailableRef = useRef(isScannerAvailable);
  const appActiveRef = useRef(AppState.currentState === 'active');
  const disposedRef = useRef(false);
  const consumerRef = useRef(Symbol('scanner-power-consumer'));

  const reconcile = useCallback(() => {
    powerCoordinator.setActive(
      consumerRef.current,
      !disposedRef.current
        && enabledRef.current
        && focusedRef.current
        && appActiveRef.current
        && scannerAvailableRef.current
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    asyncStorage.get<boolean>(STORAGE_KEYS.POWER_MODE_ENABLED)
      .then(value => {
        if (cancelled) return;
        const enabled = value ?? false;
        enabledRef.current = enabled;
        setEnabled(enabled);
        reconcile();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reconcile]);

  useEffect(() => {
    scannerAvailableRef.current = isScannerAvailable;
    reconcile();
  }, [isScannerAvailable, reconcile]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      reconcile();
      return () => {
        focusedRef.current = false;
        reconcile();
      };
    }, [reconcile])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      appActiveRef.current = nextState === 'active';
      reconcile();
    });

    return () => subscription.remove();
  }, [reconcile]);

  useEffect(() => () => {
    disposedRef.current = true;
    focusedRef.current = false;
    powerCoordinator.setActive(consumerRef.current, false);
  }, []);

  const setPowerModeEnabled = useCallback((enabled: boolean) => {
    enabledRef.current = enabled;
    setEnabled(enabled);
    void asyncStorage.set(STORAGE_KEYS.POWER_MODE_ENABLED, enabled);
    reconcile();
  }, [reconcile]);

  const recordScannerActivity = useCallback(() => {
    powerCoordinator.recordActivity();
  }, []);

  return {
    isPowerModeEnabled,
    setPowerModeEnabled,
    recordScannerActivity,
  };
}
