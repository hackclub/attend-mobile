import type { RootStackParamList } from '../types';

/**
 * Root-stack routes presented as native form sheets (a UISheetPresentation
 * sheet on iOS, a Material BottomSheetBehavior sheet on Android). Their data
 * and callbacks come through a sheet channel (navigation/sheetChannel).
 */
export const SHEET_ROUTES = [
  'AccountSheet',
  'ScanContextSheet',
  'ScannerSearchSheet',
  'FilterSheet',
  'OptionsSheet',
  'MultiSelectSheet',
  'LinkSheet',
] as const satisfies readonly (keyof RootStackParamList)[];

export type SheetRouteName = (typeof SHEET_ROUTES)[number];

const SHEET_ROUTE_SET: ReadonlySet<string> = new Set(SHEET_ROUTES);

export const isSheetRoute = (name: string): name is SheetRouteName => SHEET_ROUTE_SET.has(name);

interface StateLike {
  index?: number;
  routes: readonly { key?: string; name: string; state?: StateLike }[];
}

/**
 * Whether the route `routeKey` is what's shown under the form sheets at the
 * top of the root stack, i.e. it's on screen with only sheets over it. False
 * when no sheet is open (the screen is simply focused) or when anything
 * else, such as a full-screen modal or another tab, covers it.
 */
export function isRouteUnderSheets(rootState: StateLike | undefined, routeKey: string): boolean {
  if (!rootState?.routes.length) return false;
  let index = rootState.index ?? rootState.routes.length - 1;
  if (!isSheetRoute(rootState.routes[index]?.name ?? '')) return false;
  while (index >= 0 && isSheetRoute(rootState.routes[index].name)) index -= 1;
  let route = rootState.routes[index];
  while (route) {
    if (route.key === routeKey) return true;
    const child: StateLike | undefined = route.state;
    if (!child?.routes.length) return false;
    route = child.routes[child.index ?? 0];
  }
  return false;
}
