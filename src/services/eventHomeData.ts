import { api } from './api';
import { canViewIncidents, eventRunsTravel } from './eventAccess';
import { remoteCache } from './remoteCache';
import { syncService } from './sync';
import type { Event } from '../types';

export interface RemotePanel<T> {
  cacheKey: string;
  load: () => Promise<T>;
}

/**
 * The Overview's remote panels for an event: each one's loader and cache key,
 * or null where the role doesn't get it. One definition for the screen and
 * for the early load a switch starts (prefetchEventHome), so they share.
 */
export function eventHomePanels(eventId: string, access: { travel: boolean; incidents: boolean }) {
  return {
    travel: access.travel
      ? ({ cacheKey: `travel:${eventId}`, load: () => api.getTravelCalendar(eventId) } as RemotePanel<
          Awaited<ReturnType<typeof api.getTravelCalendar>>
        >)
      : null,
    incidents: access.incidents
      ? ({ cacheKey: `incidents:${eventId}`, load: () => api.getIncidents(eventId) } as RemotePanel<
          Awaited<ReturnType<typeof api.getIncidents>>
        >)
      : null,
    messages: { cacheKey: `messages:${eventId}`, load: () => api.getMessages(eventId) } as RemotePanel<
      Awaited<ReturnType<typeof api.getMessages>>
    >,
  };
}

/**
 * Starts loading what an event's Overview shows, as a switch to it begins: the
 * card's grow and the screen's mount take about half a second, which the
 * requests and the saved roster's read get as a head start. The screen then
 * joins these loads instead of starting its own.
 */
export function prefetchEventHome(event: Event): void {
  void syncService.getCachedParticipants(event.id).catch(() => undefined);
  const panels = eventHomePanels(event.id, { travel: eventRunsTravel(event), incidents: canViewIncidents(event) });
  for (const panel of [panels.travel, panels.incidents, panels.messages]) {
    if (panel) void remoteCache.load<unknown>(panel.cacheKey, panel.load).catch(() => undefined);
  }
}
