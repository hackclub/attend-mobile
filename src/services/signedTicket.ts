import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Hermes has no WebCrypto, so the signature check runs on noble's pure-JS
// SHA-512 through the synchronous path.
ed.hashes.sha512 = sha512;

// A signed ticket from Attend (app/lib/checkin_code.rb there) is
// `ATTEND://CHECKIN/T.<base32>`, decoding to
//
//   version (1) | key id (1) | participant_event id (16) | signature (64)
//
// with an Ed25519 signature over
//
//   version (1) | key id (1) | event id (16) | participant_event id (16)
//
// The event id isn't in the code: the scanner supplies the event it's
// scanning for, so a ticket for another event fails the signature exactly
// like a forged one.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const VERSION = 1;
const CODE_BYTES = 18;
const SIGNATURE_BYTES = 64;
// DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw key is what follows.
const SPKI_PREFIX = [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00];

export interface SignedTicket {
  keyId: string;
  registrationId: string;
  code: Uint8Array;
  signature: Uint8Array;
}

// What the device could tell about a code on its own. Online the server's
// answer is what counts; offline this is all staff have to go on.
export type TicketVerdict =
  | { verdict: 'valid'; registrationId: string }
  | { verdict: 'cancelled'; registrationId: string }
  | { verdict: 'invalid' }
  | { verdict: 'unverified' };

// From Attend's GET /api/v1/events/:id/checkin_codes.
export interface CheckinCodeMaterial {
  signing: boolean;
  keys: Record<string, string>;
  cancelled: string[];
}

function base32Decode(text: string): Uint8Array | null {
  if (!/^[A-Z2-7]+$/.test(text)) return null;
  let bits = '';
  for (const char of text) bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return bytes;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Decode(text: string): Uint8Array | null {
  const clean = text.replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean)) return null;
  let bits = '';
  for (const char of clean) bits += BASE64.indexOf(char).toString(2).padStart(6, '0');
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return bytes;
}

function uuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uuidBytes(id: string): Uint8Array | null {
  const hex = id.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g) ?? [], pair => parseInt(pair, 16));
}

// `token` is the `T.…` part, uppercase. Null when it isn't a well-formed
// signed ticket.
export function decodeSignedTicket(token: string): SignedTicket | null {
  const bytes = base32Decode(token.slice(2));
  if (!bytes || bytes.length !== CODE_BYTES + SIGNATURE_BYTES || bytes[0] !== VERSION) return null;

  return {
    keyId: String(bytes[1]),
    registrationId: uuid(bytes.subarray(2, 18)),
    code: bytes.slice(0, CODE_BYTES),
    signature: bytes.slice(CODE_BYTES),
  };
}

function rawPublicKey(spkiBase64: string): Uint8Array | null {
  const der = base64Decode(spkiBase64);
  if (!der || der.length !== SPKI_PREFIX.length + 32) return null;
  if (!SPKI_PREFIX.every((byte, i) => der[i] === byte)) return null;
  return der.slice(SPKI_PREFIX.length);
}

// An unsigned code, a key this device wasn't given (a key change since it last
// synced), or no material yet are all "unverified": the server checks those.
export function verifySignedTicket(
  ticket: SignedTicket | undefined,
  eventId: string,
  material: CheckinCodeMaterial | null
): TicketVerdict {
  if (!ticket || !material) return { verdict: 'unverified' };
  const key = material.keys[ticket.keyId] ? rawPublicKey(material.keys[ticket.keyId]) : null;
  const event = uuidBytes(eventId);
  if (!key || !event) return { verdict: 'unverified' };

  const message = new Uint8Array(2 + 16 + 16);
  message.set(ticket.code.subarray(0, 2), 0);
  message.set(event, 2);
  message.set(ticket.code.subarray(2), 18);

  let genuine = false;
  try {
    // RFC 8032's strict rules, as OpenSSL signs and checks them.
    genuine = ed.verify(ticket.signature, message, key, { zip215: false });
  } catch (error) {
    console.warn('[Tickets] Could not check a signature:', error);
    return { verdict: 'unverified' };
  }
  if (!genuine) return { verdict: 'invalid' };

  const cancelled = material.cancelled.some(id => id.toLowerCase() === ticket.registrationId);
  return cancelled
    ? { verdict: 'cancelled', registrationId: ticket.registrationId }
    : { verdict: 'valid', registrationId: ticket.registrationId };
}
