import { travelClock, travelDayTime } from '../travelTimes';

describe('travelClock', () => {
  it('splits the time from its period in the event timezone', () => {
    expect(travelClock('2026-11-14T03:15:00Z', 'Australia/Sydney')).toEqual({ time: '2:15', period: 'PM' });
    expect(travelClock('2026-11-14T09:05:00Z', 'UTC')).toEqual({ time: '9:05', period: 'AM' });
  });

  it('is null for a missing or bad timestamp', () => {
    expect(travelClock(undefined)).toBeNull();
    expect(travelClock('not a date')).toBeNull();
  });

  it('falls back to the device timezone for an unknown name', () => {
    expect(travelClock('2026-11-14T03:15:00Z', 'Nowhere/Special')).not.toBeNull();
  });
});

describe('travelDayTime', () => {
  it('reads "Sat 10:30 AM"', () => {
    expect(travelDayTime('2026-11-13T23:30:00Z', 'Australia/Sydney')).toBe('Sat 10:30 AM');
  });

  it('is null without a time', () => {
    expect(travelDayTime(null)).toBeNull();
  });
});
