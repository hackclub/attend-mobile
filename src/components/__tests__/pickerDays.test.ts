import { fromPickerDay, prefers24Hour, toPickerDay } from '../pickerDays';

describe('pickerDays', () => {
  it('hands the picker the local day as UTC midnight', () => {
    // Late in the evening, local time: the UTC day may already be the next.
    const local = new Date(2026, 10, 9, 23, 30);
    const day = toPickerDay(local);
    expect(day.getUTCFullYear()).toBe(2026);
    expect(day.getUTCMonth()).toBe(10);
    expect(day.getUTCDate()).toBe(9);
    expect(day.getUTCHours()).toBe(0);
  });

  it('reads the picked day back as a local date with the old time', () => {
    const picked = new Date(Date.UTC(2026, 11, 24));
    const result = fromPickerDay(picked, new Date(2026, 10, 9, 18, 45, 12));
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 11, 24]);
    expect([result.getHours(), result.getMinutes(), result.getSeconds()]).toEqual([18, 45, 0]);
  });

  it('round-trips a local day', () => {
    const local = new Date(2027, 0, 1, 0, 5);
    expect(fromPickerDay(toPickerDay(local), local).getTime()).toBe(new Date(2027, 0, 1, 0, 5).getTime());
  });

  it('knows 24-hour locales', () => {
    expect(prefers24Hour('de-DE')).toBe(true);
    expect(prefers24Hour('en-US')).toBe(false);
  });
});
