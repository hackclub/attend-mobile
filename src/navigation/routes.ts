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

interface CurrentState {
  routes: readonly CurrentRoute[];
}

interface CurrentRoute {
  name: string;
  key: string;
  state?: CurrentState | object;
}

/**
 * `target` with routes keeping the keys of the matching routes in `current`,
 * so a reset keeps those screens mounted and only replaces what's around and
 * inside them, while what's presented over them (the switcher) is dismissed.
 *
 * A root route matches the same-named route in `current`. Further down, a
 * route matches the one at the same position in the same-named parent, if
 * it has the same name and the target gives it no params: so switching
 * events keeps the tabs, the Overview tab and its EventHome mounted (it just
 * re-renders for the new event), while a screen with params, which would
 * otherwise keep the last event's state, is mounted afresh.
 */
export function keepRootKeys<S extends PartialState>(target: S, current: CurrentState | undefined): S {
  if (!current) return target;
  return {
    ...target,
    routes: target.routes.map((route) =>
      keepRouteKey(route, current.routes.find((candidate) => candidate.name === route.name))
    ),
  };
}

function keepRouteKey(route: PartialRoute, existing: CurrentRoute | undefined): PartialRoute {
  if (!existing) return route;
  const kept: PartialRoute & { key: string } = { ...route, key: existing.key };
  const nested = existing.state && 'routes' in existing.state ? existing.state : undefined;
  if (route.state && nested) {
    kept.state = {
      ...route.state,
      routes: route.state.routes.map((child, index) => {
        const match = nested.routes[index];
        return match && match.name === child.name && child.params === undefined
          ? keepRouteKey(child, match)
          : child;
      }),
    };
  }
  return kept;
}
