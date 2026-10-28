import MrtdReader, { type NativeChecks } from '../../../modules/mrtd-reader/src';
import { buildMrzKey, findMrz, parseNameField, type MrzAccessFields, type MrzData } from './mrz';

// How the chip is unlocked: the MRZ fields (BAC, or PACE with the MRZ as the
// password), or the 6-digit card access number printed on the front of most
// EU ID cards.
export type Access =
  | { mrz: MrzAccessFields } // dates YYMMDD
  | { can: string }; // 6 digits

export interface MrtdResult {
  documentType: string; // first letter of the document code: P, I, A, C
  issuingState: string; // ISO 3166 alpha-3, e.g. GBR (Germany is "D")
  nationality: string;
  surname: string; // as in DG1, e.g. SMITH
  givenNames: string; // e.g. JOHN ALEXANDER
  nameTruncated: boolean; // the MRZ cut the name short to fit
  dateOfBirth: string; // YYMMDD from DG1
  dateOfExpiry: string; // YYMMDD from DG1
  photoJpegBase64: string; // DG2 as JPEG
  checks: NativeChecks;
}

export class MrtdError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MrtdError';
    this.code = code;
  }

  get isCancelled(): boolean {
    return this.code === 'ERR_CANCELLED';
  }
}

// True when this device can read document chips (an iPhone with NFC, on a
// build that includes the module).
export function isReaderSupported(): boolean {
  return MrtdReader?.isSupported() ?? false;
}

export function isMrzScannerSupported(): boolean {
  return MrtdReader?.isMrzScannerSupported() ?? false;
}

// False when the build ships without CSCA certificates (bin/update-csca not
// run), in which case no document's issuer can be verified.
export function hasTrustAnchors(): boolean {
  return MrtdReader?.hasTrustAnchors() ?? false;
}

// Opens the camera and resolves once a whole MRZ reads with valid check
// digits, or null if the admin cancels. Held in memory only.
export async function scanMrz(): Promise<{ access: Access; mrz: MrzData } | null> {
  const reader = MrtdReader;
  if (!reader) throw new MrtdError('ERR_UNAVAILABLE', 'ID checks need the iOS app');

  let found: MrzData | null = null;
  const subscription = reader.addListener('onMrzText', ({ lines }) => {
    if (found) return;
    const mrz = findMrz(lines);
    if (mrz) {
      found = mrz;
      reader.dismissMrzScanner().catch(() => {});
    }
  });

  try {
    await reader.presentMrzScanner();
  } catch (error: any) {
    throw new MrtdError(error?.code ?? 'ERR_MRZ_SCANNER', error?.message ?? 'Could not open the camera');
  } finally {
    subscription.remove();
  }

  const mrz = found as MrzData | null;
  if (!mrz) return null;
  return {
    mrz,
    access: {
      mrz: {
        documentNumber: mrz.documentNumber,
        dateOfBirth: mrz.dateOfBirth,
        dateOfExpiry: mrz.dateOfExpiry,
      },
    },
  };
}

export async function readDocument(access: Access): Promise<MrtdResult> {
  if (!MrtdReader) throw new MrtdError('ERR_UNAVAILABLE', 'ID checks need the iOS app');
  if ('can' in access) {
    // NFCPassportReader 2.3 only derives PACE keys from the MRZ. Chipped ID
    // cards also accept the MRZ printed on the back.
    throw new MrtdError(
      'ERR_CAN_UNSUPPORTED',
      'Reading with the card access number is not supported yet. Scan the code on the back of the card instead.'
    );
  }

  let native;
  try {
    native = await MrtdReader.readDocument(buildMrzKey(access.mrz));
  } catch (error: any) {
    throw new MrtdError(error?.code ?? 'ERR_READ_FAILED', error?.message ?? 'Could not read the chip');
  }

  const name = parseNameField(native.nameField);
  return {
    documentType: native.documentCode.charAt(0),
    issuingState: native.issuingState,
    nationality: native.nationality,
    surname: name.surname,
    givenNames: name.givenNames,
    nameTruncated: name.truncated,
    dateOfBirth: native.dateOfBirth,
    dateOfExpiry: native.dateOfExpiry,
    photoJpegBase64: native.photoJpegBase64,
    checks: native.checks,
  };
}

export async function cancelRead(): Promise<void> {
  await MrtdReader?.cancel();
}
