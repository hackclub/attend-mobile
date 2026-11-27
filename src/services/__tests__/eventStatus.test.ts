import { eventStatus, formatEventMoment } from '../eventStatus';

const tz = 'Australia/Sydney';
// 9 Nov 2026, 10:00 in Sydney.
const now = new Date('2026-11-08T23:00:00Z');

describe('eventStatus', () => {
  it('counts days to go before the event', () => {
    const event = { starts_at: '2026-11-14T09:00:00+11:00', ends_at: '2026-11-15T17:00:00+11:00', timezone: tz };
    expect(eventStatus(event, { now })).toEqual({
      phase: 'upcoming',
      title: 'Upcoming',
      headline: 'Starts in 5 days',
    });
  });

  it('gives the start time for tomorrow and later today', () => {
    expect(eventStatus({ starts_at: '2026-11-10T09:30:00+11:00', timezone: tz }, { now })?.headline).toBe(
      'Starts tomorrow at 9:30 AM'
    );
    expect(eventStatus({ starts_at: '2026-11-09T18:00:00+11:00', timezone: tz }, { now })?.headline).toBe(
      'Starts today at 6:00 PM'
    );
  });

  it('counts days by the event timezone, not the device', () => {
    // 10:00 on 9 Nov in Sydney is still 8 Nov in Los Angeles.
    const event = { starts_at: '2026-11-10T09:00:00-08:00', timezone: 'America/Los_Angeles' };
    expect(eventStatus(event, { now })?.headline).toBe('Starts in 2 days');
  });

  it('numbers the days while a multi-day event runs', () => {
    const event = { starts_at: '2026-11-08T09:00:00+11:00', ends_at: '2026-11-10T17:00:00+11:00', timezone: tz };
    expect(eventStatus(event, { now })).toEqual({ phase: 'live', title: 'Happening now', headline: 'Day 2 of 3' });
  });

  it('gives the end time while a one-day event runs', () => {
    const event = { starts_at: '2026-11-09T09:00:00+11:00', ends_at: '2026-11-09T17:00:00+11:00', timezone: tz };
    expect(eventStatus(event, { now })?.headline).toBe('Until 5:00 PM');
    expect(eventStatus({ starts_at: '2026-11-09T09:00:00+11:00', timezone: tz }, { now })?.phase).toBe('live');
  });

  it('thanks an attendee who came once it has ended', () => {
    const event = { starts_at: '2026-11-08T09:00:00+11:00', ends_at: '2026-11-09T08:00:00+11:00', timezone: tz };
    expect(eventStatus(event, { now, checkedIn: true })).toEqual({
      phase: 'ended',
      title: 'Event ended',
      headline: 'Thanks for coming!',
    });
    expect(eventStatus(event, { now })?.headline).toBe('This event has finished.');
  });

  it('ends an event without an end time after its start day', () => {
    expect(eventStatus({ starts_at: '2026-11-08T09:00:00+11:00', timezone: tz }, { now })?.phase).toBe('ended');
  });

  it('has nothing to say without a start date', () => {
    expect(eventStatus({}, { now })).toBeNull();
    expect(eventStatus({ starts_at: 'not a date' }, { now })).toBeNull();
  });
});

describe('formatEventMoment', () => {
  it('formats in the event timezone', () => {
    expect(formatEventMoment('2026-07-10T17:00:00Z', tz)).toBe('Sat 11 Jul, 3:00 AM');
    expect(formatEventMoment('2026-07-12T15:00:00Z', tz)).toBe('Mon 13 Jul, 1:00 AM');
  });

  it('falls back to the device zone for an unknown one, and null for no date', () => {
    expect(formatEventMoment('2026-07-10T17:00:00Z', 'Not/AZone')).toMatch(/Jul, \d{1,2}:00 [AP]M$/);
    expect(formatEventMoment(undefined, tz)).toBeNull();
  });
});
