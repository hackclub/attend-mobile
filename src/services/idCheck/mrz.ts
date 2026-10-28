// Machine readable zone parsing for ICAO 9303 documents: TD3 (passports, two
// lines of 44) and TD1 (ID cards and residence permits, three lines of 30).
// Pure functions so the camera scanner, manual entry and the chip result all
// share one tested implementation.

export type MrzFormat = 'TD1' | 'TD3';

export interface MrzData {
  format: MrzFormat;
  documentCode: string; // e.g. "P", "ID", "IR"
  issuingState: string; // ISO 3166 alpha-3 (or ICAO code such as "D" for Germany)
  documentNumber: string;
  dateOfBirth: string; // YYMMDD, may contain "<" for an unknown day or month
  dateOfExpiry: string; // YYMMDD
  nationality: string;
  nameField: string; // raw, e.g. "SMITH<<JOHN<ALEXANDER<<<<<<"
}

// The three fields the chip's access key is derived from (BAC, or PACE with
// the MRZ as password).
export interface MrzAccessFields {
  documentNumber: string;
  dateOfBirth: string;
  dateOfExpiry: string;
}

const TD3_LENGTH = 44;
const TD1_LENGTH = 30;

function charValue(char: string): number {
  if (char === '<') return 0;
  if (char >= '0' && char <= '9') return char.charCodeAt(0) - 48;
  if (char >= 'A' && char <= 'Z') return char.charCodeAt(0) - 55;
  return -1;
}

// ICAO 9303 part 3, 4.9: weights 7, 3, 1 repeating, modulo 10.
export function checkDigit(field: string): number {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    const value = charValue(field[i]);
    if (value < 0) return -1;
    sum += value * weights[i % 3];
  }
  return sum % 10;
}

function checks(field: string, digit: string): boolean {
  // "<" in a check digit position means the field is blank, which only an
  // optional field may be.
  return /^[0-9]$/.test(digit) && checkDigit(field) === Number(digit);
}

// Removes whitespace and maps the characters text recognition commonly
// confuses with the filler.
export function normaliseMrzLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[«‹]/g, '<');
}

function trimFiller(value: string): string {
  return value.replace(/<+$/, '').replace(/</g, ' ').trim();
}

function parseTd3(l1: string, l2: string): MrzData | null {
  const documentNumber = l2.slice(0, 9);
  const dateOfBirth = l2.slice(13, 19);
  const dateOfExpiry = l2.slice(21, 27);
  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);

  if (!checks(documentNumber, l2[9])) return null;
  if (!checks(dateOfBirth, l2[19])) return null;
  if (!checks(dateOfExpiry, l2[27])) return null;
  if (!checks(composite, l2[43])) return null;

  return {
    format: 'TD3',
    documentCode: trimFiller(l1.slice(0, 2)),
    issuingState: trimFiller(l1.slice(2, 5)),
    documentNumber: trimFiller(documentNumber).replace(/ /g, ''),
    dateOfBirth,
    dateOfExpiry,
    nationality: trimFiller(l2.slice(10, 13)),
    nameField: l1.slice(5),
  };
}

function parseTd1(l1: string, l2: string, l3: string): MrzData | null {
  let documentNumber = l1.slice(5, 14);
  let documentNumberCheck = l1[14];

  // A document number longer than nine characters carries on into the
  // optional data, with its check digit as the last character before the
  // filler (ICAO 9303 part 5, 4.2.4).
  if (documentNumberCheck === '<') {
    const overflow = l1.slice(15, 30).replace(/<+$/, '');
    if (overflow.length < 2) return null;
    documentNumber += overflow.slice(0, -1);
    documentNumberCheck = overflow.slice(-1);
  }

  const dateOfBirth = l2.slice(0, 6);
  const dateOfExpiry = l2.slice(8, 14);
  const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);

  if (!checks(documentNumber, documentNumberCheck)) return null;
  if (!checks(dateOfBirth, l2[6])) return null;
  if (!checks(dateOfExpiry, l2[14])) return null;
  if (!checks(composite, l2[29])) return null;

  return {
    format: 'TD1',
    documentCode: trimFiller(l1.slice(0, 2)),
    issuingState: trimFiller(l1.slice(2, 5)),
    documentNumber: documentNumber.replace(/</g, ''),
    dateOfBirth,
    dateOfExpiry,
    nationality: trimFiller(l2.slice(15, 18)),
    nameField: l3,
  };
}

