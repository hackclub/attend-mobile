import {
  buildMrzKey,
  checkDigit,
  findMrz,
  isValidCan,
  parseMrz,
  parseNameField,
  validateManualAccess,
} from '../mrz';

// The specimen documents from ICAO 9303 parts 4 and 5.
const TD3 = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
];
const TD1 = [
  'I<UTOD231458907<<<<<<<<<<<<<<<',
  '7408122F1204159UTO<<<<<<<<<<<6',
  'ERIKSSON<<ANNA<MARIA<<<<<<<<<<',
];

function withDigit(line: string, index: number, digit: string): string {
  return line.slice(0, index) + digit + line.slice(index + 1);
}

describe('checkDigit', () => {
  it('matches the ICAO worked examples', () => {
    expect(checkDigit('L898902C3')).toBe(6);
    expect(checkDigit('740812')).toBe(2);
    expect(checkDigit('120415')).toBe(9);
    expect(checkDigit('D23145890')).toBe(7);
    expect(checkDigit('D23145890734')).toBe(9);
    expect(checkDigit('<<<<<<')).toBe(0);
  });

  it('refuses characters outside the MRZ alphabet', () => {
    expect(checkDigit('ab')).toBe(-1);
  });
});

describe('parseMrz', () => {
  it('parses a TD3 passport', () => {
    expect(parseMrz(TD3)).toEqual({
      format: 'TD3',
      documentCode: 'P',
      issuingState: 'UTO',
      documentNumber: 'L898902C3',
      dateOfBirth: '740812',
      dateOfExpiry: '120415',
      nationality: 'UTO',
      nameField: 'ERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
    });
  });

  it('parses a TD1 ID card', () => {
    expect(parseMrz(TD1)).toMatchObject({
      format: 'TD1',
      documentCode: 'I',
      issuingState: 'UTO',
      documentNumber: 'D23145890',
      dateOfBirth: '740812',
      dateOfExpiry: '120415',
      nationality: 'UTO',
      nameField: 'ERIKSSON<<ANNA<MARIA<<<<<<<<<<',
    });
  });

  it('reads a TD1 document number that overflows into the optional data', () => {
    const line1 = 'I<UTOD23145890<7349<<<<<<<<<<<';
    const line2Body = '7408122F1204159UTO<<<<<<<<<<<';
    const composite = line1.slice(5, 30) + line2Body.slice(0, 7) + line2Body.slice(8, 15) + line2Body.slice(18, 29);
    const parsed = parseMrz([line1, line2Body + checkDigit(composite), TD1[2]]);
    expect(parsed?.documentNumber).toBe('D23145890734');
  });

  it('tolerates spaces and lower case from text recognition', () => {
    expect(parseMrz(TD3.map((line) => ` ${line.slice(0, 20).toLowerCase()} ${line.slice(20)}`))?.documentNumber)
      .toBe('L898902C3');
  });

  it.each([
    ['document number', 9],
    ['date of birth', 19],
    ['expiry', 27],
    ['composite', 43],
  ])('rejects a TD3 with a bad %s check digit', (_name, index) => {
    const wrong = TD3[1][index] === '0' ? '1' : '0';
    expect(parseMrz([TD3[0], withDigit(TD3[1], index, wrong)])).toBeNull();
  });

  it('rejects a TD1 with a bad check digit', () => {
    expect(parseMrz([withDigit(TD1[0], 14, '1'), TD1[1], TD1[2]])).toBeNull();
    expect(parseMrz([TD1[0], withDigit(TD1[1], 29, '1'), TD1[2]])).toBeNull();
  });

  it('rejects incomplete or malformed input', () => {
    expect(parseMrz([TD3[0]])).toBeNull();
    expect(parseMrz([TD3[0], TD3[1].slice(0, 40)])).toBeNull();
    expect(parseMrz([TD3[0], TD3[1].replace('<', '#')])).toBeNull();
  });
});

describe('findMrz', () => {
  it('finds the MRZ among the other text on the page', () => {
    const page = ['PASSPORT', 'UTOPIA', 'ERIKSSON', 'ANNA MARIA', ...TD3];
    expect(findMrz(page)?.documentNumber).toBe('L898902C3');
  });

  it('finds a TD1 MRZ', () => {
    expect(findMrz(['IDENTITY CARD', ...TD1])?.format).toBe('TD1');
  });

  it('returns null until the whole MRZ has been read correctly', () => {
    expect(findMrz([TD3[0], withDigit(TD3[1], 43, '1')])).toBeNull();
  });
});

describe('parseNameField', () => {
  it('splits surname and given names', () => {
    expect(parseNameField('ERIKSSON<<ANNA<MARIA<<<<<<<<<<')).toEqual({
      surname: 'ERIKSSON',
      givenNames: 'ANNA MARIA',
      truncated: false,
    });
  });

  it('keeps multi-part surnames', () => {
    expect(parseNameField('VAN<DER<BERG<<JAN<<<<<').surname).toBe('VAN DER BERG');
  });

  it('flags a name cut short to fit the line', () => {
    expect(parseNameField('SMITH<<JOHN<ALEXANDER<CHRISTOPH').truncated).toBe(true);
  });
});

describe('manual entry', () => {
  it('accepts valid fields', () => {
    expect(validateManualAccess({ documentNumber: 'l898902c3', dateOfBirth: '740812', dateOfExpiry: '120415' })).toBeNull();
  });

  it('rejects bad dates and document numbers', () => {
    expect(validateManualAccess({ documentNumber: '', dateOfBirth: '740812', dateOfExpiry: '120415' })).toMatch(/document number/);
    expect(validateManualAccess({ documentNumber: 'L898902C3', dateOfBirth: '741312', dateOfExpiry: '120415' })).toMatch(/date of birth/);
    expect(validateManualAccess({ documentNumber: 'L898902C3', dateOfBirth: '740812', dateOfExpiry: '1204' })).toMatch(/expiry/);
  });

  it('validates a CAN', () => {
    expect(isValidCan('123456')).toBe(true);
    expect(isValidCan('12345')).toBe(false);
    expect(isValidCan('12345a')).toBe(false);
  });
});

describe('buildMrzKey', () => {
  it('builds the ICAO 9303 part 11 key seed', () => {
    expect(buildMrzKey({ documentNumber: 'L898902C<', dateOfBirth: '690806', dateOfExpiry: '940623' }))
      .toBe('L898902C<369080619406236');
  });

  it('pads a short document number with filler', () => {
    expect(buildMrzKey({ documentNumber: 'l898902c', dateOfBirth: '690806', dateOfExpiry: '940623' }))
      .toBe('L898902C<369080619406236');
  });
});
