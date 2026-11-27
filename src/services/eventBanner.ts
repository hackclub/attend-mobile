import { eventDays, eventPhaseLabel, formatEventDateRange } from './eventDates';
import type { IconName } from '../components/ui/Icon';
import type { Event } from '../types';

/** The banner photo's shape, before the status bar is added on top. */
const BANNER_RATIO = 9 / 16;
const BANNER_MIN_HEIGHT = 180;
const BANNER_MAX_HEIGHT = 300;

/**
 * The banner's height for a screen `width` wide: a 16:9 photo (within sensible
 * bounds, so a phone in landscape or a wide iPad doesn't get a wall of photo),
 * plus the space above it for the status bar.
 */
export function bannerHeight(width: number, topInset = 0): number {
  const photo = Math.min(BANNER_MAX_HEIGHT, Math.max(BANNER_MIN_HEIGHT, Math.round(width * BANNER_RATIO)));
  return photo + topInset;
}

/**
 * The banner's eyebrow and meta line for `event`: where it sits relative to
 * today ("Day 1 of 2", "5 days away"), with a tick once it's running, and
 * its dates · city · the user's role.
 */
export function eventBannerText(event: Event, role?: string | null, now = new Date()) {
  const days = eventDays(event, now);
  const running = !!days && days.untilStart <= 0 && days.untilEnd >= 0;
  return {
    eyebrow: eventPhaseLabel(event, now),
    eyebrowIcon: (running ? 'check-circle' : 'clock') as IconName,
    meta: [formatEventDateRange(event), event.location_city, role].filter(Boolean).join(' · '),
  };
}
