import {
  inboundSummary,
  isCheckInLive,
  needsAttention,
  nextArrivals,
  overviewSectionOrder,
  recentScans,
  registrationBreakdown,
} from '../overview';
import type { Participant, ScanByContext, TravelCalendarEntry } from '../../types';

function person(id: string, overrides: Partial<Participant> = {}): Participant {
  return {
    participant_event_id: id,
    participant_id: id,
    display_name: id,
    full_name: id,
    status: 'complete',
    checked_in_at: null,
    high_support_flag: false,
    waiver_signed: true,
    scans_by_context: [],
    ...overrides,
  } as Participant;
}

function scan(name: string, checksIn: boolean, at: string, count = 1): ScanByContext {
  return {
    scan_context_id: name,
    scan_context_name: name,
    checks_in: checksIn,
    is_airport: false,
    scan_count: count,
    first_scanned_at: at,
    last_scanned_at: at,
  };
}

describe('isCheckInLive', () => {
  it('turns live on the first check-in scan, not on other contexts', () => {
    expect(isCheckInLive([person('a')])).toBe(false);
    expect(isCheckInLive([person('a', { scans_by_context: [scan('Dinner', false, '2026-11-09T01:00:00Z')] })])).toBe(false);
    expect(isCheckInLive([person('a', { scans_by_context: [scan('Check-in', true, '2026-11-09T01:00:00Z')] })])).toBe(true);
    expect(isCheckInLive([person('a', { checked_in_at: '2026-11-09T01:00:00Z' })])).toBe(true);
  });
});

describe('overviewSectionOrder', () => {
  it('keeps every section in both phases and only reorders', () => {
    const live = overviewSectionOrder(true);
    const prep = overviewSectionOrder(false);
    expect(live[0]).toBe('checkIn');
    expect(prep[0]).toBe('registration');
    expect(prep.slice(-2)).toEqual(['checkIn', 'arrivingNow']);
    expect([...live].sort()).toEqual([...prep].sort());
  });
});

describe('registrationBreakdown', () => {
  it('uses the dashboard split: complete, in progress, withdrawn', () => {
    expect(registrationBreakdown([
      person('a'),
      person('b', { status: 'in_progress' }),
      person('c', { status: 'awaiting_guardian' }),
      person('d', { status: 'withdrawn' }),
      person('e', { status: 'rejected' }),
    ])).toEqual({ total: 3, complete: 1, inProgress: 2, withdrawn: 1 });
  });
});

describe('needsAttention', () => {
  it('lists attending high-support participants and counts unsigned waivers', () => {
    const result = needsAttention([
      person('a', { high_support_flag: true }),
      person('b', { waiver_signed: false }),
      person('c', { high_support_flag: true, waiver_signed: false, status: 'withdrawn' }),
    ]);
    expect(result.highSupport.map((p) => p.participant_event_id)).toEqual(['a']);
    expect(result.waiversPending).toBe(1);
  });
});

describe('recentScans', () => {
  it('takes each person’s latest scan, newest first', () => {
    const feed = recentScans([
      person('a', { scans_by_context: [scan('Check-in', true, '2026-11-09T01:00:00Z'), scan('Dinner', false, '2026-11-09T08:00:00Z')] }),
      person('b', { scans_by_context: [scan('Check-in', true, '2026-11-09T02:00:00Z')] }),
      person('c', { scans_by_context: [scan('Check-in', true, '2026-11-09T03:00:00Z', 0)] }),
    ]);
    expect(feed.map((f) => [f.participant.participant_event_id, f.contextName])).toEqual([
      ['a', 'Dinner'],
      ['b', 'Check-in'],
    ]);
  });
});

function entry(id: string, overrides: Partial<TravelCalendarEntry> = {}): TravelCalendarEntry {
  return {
    id,
    participantId: id,
    participantEventId: id,
    participantName: id,
    direction: 'inbound',
    mode: 'plane',
    primaryTimeAt: '2026-11-14T03:15:00Z',
    reference: 'QF1402',
    route: 'Sydney → Canberra Airport',
    isUnaccompaniedMinor: false,
    groups: [],
    ...overrides,
  };
}

describe('nextArrivals', () => {
  const now = new Date('2026-11-14T00:00:00Z');

  it('groups people on the same service and skips past and outbound legs', () => {
    const groups = nextArrivals([
      entry('a'),
      entry('b', { participantPreferredName: 'Bee' }),
      entry('c', { mode: 'train', reference: null, primaryTimeAt: '2026-11-14T04:40:00Z', isUnaccompaniedMinor: true }),
      entry('d', { primaryTimeAt: '2026-11-13T23:00:00Z' }),
      entry('e', { direction: 'outbound' }),
      entry('f', { primaryTimeAt: null }),
    ], now);
    expect(groups.map((g) => [g.reference, g.people, g.unaccompaniedMinor])).toEqual([
      ['QF1402', ['a', 'Bee'], false],
      [null, ['c'], true],
    ]);
  });

  it('hides a redacted route', () => {
    expect(nextArrivals([entry('a', { routeRedacted: true })], now)[0].route).toBeNull();
  });
});

describe('inboundSummary', () => {
  it('counts inbound travellers, flyers and unaccompanied minors', () => {
    expect(inboundSummary([
      entry('a'),
      entry('b', { mode: 'train', isUnaccompaniedMinor: true }),
      entry('c', { direction: 'outbound' }),
    ])).toEqual({ travelling: 2, flying: 1, unaccompanied: 1 });
  });
});
