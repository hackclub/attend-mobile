import { activeParticipants, isWithdrawn } from './participantStatus';
import type { Participant, TravelCalendarEntry } from '../types';

// The event Overview's figures, all derived from data the app already has:
// the synced (slim) roster and the travel calendar.

export type OverviewSection =
  | 'checkIn'
  | 'attention'
  | 'arrivals'
  | 'actions'
  | 'registration'
  | 'arrivingNow';

/** Check-in has started once anyone has a check-in scan. Never from dates. */
export function isCheckInLive(participants: Participant[]): boolean {
  return participants.some(
    (p) => !!p.checked_in_at
      || (p.scans_by_context ?? []).some((scan) => scan.checks_in && scan.scan_count > 0)
  );
}

const LIVE_ORDER: OverviewSection[] = [
  'checkIn',
  'attention',
  'arrivals',
  'actions',
  'registration',
  'arrivingNow',
];

// Before check-in the registration picture leads, and check-in and the
// arrivals feed drop to the end as one-line placeholders.
const PREP_ORDER: OverviewSection[] = [
  'registration',
  'attention',
  'arrivals',
  'actions',
  'checkIn',
  'arrivingNow',
];

/** Every section, in the order for the phase: nothing is hidden, only moved. */
export function overviewSectionOrder(live: boolean): OverviewSection[] {
  return live ? LIVE_ORDER : PREP_ORDER;
}

export interface RegistrationBreakdown {
  /** Attending: everyone but withdrawn and rejected. */
  total: number;
  complete: number;
  inProgress: number;
  withdrawn: number;
}

/** The web dashboard's "Total participants · N complete · N in progress". */
export function registrationBreakdown(participants: Participant[]): RegistrationBreakdown {
  const active = activeParticipants(participants);
  const complete = active.filter((p) => p.status?.toLowerCase() === 'complete').length;
  return {
    total: active.length,
    complete,
    inProgress: active.length - complete,
    withdrawn: participants.filter(isWithdrawn).length,
  };
}

export interface NeedsAttention {
  highSupport: Participant[];
  waiversPending: number;
}

export function needsAttention(participants: Participant[]): NeedsAttention {
  const active = activeParticipants(participants);
  return {
    highSupport: active.filter((p) => p.high_support_flag === true),
    // Only an explicit false counts: a record without the field isn't pending.
    waiversPending: active.filter((p) => p.waiver_signed === false).length,
  };
}

export interface RecentScan {
  participant: Participant;
  contextName: string;
  scannedAt: string;
}

/**
 * The latest scans, newest first: each participant's most recent scan in any
 * context, from the roster's per-context history.
 */
export function recentScans(participants: Participant[], limit = 5): RecentScan[] {
  const latest: RecentScan[] = [];
  for (const participant of activeParticipants(participants)) {
    let best: RecentScan | null = null;
    for (const scan of participant.scans_by_context ?? []) {
      const at = scan.last_scanned_at ?? scan.first_scanned_at;
      if (!at || scan.scan_count <= 0) continue;
      if (!best || at > best.scannedAt) {
        best = { participant, contextName: scan.scan_context_name, scannedAt: at };
      }
    }
    if (!best && participant.checked_in_at) {
      best = { participant, contextName: 'Check-in', scannedAt: participant.checked_in_at };
    }
    if (best) latest.push(best);
  }
  return latest
    .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
    .slice(0, limit);
}

export interface ArrivalGroup {
  key: string;
  at: string;
  mode: TravelCalendarEntry['mode'];
  reference: string | null;
  route: string | null;
  people: string[];
  unaccompaniedMinor: boolean;
}

const personName = (entry: TravelCalendarEntry) =>
  entry.participantPreferredName || entry.participantName;

/**
 * Upcoming inbound arrivals from the travel calendar, soonest first, with
 * people on the same service at the same time grouped together.
 */
export function nextArrivals(entries: TravelCalendarEntry[], now = new Date(), limit = 3): ArrivalGroup[] {
  const groups = new Map<string, ArrivalGroup>();
  for (const entry of entries) {
    if (entry.direction !== 'inbound' || !entry.primaryTimeAt) continue;
    const at = new Date(entry.primaryTimeAt);
    if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime()) continue;
    const key = `${entry.primaryTimeAt}|${entry.mode}|${entry.reference ?? entry.id}`;
    const group = groups.get(key);
    if (group) {
      group.people.push(personName(entry));
      group.unaccompaniedMinor ||= entry.isUnaccompaniedMinor;
    } else {
      groups.set(key, {
        key,
        at: entry.primaryTimeAt,
        mode: entry.mode,
        reference: entry.reference ?? null,
        route: entry.routeRedacted ? null : entry.route ?? null,
        people: [personName(entry)],
        unaccompaniedMinor: entry.isUnaccompaniedMinor,
      });
    }
  }
  return [...groups.values()]
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(0, limit);
}

export interface InboundSummary {
  travelling: number;
  flying: number;
  unaccompanied: number;
}

export function inboundSummary(entries: TravelCalendarEntry[]): InboundSummary {
  const inbound = entries.filter((entry) => entry.direction === 'inbound');
  return {
    travelling: inbound.length,
    flying: inbound.filter((entry) => entry.mode === 'plane').length,
    unaccompanied: inbound.filter((entry) => entry.isUnaccompaniedMinor).length,
  };
}
