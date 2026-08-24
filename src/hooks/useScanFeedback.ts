import { useCallback, useEffect, useRef } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { feedbackForOutcome, type ScanSound } from '../services/scanFeedback';
import type { ScannerOutcome } from '../services/scannerCore';

export function useScanFeedback() {
  const scannedPlayer = useAudioPlayer(require('../../assets/sounds/scanned.wav'));
  const alreadyScannedPlayer = useAudioPlayer(require('../../assets/sounds/already-scanned.wav'));
  const notScannedPlayer = useAudioPlayer(require('../../assets/sounds/not-scanned.wav'));
  const scannedStatus = useAudioPlayerStatus(scannedPlayer);
  const alreadyScannedStatus = useAudioPlayerStatus(alreadyScannedPlayer);
  const notScannedStatus = useAudioPlayerStatus(notScannedPlayer);
  const isReady = scannedStatus.isLoaded
    && alreadyScannedStatus.isLoaded
    && notScannedStatus.isLoaded;
  const pendingSoundRef = useRef<ScanSound | null>(null);

  const playSound = useCallback((sound: ScanSound) => {
    const players: Record<ScanSound, typeof scannedPlayer> = {
      scanned: scannedPlayer,
      'already-scanned': alreadyScannedPlayer,
      'not-scanned': notScannedPlayer,
    };
    const player = players[sound];
    void player.seekTo(0)
      .then(() => player.play())
      .catch(() => {});
  }, [alreadyScannedPlayer, notScannedPlayer, scannedPlayer]);

  useEffect(() => {
    if (!isReady || !pendingSoundRef.current) return;
    const sound = pendingSoundRef.current;
    pendingSoundRef.current = null;
    playSound(sound);
  }, [isReady, playSound]);

  const play = useCallback((outcome: ScannerOutcome) => {
    const feedback = feedbackForOutcome(outcome);
    if (!feedback) return;

    if (isReady) {
      playSound(feedback.sound);
    } else {
      pendingSoundRef.current = feedback.sound;
    }
    void Haptics.notificationAsync(feedback.haptic).catch(() => {});
  }, [isReady, playSound]);

  return { play, isReady };
}
