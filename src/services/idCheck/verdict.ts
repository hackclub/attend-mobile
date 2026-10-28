import type { NativeChecks } from '../../../modules/mrtd-reader/src';
import type { DobMatch, NameMatch } from './match';

export type CheckResult = 'green' | 'amber' | 'red';
export type Decision = 'confirmed' | 'rejected';

export type ChipChecks = NativeChecks;

export interface VerdictInput {
  checks: ChipChecks;
  nameMatch: NameMatch;
  dobMatch: DobMatch;
  expired: boolean;
}

// The reasons a result isn't green, in the order the screen lists them.
export function verdictReasons(input: VerdictInput): string[] {
  const { checks } = input;
  const reasons: string[] = [];
  if (checks.dataIntegrity === 'invalid') reasons.push('Chip data does not match its signature');
  if (checks.issuer === 'invalid') reasons.push('Document signature is not valid');
  if (checks.issuer === 'unknown_issuer') reasons.push('Issuing country is not in the trust list');
  if (checks.activeAuth === 'failed') reasons.push('Active authentication failed (possible cloned chip)');
  if (checks.chipAuth === 'failed') reasons.push('Chip authentication failed (possible cloned chip)');
  if (checks.activeAuth === 'unsupported' && checks.chipAuth === 'unsupported') {
    reasons.push('Chip does not support clone detection');
  }
  if (input.nameMatch === 'mismatch') reasons.push('Name does not match the Attend record');
  if (input.nameMatch === 'fuzzy') reasons.push('Name is a close but not exact match');
  if (input.dobMatch === 'mismatch') reasons.push('Date of birth does not match the Attend record');
  if (input.dobMatch === 'partial') reasons.push('Document date of birth is incomplete');
  if (input.dobMatch === 'unknown') reasons.push('No date of birth on the Attend record');
  if (input.expired) reasons.push('Document has expired');
  return reasons;
}

export function verdict(input: VerdictInput): CheckResult {
  const { checks } = input;

  if (
    checks.dataIntegrity === 'invalid' ||
    checks.issuer === 'invalid' ||
    checks.activeAuth === 'failed' ||
    checks.chipAuth === 'failed' ||
    input.dobMatch === 'mismatch' ||
    input.nameMatch === 'mismatch' ||
    input.expired
  ) {
    return 'red';
  }

  if (
    checks.issuer === 'valid' &&
    (checks.activeAuth === 'passed' || checks.chipAuth === 'passed') &&
    input.nameMatch === 'exact' &&
    input.dobMatch === 'match'
  ) {
    return 'green';
  }

  return 'amber';
}

// Exactly what POST .../id_checks accepts. Built field by field from the
// outcome so nothing read from the document (number, names, dates, photo) can
// end up in the request.
export interface IdCheckPayload {
  verdict: Decision;
  result: CheckResult;
  document_type: string;
  issuing_state: string;
  data_integrity: ChipChecks['dataIntegrity'];
  issuer: ChipChecks['issuer'];
  active_auth: ChipChecks['activeAuth'];
  chip_auth: ChipChecks['chipAuth'];
  access_protocol: ChipChecks['accessProtocol'];
  name_match: NameMatch;
  dob_match: boolean;
  expired: boolean;
}

export function buildIdCheckPayload(args: {
  decision: Decision;
  result: CheckResult;
  documentType: string;
  issuingState: string;
  input: VerdictInput;
}): IdCheckPayload {
  const { checks } = args.input;
  return {
    verdict: args.decision,
    result: args.result,
    document_type: args.documentType,
    issuing_state: args.issuingState,
    data_integrity: checks.dataIntegrity,
    issuer: checks.issuer,
    active_auth: checks.activeAuth,
    chip_auth: checks.chipAuth,
    access_protocol: checks.accessProtocol,
    name_match: args.input.nameMatch,
    dob_match: args.input.dobMatch === 'match' || args.input.dobMatch === 'partial',
    expired: args.input.expired,
  };
}
