import type { OverviewStackParamList, Ticket } from '../types';

/** The root stack's navigator id, for `navigation.getParent(ROOT_NAVIGATOR)`. */
export const ROOT_NAVIGATOR = 'Root';

// Root states to reset to when the user changes which event they're in.
// Nested states are partial (no keys, not `stale: false`), so each navigator
// fills in the rest: the tab navigator its other tabs, a stack its own keys.

interface PartialRoute {
  name: string;
  params?: object;
  state?: PartialState;
}

export interface PartialState {
  index: number;
  routes: PartialRoute[];
}

/**
 * An organized event's home: the tabs on the Overview, with every tab's
 * stack back at its root so nothing from the previous event stays pushed.
 * `screen` pushes one Overview screen above it, e.g. the incident form.
 */
export function eventHomeState<S extends keyof OverviewStackParamList>(
  screen?: S,
  params?: OverviewStackParamList[S]
): PartialState {
  const overview: PartialRoute[] = [{ name: 'EventHome' }];
  if (screen && screen !== 'EventHome') overview.push({ name: screen, params: params ?? undefined });
  return {
    index: 0,
    routes: [
      {
        name: 'Main',
        state: {
          index: 0,
          routes: [{ name: 'Overview', state: { index: overview.length - 1, routes: overview } }],
        },
      },
    ],
  };
}

/**
 * An attended event's home: its pass at the bottom of the attendee stack,
 * with nothing under it to go back to. The banner switches events instead.
 */
export function passHomeState(ticket: Ticket): PartialState {
  return {
    index: 0,
    routes: [
      {
        name: 'ParticipantMain',
        state: { index: 0, routes: [{ name: 'TicketDetail', params: { ticket } }] },
      },
    ],
  };
}

/**
 * `target` with each root route keeping the key of the same-named route in
 * `current`, so a reset that keeps (say) the tabs keeps that screen mounted
 * and only replaces what's inside it, while what's presented over it (the
 * switcher) is dismissed.
 */
export function keepRootKeys<S extends PartialState>(
  target: S,
  current: { routes: readonly { name: string; key: string }[] } | undefined
): S {
  if (!current) return target;
  return {
    ...target,
    routes: target.routes.map((route) => {
      const existing = current.routes.find((candidate) => candidate.name === route.name);
      return existing ? { ...route, key: existing.key } : route;
    }),
  };
}
