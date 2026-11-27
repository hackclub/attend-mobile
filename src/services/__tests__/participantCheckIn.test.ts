import { checkInContextName, checkInDetail, formatCheckInTime, participantDetailLine } from '../participantCheckIn';
import type { ScanByContext } from '../../types';

const scan = (overrides: Partial<ScanByContext>): ScanByContext => ({
  scan_context_id: 'ctx',
  scan_context_name: 'Check-in',
  checks_in: true,
  is_airport: false,
  scan_count: 1,
  ...overrides,
});

describe('participantCheckIn', () => {
  const now = new Date(2026, 10, 9, 15, 0);
  const todayIso = new Date(2026, 10, 9, 11, 20).toISOString();

  it('formats a check-in today as a time only, and another day with its weekday', () => {
    expect(formatCheckInTime(todayIso, now)).toBe(
      new Date(todayIso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    );
    const earlier = new Date(2026, 10, 7, 9, 5).toISOString();
    expect(formatCheckInTime(earlier, now)).toContain(
      new Date(earlier).toLocaleDateString(undefined, { weekday: 'short' }),
    );
    expect(formatCheckInTime('not a date', now)).toBe('');
  });

  it('names the earliest check-in context, ignoring contexts that do not check in', () => {
    expect(checkInContextName({})).toBeUndefined();
    expect(
      checkInContextName({
        scans_by_context: [
          scan({ scan_context_name: 'Lunch', checks_in: false, first_scanned_at: '2026-11-09T00:00:00Z' }),
          scan({ scan_context_name: 'Airport pickup', first_scanned_at: '2026-11-09T10:30:00Z' }),
          scan({ scan_context_name: 'Check-in', first_scanned_at: '2026-11-09T11:00:00Z' }),
        ],
      }),
    ).toBe('Airport pickup');
  });

  it('describes a checked-in participant by time and context', () => {
    const time = formatCheckInTime(todayIso, now);
    expect(checkInDetail({ checked_in_at: todayIso, scans_by_context: [scan({})] }, now)).toBe(`${time} · Check-in`);
    expect(checkInDetail({ checked_in_at: todayIso }, now)).toBe(time);
    expect(checkInDetail({ checked_in_at: null }, now)).toBeNull();
  });

  it('falls back to the registration status when not checked in', () => {
    expect(participantDetailLine({ status: 'complete' }, now)).toBe('Not here');
    expect(participantDetailLine({ status: 'awaiting_guardian' }, now)).toBe('Awaiting parent');
    expect(participantDetailLine({ status: 'withdrawn' }, now)).toBe('Withdrawn');
  });
});
