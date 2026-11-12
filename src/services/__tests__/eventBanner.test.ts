import { bannerHeight, eventBannerText } from '../eventBanner';
import type { Event } from '../../types';

const event = (overrides: Partial<Event>): Event =>
  ({ id: 'e1', name: 'Haven Canberra', timezone: 'Australia/Sydney', ...overrides }) as Event;

describe('bannerHeight', () => {
  it('is a 16:9 photo plus the top inset', () => {
    expect(bannerHeight(390, 47)).toBe(219 + 47);
  });

  it('keeps narrow and wide screens within bounds', () => {
    expect(bannerHeight(200)).toBe(180);
    expect(bannerHeight(1366, 20)).toBe(320);
  });
});

describe('eventBannerText', () => {
  const now = new Date('2026-11-14T02:00:00Z'); // Sat 14 Nov, 1 PM in Canberra

  it('counts the days of a running event and ticks it', () => {
    const text = eventBannerText(
      event({ starts_at: '2026-11-13T22:00:00Z', ends_at: '2026-11-15T06:00:00Z', location_city: 'Canberra' }),
      'Event admin',
      now
    );
    expect(text).toEqual({
      eyebrow: 'Day 1 of 2',
      eyebrowIcon: 'check-circle',
      meta: 'Sat 14 – Sun 15 Nov · Canberra · Event admin',
    });
  });

  it('counts down to an upcoming event and skips missing parts', () => {
    const text = eventBannerText(event({ starts_at: '2026-11-27T22:00:00Z' }), null, now);
    expect(text.eyebrow).toBe('14 days away');
    expect(text.eyebrowIcon).toBe('clock');
    expect(text.meta).toBe('Sat 28 Nov');
  });
});
