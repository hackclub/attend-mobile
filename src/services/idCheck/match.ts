// Compares the name and date of birth read from a document chip with the
// participant's Attend record. Pure functions: the screen decides nothing about
// identity on its own, it only shows what these return.

export type NameMatch = 'exact' | 'fuzzy' | 'mismatch';
export type DobMatch = 'match' | 'partial' | 'mismatch' | 'unknown';

// ICAO 9303 part 3, 6.A: the recommended transliteration of multinational
// Latin characters. Applied before diacritics are stripped, so "Müller" and
// "MUELLER" agree. Issuers may instead drop the accent ("MULLER"), so matching
// also tries the plain form.
const ICAO_TRANSLITERATION: Record<string, string> = {
  'Ä': 'AE',
  'Å': 'AA',
  'Æ': 'AE',
  'Ĳ': 'IJ',
  'Ö': 'OE',
  'Ø': 'OE',
  'Œ': 'OE',
  'Ü': 'UE',
  'ß': 'SS',
  'ẞ': 'SS',
  'Þ': 'TH',
  'Ð': 'D',
  'Đ': 'D',
  'Ħ': 'H',
  'Ł': 'L',
  'Ŀ': 'L',
  'Ŋ': 'N',
  'ı': 'I',
};

function finish(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[<\-'’‘`.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns the ICAO-transliterated form first, then the accent-stripped form
// when it differs. Uppercases before transliterating so "ä" and "Ä" agree.
export function normaliseNameVariants(value: string): string[] {
  const upper = value.toUpperCase();
  const icao = finish(upper.replace(/./gu, (char) => ICAO_TRANSLITERATION[char] ?? char));
  const plain = finish(upper);
  return icao === plain ? [icao] : [icao, plain];
}

export function normaliseName(value: string): string {
  return normaliseNameVariants(value)[0];
}

function tokens(value: string): string[] {
  return value.split(' ').filter(Boolean);
}

export function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

// One edit allowed per eight characters, rounded up.
function withinFuzzyDistance(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  return editDistance(a, b) <= Math.ceil(length / 8);
}

type GivenMatch = 'exact' | 'truncated' | 'none';

function matchGiven(attendFirst: string[], documentGiven: string[], truncated: boolean): GivenMatch {
  if (attendFirst.length === 0) return 'none';
  if (attendFirst.every((token) => documentGiven.includes(token))) return 'exact';
  if (!truncated || documentGiven.length === 0) return 'none';

  // A truncated MRZ cuts the last given name it could fit, so every Attend
  // token must still be present except that it may be a prefix of a cut one.
  const last = documentGiven[documentGiven.length - 1];
  const complete = documentGiven.slice(0, -1);
  const allFound = attendFirst.every(
    (token) => complete.includes(token) || (last.length > 0 && token.startsWith(last))
  );
  return allFound ? 'truncated' : 'none';
}

export interface NameInput {
  attendFirstName: string;
  attendLastName: string;
  documentSurname: string;
  documentGivenNames: string;
  documentNameTruncated: boolean;
}

export function matchName(input: NameInput): NameMatch {
  let best: NameMatch = 'mismatch';

  for (const attendLast of normaliseNameVariants(input.attendLastName)) {
    for (const attendFirst of normaliseNameVariants(input.attendFirstName)) {
      const docSurname = normaliseName(input.documentSurname);
      const docGiven = tokens(normaliseName(input.documentGivenNames));

      const surnameExact = tokens(attendLast).join(' ') === tokens(docSurname).join(' ');
      const surnameClose =
        surnameExact ||
        withinFuzzyDistance(tokens(attendLast).join(''), tokens(docSurname).join(''));
      const given = matchGiven(tokens(attendFirst), docGiven, input.documentNameTruncated);

      if (surnameExact && given === 'exact') return 'exact';
      if (surnameClose && given !== 'none') best = 'fuzzy';
    }
  }

  return best;
}

// Compares a YYMMDD date of birth from the document with the Attend one
// (YYYY-MM-DD). The century comes from the Attend date, so "080314" matches
// both 2008-03-14 and 1908-03-14; only the record says which was meant. An
// unknown day or month in the MRZ ("<<") can at best be a partial match.
export function matchDateOfBirth(documentDob: string, attendDob: string | undefined | null): DobMatch {
  const attend = attendDob?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!attend) return 'unknown';
  if (!/^[0-9<]{6}$/.test(documentDob)) return 'mismatch';

  const expected = attend[1].slice(2) + attend[2] + attend[3];
  let unknownParts = false;
  for (let i = 0; i < 6; i += 2) {
    const part = documentDob.slice(i, i + 2);
    if (part === '<<') {
      unknownParts = true;
      continue;
    }
    if (part !== expected.slice(i, i + 2)) return 'mismatch';
  }
  return unknownParts ? 'partial' : 'match';
}

// Resolves a YYMMDD date of birth to YYYY-MM-DD using the Attend date's
// century. Returns null when the Attend date is missing or the MRZ date has
// unknown parts.
export function resolveDateOfBirth(documentDob: string, attendDob: string | undefined | null): string | null {
  const attend = attendDob?.match(/^(\d{2})\d{2}-/);
  if (!attend || !/^\d{6}$/.test(documentDob)) return null;
  return `${attend[1]}${documentDob.slice(0, 2)}-${documentDob.slice(2, 4)}-${documentDob.slice(4, 6)}`;
}

// Expiry dates are always this century or the next for documents in
// circulation, so YY maps to 20YY.
export function isExpired(documentExpiry: string, today: Date = new Date()): boolean {
  if (!/^\d{6}$/.test(documentExpiry)) return true;
  const year = 2000 + Number(documentExpiry.slice(0, 2));
  const month = Number(documentExpiry.slice(2, 4));
  const day = Number(documentExpiry.slice(4, 6));
  const todayKey = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return year * 10000 + month * 100 + day < todayKey;
}
