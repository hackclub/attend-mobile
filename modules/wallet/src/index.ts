import { Platform } from 'react-native';

interface WalletModule {
  canAddPasses(): boolean;
  addPassFromUrl(url: string): Promise<boolean>;
}

const Wallet: WalletModule | null = (() => {
  if (Platform.OS !== 'ios') {
    return null;
  }
  try {
    const { requireNativeModule } = require('expo-modules-core');
    return requireNativeModule('Wallet');
  } catch {
    return null;
  }
})();

// True when the device can present the native Add-to-Wallet sheet (false on
// Simulator, non-iOS, or if the native module isn't linked).
export function canAddPasses(): boolean {
  return Wallet?.canAddPasses() ?? false;
}

// Download the .pkpass and present Apple Wallet's native add sheet. Returns
// false if it couldn't (caller should fall back to opening the URL).
export async function addPassFromUrl(url: string): Promise<boolean> {
  if (!Wallet) return false;
  try {
    return await Wallet.addPassFromUrl(url);
  } catch (error) {
    console.error('Failed to present Apple Wallet sheet:', error);
    return false;
  }
}
