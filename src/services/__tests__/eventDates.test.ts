import { eventPhaseLabel, formatDateOnly, formatEventDateRange, isPastEvent } from '../eventDates';

const tz = 'Australia/Sydney';
// 9 Nov 2026, 10:00 in Sydney.
const now = new Date('2026-11-08T23:00:00Z');

describe('eventPhaseLabel', () => {
  it('counts days to go before the event', () => {
    const event = { starts_at: '2026-11-14T00:00:00+11:00', ends_at: '2026-11-15T17:00:00+11:00', timezone: tz };
    expect(eventPhaseLabel(event, now)).toBe('5 days away');
    expect(eventPhaseLabel(event, now, 'in')).toBe('In 5 days');
  });

  it('says tomorrow for the day before', () => {
    const event = { starts_at: '2026-11-10T09:00:00+11:00', timezone: tz };
    expect(eventPhaseLabel(event, now)).toBe('Tomorrow');
  });

  it('numbers the days while it runs, in the event timezone', () => {
    const event = { starts_at: '2026-11-08T09:00:00+11:00', ends_at: '2026-11-10T17:00:00+11:00', timezone: tz };
    expect(eventPhaseLabel(event, now)).toBe('Day 2 of 3');
  });

  it('says today for a one-day event and ended after it', () => {
    expect(eventPhaseLabel({ starts_at: '2026-11-09T18:00:00+11:00', timezone: tz }, now)).toBe('Today');
    expect(eventPhaseLabel({ starts_at: '2026-11-01T09:00:00+11:00', ends_at: '2026-11-02T09:00:00+11:00', timezone: tz }, now)).toBe('Ended');
  });

  it('has nothing to say without a start date', () => {
    expect(eventPhaseLabel({}, now)).toBeNull();
  });
});

describe('isPastEvent', () => {
  it('is past only once the last day is over', () => {
    expect(isPastEvent({ starts_at: '2026-11-07T09:00:00+11:00', ends_at: '2026-11-08T09:00:00+11:00', timezone: tz }, now)).toBe(true);
    expect(isPastEvent({ starts_at: '2026-11-08T09:00:00+11:00', ends_at: '2026-11-09T09:00:00+11:00', timezone: tz }, now)).toBe(false);
    expect(isPastEvent({}, now)).toBe(false);
  });
});

describe('formatEventDateRange', () => {
  it('shares the month when it can', () => {
    expect(formatEventDateRange({ starts_at: '2026-11-14T09:00:00+11:00', ends_at: '2026-11-15T17:00:00+11:00', timezone: tz }))
      .toBe('Sat 14 – Sun 15 Nov');
  });

  it('spells out both months across a month boundary', () => {
    expect(formatEventDateRange({ starts_at: '2026-10-31T09:00:00+11:00', ends_at: '2026-11-01T17:00:00+11:00', timezone: tz }))
      .toBe('Sat 31 Oct – Sun 1 Nov');
  });

  it('shows one day for a single-day event', () => {
    expect(formatEventDateRange({ starts_at: '2026-11-14T09:00:00+11:00', ends_at: '2026-11-14T17:00:00+11:00', timezone: tz }))
      .toBe('Sat 14 Nov');
  });
});

describe('formatDateOnly', () => {
  // Jest can't switch the zone mid-run, so this checks the local-day reading
  // directly; in any zone west of UTC, `new Date('2010-05-14')` would be the
  // 13th.
  it('formats the calendar day as a local date', () => {
    expect(formatDateOnly('2010-05-14')).toBe(new Date(2010, 4, 14).toLocaleDateString());
  });

  it('formats a full timestamp as a timestamp', () => {
    const value = '2026-11-14T09:00:00Z';
    expect(formatDateOnly(value)).toBe(new Date(value).toLocaleDateString());
  });

  it('shows an unparseable value as sent', () => {
    expect(formatDateOnly('sometime')).toBe('sometime');
  });
});
