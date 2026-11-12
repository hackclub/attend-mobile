import { sha256Hex } from './sha256';
import type { Participant, Travel } from '../types';

/**
 * What the offline roster keeps of a participant.
 *
 * The roster sits in plain AsyncStorage, so it holds only what scanning, the
 * People list, search, filters and the scan card read: identity, status, scan
 * history and the safety flags shown as badges. Medical and dietary free text,
 * guardians, emergency contacts, addresses, notes and the other detail
 * sections are dropped; the detail screen fetches those online.
 *
 * The NFC badge token works like a password for check-in, so it is never
 * stored: only its SHA-256 (nfc_badge_token_sha256), which offline NFC scans
 * are matched against (see ParticipantIndex.findByNfcToken).
 *
 * Bump PARTICIPANT_CACHE_VERSION whenever this list shrinks, so caches written
 * by an older build are re-slimmed on upgrade.
 */
export const PARTICIPANT_CACHE_VERSION = 3;

/** A cached participant: the raw badge token replaced by its hash. */
export type CachedParticipant = Participant & { nfc_badge_token_sha256?: string };

export function hashNfcBadgeToken(token: string): string {
  return sha256Hex(token);
}

export const CACHED_PARTICIPANT_FIELDS = [
  'participant_id',
  'participant_event_id',
  'display_name',
  'full_name',
  'email',
  'pronouns',
  'headshot_url',
  'status',
  'checked_in_at',
  'has_anaphylaxis_risk',
  'requires_refrigeration',
  'cross_contamination_risk',
  'high_support_flag',
  'can_leave_unaccompanied',
  'freedom_waiver_granted',
  'waiver_signed',
  'diet_type',
  'scans_by_context',
  'nfc_badge_assigned',
  'updated_at',
] as const satisfies readonly (keyof Participant)[];

// The travel filters (mode, visa status, unaccompanied minor, has travel) only
// need these; routes, addresses, stations, flight numbers and notes are not
// cached.
function slimTravel(travel: Travel | undefined): Travel | undefined {
  if (!travel) return undefined;
  const slim: Travel = {
    id: travel.id,
    direction: travel.direction,
    is_unaccompanied_minor: travel.is_unaccompanied_minor,
    legs: [],
  };
  if (travel.mode !== undefined) slim.mode = travel.mode;
  if (travel.visa_status !== undefined) slim.visa_status = travel.visa_status;
  return slim;
}

export function slimParticipant(participant: Participant): Participant {
  const slim: Record<string, unknown> = {};
  for (const field of CACHED_PARTICIPANT_FIELDS) {
    const value = participant[field];
    if (value !== undefined) slim[field] = value;
  }
  // A raw token (fresh from the server) is hashed; null means the badge was
  // unassigned. Without either, keep the hash an earlier write stored.
  const raw = (participant as { nfc_badge_token?: string | null }).nfc_badge_token;
  const storedHash = (participant as CachedParticipant).nfc_badge_token_sha256;
  if (typeof raw === 'string' && raw) {
    slim.nfc_badge_token_sha256 = hashNfcBadgeToken(raw);
  } else if (raw === undefined && storedHash) {
    slim.nfc_badge_token_sha256 = storedHash;
  }
  const inbound = slimTravel(participant.travel_inbound);
  const outbound = slimTravel(participant.travel_outbound);
  if (inbound) slim.travel_inbound = inbound;
  if (outbound) slim.travel_outbound = outbound;
  return slim as unknown as Participant;
}

export function slimParticipants(participants: Participant[]): Participant[] {
  return participants.map(slimParticipant);
}