const MRZ_LINE = /^[A-Z0-9<]+$/;

// Parses a full MRZ from its lines. Returns null unless every mandatory check
// digit (and the composite) is valid, so a partial or misread scan never
// produces a key.
export function parseMrz(lines: string[]): MrzData | null {
  const clean = lines.map(normaliseMrzLine).filter((line) => line.length > 0);
  if (!clean.every((line) => MRZ_LINE.test(line))) return null;

  if (clean.length === 2 && clean.every((line) => line.length === TD3_LENGTH)) {
    return parseTd3(clean[0], clean[1]);
  }
  if (clean.length === 3 && clean.every((line) => line.length === TD1_LENGTH)) {
    return parseTd1(clean[0], clean[1], clean[2]);
  }
  return null;
}

// Picks the MRZ out of everything text recognition saw on the page, which
// usually includes the visual zone too. Looks for the right number of
// consecutive MRZ-shaped lines and returns the first block that parses.
export function findMrz(recognisedLines: string[]): MrzData | null {
  const candidates = recognisedLines
    .map(normaliseMrzLine)
    .filter((line) => MRZ_LINE.test(line) && (line.length === TD3_LENGTH || line.length === TD1_LENGTH));

  for (let i = 0; i < candidates.length; i++) {
    const td3 = candidates.slice(i, i + 2);
    if (td3.length === 2 && td3.every((line) => line.length === TD3_LENGTH)) {
      const parsed = parseMrz(td3);
      if (parsed) return parsed;
    }
    const td1 = candidates.slice(i, i + 3);
    if (td1.length === 3 && td1.every((line) => line.length === TD1_LENGTH)) {
      const parsed = parseMrz(td1);
      if (parsed) return parsed;
    }
  }
  return null;
}

// Splits the MRZ name field into surname and given names. `truncated` is true
// when the field runs to the end of the line with no trailing filler, which is
// how the MRZ shows a name that was cut short to fit.
export function parseNameField(nameField: string): {
  surname: string;
  givenNames: string;
  truncated: boolean;
} {
  const [surnamePart, ...rest] = nameField.split('<<');
  const givenPart = rest.join('<<');
  return {
    surname: trimFiller(surnamePart),
    givenNames: trimFiller(givenPart),
    truncated: nameField.length > 0 && !nameField.endsWith('<'),
  };
}

const YYMMDD = /^\d{6}$/;

function isValidYymmdd(value: string): boolean {
  if (!YYMMDD.test(value)) return false;
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

// Validates fields typed in by hand when the camera can't read the MRZ. The
// document number keeps its own characters; dates are YYMMDD.
export function validateManualAccess(fields: MrzAccessFields): string | null {
  const documentNumber = fields.documentNumber.toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9]{1,22}$/.test(documentNumber)) return 'Enter the document number as printed.';
  if (!isValidYymmdd(fields.dateOfBirth)) return 'Enter the date of birth as YYMMDD.';
  if (!isValidYymmdd(fields.dateOfExpiry)) return 'Enter the expiry date as YYMMDD.';
  return null;
}

export function isValidCan(can: string): boolean {
  return /^\d{6}$/.test(can);
}

// The key seed BAC and PACE derive from: document number (padded to nine with
// filler), date of birth and date of expiry, each followed by its check digit
// (ICAO 9303 part 11, 4.3.2 and 9.7.2).
export function buildMrzKey(fields: MrzAccessFields): string {
  const documentNumber = fields.documentNumber.toUpperCase().replace(/\s+/g, '').padEnd(9, '<');
  const part = (field: string) => `${field}${checkDigit(field)}`;
  return part(documentNumber) + part(fields.dateOfBirth) + part(fields.dateOfExpiry);
}
