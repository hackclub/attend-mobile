import { computeEventStats, formatPercent } from '../eventStats';
import type { Participant, ScanByContext, ScanContext } from '../../types';

function participant(
  id: string,
  overrides: Partial<Participant> & { scans?: [string, number][] } = {}
): Participant {
  const { scans = [], ...rest } = overrides;
  return {
    participant_event_id: id,
    status: 'complete',
    checked_in_at: null,
    scans_by_context: scans.map(([contextId, count]): ScanByContext => ({
      scan_context_id: contextId,
      scan_context_name: contextId,
      checks_in: false,
      is_airport: false,
      scan_count: count,
    })),
    ...rest,
  } as Participant;
}

function context(id: string, position?: number, overrides: Partial<ScanContext> = {}): ScanContext {
  return { id, name: id, checks_in: false, is_airport: false, position, ...overrides };
}

describe('computeEventStats', () => {
  it('counts attending participants and who has checked in', () => {
    const stats = computeEventStats(
      [
        participant('a', { checked_in_at: '2026-10-31T09:00:00Z' }),
        participant('b'),
        participant('c', { checked_in_at: '2026-10-31T09:05:00Z' }),
        participant('d'),
      ],
      []
    );

    expect(stats.total).toBe(4);
    expect(stats.checkedIn).toBe(2);
    expect(stats.checkedInFraction).toBe(0.5);
  });

  it('leaves withdrawn and rejected registrations out of every count', () => {
    const stats = computeEventStats(
      [
        participant('a', { checked_in_at: '2026-10-31T09:00:00Z', scans: [['dinner', 1]] }),
        participant('b', { status: 'withdrawn', checked_in_at: '2026-10-31T09:00:00Z', scans: [['dinner', 1]] }),
        participant('c', { status: 'Rejected' }),
      ],
      [context('dinner')]
    );

    expect(stats.total).toBe(1);
    expect(stats.checkedIn).toBe(1);
    expect(stats.contexts[0]).toMatchObject({ scanned: 1, total: 1, fraction: 1 });
  });

  it('counts a participant once per context however many times they were scanned', () => {
    const stats = computeEventStats(
      [
        participant('a', { scans: [['dinner', 3], ['bus', 1]] }),
        participant('b', { scans: [['dinner', 1], ['bus', 0]] }),
        participant('c'),
        participant('d'),
      ],
      [context('dinner'), context('bus')]
    );

    expect(stats.contexts.map((c) => [c.id, c.scanned, c.fraction])).toEqual([
      ['dinner', 2, 0.5],
      ['bus', 1, 0.25],
    ]);
  });

  it('lists contexts in the event order, including ones nobody has been scanned into', () => {
    const stats = computeEventStats(
      [participant('a', { scans: [['late', 1]] })],
      [
        context('late', 3),
        context('doors', 1, { checks_in: true }),
        context('unplaced'),
        context('lunch', 2),
      ]
    );

    expect(stats.contexts.map((c) => c.id)).toEqual(['doors', 'lunch', 'late', 'unplaced']);
    expect(stats.contexts[0]).toMatchObject({ checksIn: true, scanned: 0, fraction: 0 });
  });

  it('reports zero rather than dividing by zero for an empty roster', () => {
    const stats = computeEventStats([], [context('doors')]);

    expect(stats.total).toBe(0);
    expect(stats.checkedInFraction).toBe(0);
    expect(stats.contexts[0].fraction).toBe(0);
  });
});

describe('formatPercent', () => {
  it.each([
    [0, '0%'],
    [0.004, '<1%'],
    [0.5, '50%'],
    [0.996, '99%'],
    [1, '100%'],
  ])('shows %p as %s', (fraction, expected) => {
    expect(formatPercent(fraction)).toBe(expected);
  });
});
