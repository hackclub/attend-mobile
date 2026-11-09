import type { RootStackParamList } from '../types';

/**
 * The drawers. On iOS they're root-stack routes presented as form sheets
 * (UISheetPresentationController); on Android, Material 3 bottom sheets
 * mounted by SheetHost (see navigation/sheetPresenter). Their data and
 * callbacks come through a sheet channel (navigation/sheetChannel).
 */
export const SHEET_ROUTES = [
  'SwitchEventSheet',
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

/**
 * The drawers that are long lists (participant search, a searchable
 * checklist), tall from the start so the list has room under the keyboard.
 * Every other drawer fits its content.
 */
export const TALL_SHEETS: ReadonlySet<SheetRouteName> = new Set(['ScannerSearchSheet', 'MultiSelectSheet']);

/** A form sheet's resting heights (fractions of the screen, ascending). */
export function sheetDetents(name: SheetRouteName): readonly number[] | 'fitToContents' {
  return TALL_SHEETS.has(name) ? [0.9] : 'fitToContents';
}

/**
 * An Android bottom sheet's height: 'fit' sizes it to its content (up to
 * nearly the screen), a number is that fraction of the space it can take.
 */
export type ComposeSheetHeight = 'fit' | number;

/**
 * The Android height that matches a form sheet's detents: a sheet that fits
 * its content does there too, and the others are as tall as their largest
 * detent.
 */
export function composeSheetHeight(detents: readonly number[] | 'fitToContents' | undefined): ComposeSheetHeight {
  if (!detents || detents === 'fitToContents' || detents.length === 0) return 'fit';
  return Math.min(1, Math.max(...detents));
}
