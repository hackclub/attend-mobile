import { buildIdCheckPayload, verdict, verdictReasons, type VerdictInput } from '../verdict';

const green: VerdictInput = {
  checks: {
    dataIntegrity: 'valid',
    issuer: 'valid',
    activeAuth: 'passed',
    chipAuth: 'unsupported',
    accessProtocol: 'PACE',
  },
  nameMatch: 'exact',
  dobMatch: 'match',
  expired: false,
};

function withChecks(checks: Partial<VerdictInput['checks']>, rest: Partial<VerdictInput> = {}): VerdictInput {
  return { ...green, ...rest, checks: { ...green.checks, ...checks } };
}

describe('verdict', () => {
  it('is green when everything passes', () => {
    expect(verdict(green)).toBe('green');
    expect(verdict(withChecks({ activeAuth: 'unsupported', chipAuth: 'passed' }))).toBe('green');
    expect(verdictReasons(green)).toEqual([]);
  });

  describe('amber', () => {
    it.each<[string, VerdictInput]>([
      ['the issuer is not in the trust list', withChecks({ issuer: 'unknown_issuer' })],
      ['the name is fuzzy', withChecks({}, { nameMatch: 'fuzzy' })],
      ['neither active nor chip auth is supported', withChecks({ activeAuth: 'unsupported', chipAuth: 'unsupported' })],
      ['the MRZ date of birth is incomplete', withChecks({}, { dobMatch: 'partial' })],
      ['Attend has no date of birth', withChecks({}, { dobMatch: 'unknown' })],
    ])('when %s', (_name, input) => {
      expect(verdict(input)).toBe('amber');
      expect(verdictReasons(input)).toHaveLength(1);
    });
  });

  describe('red', () => {
    it.each<[string, VerdictInput]>([
      ['data integrity is invalid', withChecks({ dataIntegrity: 'invalid' })],
      ['the issuer signature is invalid', withChecks({ issuer: 'invalid' })],
      ['active auth failed', withChecks({ activeAuth: 'failed' })],
      ['chip auth failed', withChecks({ chipAuth: 'failed', activeAuth: 'passed' })],
      ['the date of birth does not match', withChecks({}, { dobMatch: 'mismatch' })],
      ['the name does not match', withChecks({}, { nameMatch: 'mismatch' })],
      ['the document has expired', withChecks({}, { expired: true })],
    ])('when %s', (_name, input) => {
      expect(verdict(input)).toBe('red');
    });

    it('wins over anything amber', () => {
      expect(verdict(withChecks({ issuer: 'unknown_issuer' }, { expired: true }))).toBe('red');
    });
  });
});

describe('buildIdCheckPayload', () => {
  it('sends only the outcome fields the server accepts', () => {
    const payload = buildIdCheckPayload({
      decision: 'confirmed',
      result: 'green',
      documentType: 'P',
      issuingState: 'GBR',
      input: green,
    });

    expect(payload).toEqual({
      verdict: 'confirmed',
      result: 'green',
      document_type: 'P',
      issuing_state: 'GBR',
      data_integrity: 'valid',
      issuer: 'valid',
      active_auth: 'passed',
      chip_auth: 'unsupported',
      access_protocol: 'PACE',
      name_match: 'exact',
      dob_match: true,
      expired: false,
    });
  });

  it('reports a partial date of birth as matching and an unknown one as not', () => {
    const build = (dobMatch: VerdictInput['dobMatch']) =>
      buildIdCheckPayload({ decision: 'rejected', result: 'amber', documentType: 'I', issuingState: 'D', input: { ...green, dobMatch } }).dob_match;
    expect(build('partial')).toBe(true);
    expect(build('unknown')).toBe(false);
    expect(build('mismatch')).toBe(false);
  });
});
