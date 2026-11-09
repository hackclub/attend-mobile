// Deep links and app shortcuts name a fixed root route (attend://scan →
// Main › Scanner, attend://tickets → ParticipantMain › MyTickets), but which root routes exist
// depends on the signed-in user's roles. A link to a route this user doesn't
// have would be an unhandled navigate action and silently do nothing, so it
// lands on the user's home instead.

interface RouteLike {
  name: string;
  params?: object;
  state?: StateLike;
}

interface StateLike {
  index?: number;
  routes: readonly RouteLike[];
}

/** The signed-in user's home among the registered root routes. */
export function homeRouteName(routeNames: readonly string[]): string | undefined {
  if (routeNames.includes('Main')) return 'Main';
  if (routeNames.includes('ParticipantMain')) return 'ParticipantMain';
  return undefined;
}

/**
 * Returns `state` when every root route it names is registered; otherwise a
 * state that opens the user's home (or undefined when there is none, e.g. on
 * the login screen). Without `routeNames` (navigator not mounted yet) the
 * state passes through: initial state is rehydrated by the navigator, which
 * already drops unknown routes and falls back to its first screen.
 */
export function fallbackToRegisteredRoute<T extends StateLike>(
  state: T | undefined,
  routeNames: readonly string[] | undefined
): T | undefined {
  if (!state || !routeNames || routeNames.length === 0) return state;
  if (state.routes.every((route) => routeNames.includes(route.name))) return state;
  const home = homeRouteName(routeNames);
  return home ? ({ routes: [{ name: home }] } as unknown as T) : undefined;
}

// A path can only name one screen, so screens that both the attendee stack
// and the Overview stack hold are linked under the attendee stack. For an
// organizer the Overview is home, so their links open these there instead.
const SHARED_WITH_OVERVIEW = ['IncidentReport'];

/**
 * `state` with a link into the attendee stack moved to the Overview when the
 * user has the organizer tabs and the Overview stack holds the same screen.
 */
export function preferOrganizerTabs<T extends StateLike>(
  state: T | undefined,
  routeNames: readonly string[] | undefined
): T | undefined {
  if (!state || !routeNames?.includes('Main')) return state;
  const root = state.routes[0];
  if (state.routes.length !== 1 || root?.name !== 'ParticipantMain' || !root.state) return state;
  const leaf = root.state.routes[root.state.routes.length - 1];
  if (!leaf || !SHARED_WITH_OVERVIEW.includes(leaf.name)) return state;
  const { name, params } = leaf;
  const overview = { index: 1, routes: [{ name: 'EventHome' }, params ? { name, params } : { name }] };
  return {
    routes: [{ name: 'Main', state: { routes: [{ name: 'Overview', state: overview }] } }],
  } as unknown as T;
}

/**
 * ParticipantDetail params as they really arrive. A list pushes a
 * participant object; attend://participant/:id carries an id. A crafted link
 * (attend://participant/x?participant=foo) can put a string where the object
 * belongs, so only a real object counts and anything else takes the id path.
 */
export function participantDetailTarget<P extends object>(
  params: unknown
): { participant: P } | { id: string | undefined } {
  const record = (typeof params === 'object' && params !== null ? params : {}) as Record<string, unknown>;
  const participant = record.participant;
  if (typeof participant === 'object' && participant !== null && !Array.isArray(participant)) {
    return { participant: participant as P };
  }
  return { id: typeof record.id === 'string' && record.id ? record.id : undefined };
}
