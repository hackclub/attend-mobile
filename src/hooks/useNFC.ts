import { useState, useCallback, useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { nfcService, NFCReadResult, NFCWriteData } from '../services/nfc';

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
}

export function useNFC(): UseNFCReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [lastRead, setLastRead] = useState<NFCReadResult | null>(null);

  useEffect(() => {
    async function init() {
      if (Platform.OS !== 'ios') {
        setIsSupported(false);
        return;
      }

      const supported = await nfcService.init();
      setIsSupported(supported);

      if (supported) {
        const enabled = await nfcService.isEnabled();
        setIsEnabled(enabled);
      }
    }

    init();
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
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (result.error !== 'Cancelled') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (result.error !== 'Cancelled') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
  };
}
