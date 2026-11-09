// Deep links and app shortcuts name a fixed root route (attend://scan →
// Main, attend://tickets → ParticipantMain), but which root routes exist
// depends on the signed-in user's roles. A link to a route this user doesn't
// have would be an unhandled navigate action and silently do nothing, so it
// lands on the user's home instead.

interface RouteLike {
  name: string;
}

interface StateLike {
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
