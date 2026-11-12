import { useState, useCallback, useEffect } from 'react';
import { haptics } from '../services/haptics';
import { nfcService, NFCReadResult, NFCSessionState, NFCWriteData } from '../services/nfc';

interface UseNFCReturn {
  isSupported: boolean;
  isEnabled: boolean;
  isReading: boolean;
  isWriting: boolean;
  lastRead: NFCReadResult | null;
  readTag: () => Promise<NFCReadResult>;
  writeTag: (data: NFCWriteData) => Promise<{ success: boolean; error?: string }>;
  cancelOperation: () => Promise<void>;
  clearLastRead: () => void;
  /**
   * True on Android: there is no system "hold near reader" sheet, so show an
   * in-app one driven by `session` while a read/write runs.
   */
  needsInAppPrompt: boolean;
  /** Progress of the current read/write: idle, waiting, success or error. */
  session: NFCSessionState;
  /** Clears a finished success/error session (e.g. when the sheet closes). */
  resetSession: () => void;
  /** Android: opens the system NFC settings (when `isEnabled` is false). */
  openSettings: () => Promise<void>;
}

export function useNFC(): UseNFCReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [lastRead, setLastRead] = useState<NFCReadResult | null>(null);
  const [session, setSession] = useState<NFCSessionState>(() => nfcService.getSnapshot().session);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = nfcService.subscribe(snapshot => {
      setSession(snapshot.session);
      setIsEnabled(snapshot.adapterEnabled);
    });

    async function init() {
      const supported = await nfcService.init();
      if (!mounted) return;
      setIsSupported(supported);

      if (supported) {
        const enabled = await nfcService.isEnabled();
        if (mounted) setIsEnabled(enabled);
      }
    }

    init();
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const readTag = useCallback(async (): Promise<NFCReadResult> => {
    if (!isSupported) {
      return { success: false, error: 'NFC not supported on this device' };
    }

    setIsReading(true);
    try {
      const result = await nfcService.readTag();
      setLastRead(result);

      if (result.success) {
        haptics.success();
      } else if (result.error !== 'Cancelled') {
        haptics.error();
      }

      return result;
    } finally {
      setIsReading(false);
    }
  }, [isSupported]);

  const writeTag = useCallback(async (data: NFCWriteData): Promise<{ success: boolean; error?: string }> => {
    if (!isSupported) {
      return { success: false, error: 'NFC not supported on this device' };
    }

    setIsWriting(true);
    try {
      const result = await nfcService.writeTag(data);

      if (result.success) {
        haptics.success();
      } else if (result.error !== 'Cancelled') {
        haptics.error();
      }

      return result;
    } finally {
      setIsWriting(false);
    }
  }, [isSupported]);

  const cancelOperation = useCallback(async () => {
    await nfcService.cancelOperation();
    setIsReading(false);
    setIsWriting(false);
  }, []);

  const clearLastRead = useCallback(() => {
    setLastRead(null);
  }, []);

  const resetSession = useCallback(() => nfcService.resetSession(), []);
  const openSettings = useCallback(() => nfcService.openSettings(), []);

  return {
    isSupported,
    isEnabled,
    isReading,
    isWriting,
    lastRead,
    readTag,
    writeTag,
    cancelOperation,
    clearLastRead,
    needsInAppPrompt: nfcService.needsInAppPrompt,
    session,
    resetSession,
    openSettings,
  };
}
