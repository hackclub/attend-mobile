import {
  editDistance,
  isExpired,
  matchDateOfBirth,
  matchName,
  normaliseName,
  normaliseNameVariants,
  resolveDateOfBirth,
} from '../match';

const doc = (surname: string, givenNames: string, truncated = false) => ({
  documentSurname: surname,
  documentGivenNames: givenNames,
  documentNameTruncated: truncated,
});

describe('name normalisation', () => {
  it('strips diacritics', () => {
    expect(normaliseName('José Núñez')).toBe('JOSE NUNEZ');
    expect(normaliseName('Zoë')).toBe('ZOE');
  });

  it('applies ICAO transliterations before stripping', () => {
    expect(normaliseName('Straße')).toBe('STRASSE');
    expect(normaliseName('Ærø')).toBe('AEROE');
    expect(normaliseName('Þórr')).toBe('THORR');
    expect(normaliseName('Łukasz')).toBe('LUKASZ');
    expect(normaliseName('Müller')).toBe('MUELLER');
  });

  it('also offers the plain form when the transliteration differs', () => {
    expect(normaliseNameVariants('Müller')).toEqual(['MUELLER', 'MULLER']);
    expect(normaliseNameVariants('Smith')).toEqual(['SMITH']);
  });

  it('turns filler, hyphens and apostrophes into single spaces', () => {
    expect(normaliseName("O'Brien-Smith")).toBe('O BRIEN SMITH');
    expect(normaliseName('VAN<<DER  BERG')).toBe('VAN DER BERG');
  });
});

describe('matchName', () => {
  it('is exact when the surname matches and the first name is among the given names', () => {
    expect(matchName({ attendFirstName: 'Anna', attendLastName: 'Eriksson', ...doc('ERIKSSON', 'ANNA MARIA') })).toBe('exact');
    expect(matchName({ attendFirstName: 'Maria', attendLastName: 'Eriksson', ...doc('ERIKSSON', 'ANNA MARIA') })).toBe('exact');
  });

  it('matches hyphenated and multi-part surnames', () => {
    expect(matchName({ attendFirstName: 'Jan', attendLastName: 'van der Berg', ...doc('VAN DER BERG', 'JAN') })).toBe('exact');
    expect(matchName({ attendFirstName: 'Amy', attendLastName: 'Lloyd-Jones', ...doc('LLOYD JONES', 'AMY') })).toBe('exact');
  });

  it('matches either transliteration an issuer may have used', () => {
    expect(matchName({ attendFirstName: 'Jürgen', attendLastName: 'Müller', ...doc('MUELLER', 'JUERGEN') })).toBe('exact');
    expect(matchName({ attendFirstName: 'Jürgen', attendLastName: 'Müller', ...doc('MULLER', 'JURGEN') })).toBe('exact');
  });

  it('is fuzzy for a small surname difference', () => {
    expect(matchName({ attendFirstName: 'John', attendLastName: 'Smyth', ...doc('SMITH', 'JOHN') })).toBe('fuzzy');
  });

  it('is fuzzy when the given name only matches after MRZ truncation', () => {
    expect(matchName({ attendFirstName: 'Christopher', attendLastName: 'Smith', ...doc('SMITH', 'JOHN CHRISTOPH', true) })).toBe('fuzzy');
  });

  it('does not allow for truncation when the name was not truncated', () => {
    expect(matchName({ attendFirstName: 'Christopher', attendLastName: 'Smith', ...doc('SMITH', 'JOHN CHRISTOPH') })).toBe('mismatch');
  });

  it('is a mismatch for a different person', () => {
    expect(matchName({ attendFirstName: 'Anna', attendLastName: 'Eriksson', ...doc('JOHNSON', 'ANNA') })).toBe('mismatch');
    expect(matchName({ attendFirstName: 'Bob', attendLastName: 'Eriksson', ...doc('ERIKSSON', 'ANNA MARIA') })).toBe('mismatch');
    expect(matchName({ attendFirstName: '', attendLastName: 'Eriksson', ...doc('ERIKSSON', 'ANNA') })).toBe('mismatch');
  });
});

describe('editDistance', () => {
  it('counts insertions, deletions and substitutions', () => {
    expect(editDistance('SMITH', 'SMYTH')).toBe(1);
    expect(editDistance('KITTEN', 'SITTING')).toBe(3);
    expect(editDistance('', 'ABC')).toBe(3);
  });
});

describe('date of birth', () => {
  it('uses the Attend century, so 08 can be 2008 or 1908', () => {
    expect(matchDateOfBirth('080314', '2008-03-14')).toBe('match');
    expect(matchDateOfBirth('080314', '1908-03-14')).toBe('match');
    expect(resolveDateOfBirth('080314', '2008-03-14')).toBe('2008-03-14');
    expect(resolveDateOfBirth('080314', '1908-03-14')).toBe('1908-03-14');
  });

  it('is a mismatch when any part differs', () => {
    expect(matchDateOfBirth('080315', '2008-03-14')).toBe('mismatch');
    expect(matchDateOfBirth('090314', '2008-03-14')).toBe('mismatch');
  });

  it('is only partial when the MRZ has an unknown day or month', () => {
    expect(matchDateOfBirth('0803<<', '2008-03-14')).toBe('partial');
    expect(matchDateOfBirth('08<<<<', '2008-03-14')).toBe('partial');
    expect(matchDateOfBirth('0804<<', '2008-03-14')).toBe('mismatch');
    expect(resolveDateOfBirth('0803<<', '2008-03-14')).toBeNull();
  });

  it('is unknown when Attend has no date of birth', () => {
    expect(matchDateOfBirth('080314', undefined)).toBe('unknown');
  });
});

describe('isExpired', () => {
  const today = new Date(2026, 9, 28);

  it('is expired before today and valid from today on', () => {
    expect(isExpired('261027', today)).toBe(true);
    expect(isExpired('261028', today)).toBe(false);
    expect(isExpired('310101', today)).toBe(false);
  });

  it('treats an unreadable date as expired', () => {
    expect(isExpired('26<<<<', today)).toBe(true);
  });
});
