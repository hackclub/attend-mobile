import * as ed from '@noble/ed25519';
import { decodeSignedTicket, verifySignedTicket, type CheckinCodeMaterial } from '../signedTicket';

// Signed by Attend's CheckinCode with a throwaway Ed25519 key (id 7) that was
// never saved, so these prove the app accepts exactly what the server issues.
// The ids are made up.
const PUBLIC_KEY = 'MCowBQYDK2VwAyEAGchMcKXWwzxP8HJkqAHOl/UdURUuiTiDrRYThU3C/C4=';
const EVENT_ID = '11111111-2222-4333-8444-555555555555';
const REGISTRATION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SIGNED_TICKET = 'T.AED2VKVKVK53WTGMRXO653XO53XO5HPUK4QUBYFELZIGTDENX5RFTTSBZU5ID4G2WZSCHBOW5WJWKWDSUVALI67EDO6QB4FZVHUVRMD3LTS4QG2RPIM7IRHJVY5VHN2WYUBA';
const SIGNED_FOR_OTHER_EVENT = 'T.AED2VKVKVK53WTGMRXO653XO53XO4M2NIAELHHNEDVPA7JOCBWEYR4AJVRUVXSUYFZG7EFHOJOCZPGLUCGY2UAJ6B5POTOCMFOEFVZXJXEJY3NRZNP76CVPOCM2MR2W4RQCQ';

const material = (overrides: Partial<CheckinCodeMaterial> = {}): CheckinCodeMaterial => ({
  signing: true,
  keys: { 7: PUBLIC_KEY },
  cancelled: [],
  ...overrides,
});

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(bytes: Uint8Array): string {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  bits += '0'.repeat((5 - (bits.length % 5)) % 5);
  return (bits.match(/.{5}/g) ?? []).map(chunk => BASE32[parseInt(chunk, 2)]).join('');
}

function ticketBytes(token: string): Uint8Array {
  const ticket = decodeSignedTicket(token);
  if (!ticket) throw new Error('bad vector');
  return new Uint8Array([...ticket.code, ...ticket.signature]);
}

function tampered(index: number): string {
  const bytes = ticketBytes(SIGNED_TICKET);
  bytes[index] ^= 0x01;
  return `T.${base32(bytes)}`;
}

describe('decodeSignedTicket', () => {
  it('reads the key and registration off a signed ticket', () => {
    expect(decodeSignedTicket(SIGNED_TICKET)).toMatchObject({ keyId: '7', registrationId: REGISTRATION_ID });
  });

  it.each(['T.', `T.${'A'.repeat(20)}`, `T.${'1'.repeat(132)}`, `T.${base32(new Uint8Array(82).fill(2))}`])(
    'rejects a malformed one: %s',
    token => {
      expect(decodeSignedTicket(token)).toBeNull();
    }
  );
});

describe('verifySignedTicket', () => {
  const verify = (token: string, overrides: Partial<CheckinCodeMaterial> = {}, eventId = EVENT_ID) =>
    verifySignedTicket(decodeSignedTicket(token) ?? undefined, eventId, material(overrides));

  it('accepts a ticket Attend signed for this event', () => {
    expect(verify(SIGNED_TICKET)).toEqual({ verdict: 'valid', registrationId: REGISTRATION_ID });
  });

  it('turns away a ticket signed for another event', () => {
    expect(verify(SIGNED_FOR_OTHER_EVENT)).toEqual({ verdict: 'invalid' });
  });

  it.each([2, 10, 17, 18, 50, 81])('turns away a ticket edited after signing (byte %i)', index => {
    expect(verify(tampered(index))).toEqual({ verdict: 'invalid' });
  });

  it("turns away a ticket signed with a key that isn't Attend's", () => {
    const secretKey = ed.utils.randomSecretKey();
    const code = ticketBytes(SIGNED_TICKET).slice(0, 18);
    const event = Uint8Array.from(EVENT_ID.replace(/-/g, '').match(/../g) ?? [], pair => parseInt(pair, 16));
    const message = new Uint8Array([...code.subarray(0, 2), ...event, ...code.subarray(2)]);
    const forged = `T.${base32(new Uint8Array([...code, ...ed.sign(message, secretKey)]))}`;

    expect(verify(forged)).toEqual({ verdict: 'invalid' });
  });

  it('flags a genuine ticket whose registration was withdrawn or rejected', () => {
    expect(verify(SIGNED_TICKET, { cancelled: [REGISTRATION_ID.toUpperCase()] }))
      .toEqual({ verdict: 'cancelled', registrationId: REGISTRATION_ID });
  });

  it("leaves what it can't check to the server", () => {
    expect(verifySignedTicket(undefined, EVENT_ID, material())).toEqual({ verdict: 'unverified' });
    expect(verifySignedTicket(decodeSignedTicket(SIGNED_TICKET) ?? undefined, EVENT_ID, null)).toEqual({ verdict: 'unverified' });
    // A key this device wasn't given, as after a key change.
    expect(verify(SIGNED_TICKET, { keys: {} })).toEqual({ verdict: 'unverified' });
    expect(verify(SIGNED_TICKET, { keys: { 7: 'not-a-key' } })).toEqual({ verdict: 'unverified' });
  });
});
