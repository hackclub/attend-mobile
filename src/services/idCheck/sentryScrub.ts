import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

// Sentry records console output and other breadcrumbs app-wide. While the ID
// check screen is open, nothing it might log (document details, MRZ text) may
// reach Sentry, so the screen flips this flag and Sentry.init's hooks drop
// anything captured in the meantime.
let idCheckActive = false;

export function setIdCheckActive(active: boolean): void {
  idCheckActive = active;
}

export function scrubIdCheckBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (!idCheckActive) return breadcrumb;
  // Navigation and the request to the id_checks endpoint carry no document
  // data; everything else (console, touch targets with labels) is dropped.
  if (breadcrumb.category === 'navigation' || breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
    return breadcrumb;
  }
  return null;
}

export function scrubIdCheckEvent(event: ErrorEvent): ErrorEvent {
  if (!idCheckActive) return event;
  return {
    ...event,
    message: event.message ? '[ID check: message removed]' : event.message,
    extra: undefined,
    breadcrumbs: event.breadcrumbs?.filter((crumb) => scrubIdCheckBreadcrumb(crumb) !== null),
    tags: { ...event.tags, id_check_scrubbed: 'true' },
  };
}
