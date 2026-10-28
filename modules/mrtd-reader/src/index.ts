import { Platform } from 'react-native';

// Raw bindings to the native MrtdReader module. The app-facing API (MRZ
// scanning, key building, result parsing) is src/services/idCheck/reader.ts.

export interface NativeChecks {
  dataIntegrity: 'valid' | 'invalid'; // DG hashes vs SOD, SOD signature
  issuer: 'valid' | 'invalid' | 'unknown_issuer'; // SOD -> DS cert -> CSCA
  activeAuth: 'passed' | 'failed' | 'unsupported'; // DG15, random challenge
  chipAuth: 'passed' | 'failed' | 'unsupported'; // DG14
  accessProtocol: 'PACE' | 'BAC';
}

export interface NativeMrtdResult {
  documentCode: string; // DG1, e.g. "P", "ID"
  issuingState: string;
  nationality: string;
  nameField: string; // DG1 name field with MRZ filler, e.g. "SMITH<<JOHN<<<"
  dateOfBirth: string; // YYMMDD
  dateOfExpiry: string; // YYMMDD
  photoJpegBase64: string; // DG2, transcoded from JPEG 2000 in native code
  checks: NativeChecks;
}

interface MrtdReaderModule {
  isSupported(): boolean;
  isMrzScannerSupported(): boolean;
  hasTrustAnchors(): boolean;
  // Resolves true if the admin cancelled, false if dismissMrzScanner closed it.
  presentMrzScanner(): Promise<boolean>;
  dismissMrzScanner(): Promise<void>;
  readDocument(mrzKey: string): Promise<NativeMrtdResult>;
  cancel(): Promise<void>;
  addListener(event: 'onMrzText', listener: (event: { lines: string[] }) => void): { remove(): void };
}

const MrtdReader: MrtdReaderModule | null = (() => {
  if (Platform.OS !== 'ios') {
    return null;
  }
  try {
    const { requireNativeModule } = require('expo-modules-core');
    return requireNativeModule('MrtdReader');
  } catch {
    return null;
  }
})();

export default MrtdReader;
