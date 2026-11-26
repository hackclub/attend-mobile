import type { RootStackParamList } from '../types';

/**
 * The drawers. On iOS they're root-stack routes presented as form sheets
 * (UISheetPresentationController); on Android, Material 3 bottom sheets
 * mounted by SheetHost (see navigation/sheetPresenter). Their data and
 * callbacks come through a sheet channel (navigation/sheetChannel).
 */
export const SHEET_ROUTES = [
  'AccountSheet',
  'ScanContextSheet',
  'ScannerSearchSheet',
  'FilterSheet',
  'OptionsSheet',
  'MultiSelectSheet',
  'LinkSheet',
  'KioskSetupSheet',
  'KioskUnlockSheet',
] as const satisfies readonly (keyof RootStackParamList)[];

export type SheetRouteName = (typeof SHEET_ROUTES)[number];

const SHEET_ROUTE_SET: ReadonlySet<string> = new Set(SHEET_ROUTES);

export const isSheetRoute = (name: string): name is SheetRouteName => SHEET_ROUTE_SET.has(name);

interface StateLike {
  index?: number;
  routes: readonly { key?: string; name: string; state?: StateLike }[];
}

/** Whether a form sheet is the top of the root stack. */
export function isSheetOnTop(rootState: StateLike | undefined): boolean {
  if (!rootState?.routes.length) return false;
  const index = rootState.index ?? rootState.routes.length - 1;
  return isSheetRoute(rootState.routes[index]?.name ?? '');
}

/** The key of the root route shown under any form sheets at the top (the top route with none). */
export function rootKeyUnderSheets(rootState: StateLike | undefined): string | undefined {
  if (!rootState?.routes.length) return undefined;
  let index = rootState.index ?? rootState.routes.length - 1;
  while (index >= 0 && isSheetRoute(rootState.routes[index].name)) index -= 1;
  return rootState.routes[index]?.key;
}

/**
 * Whether the route `routeKey` is what's shown under the form sheets at the
 * top of the root stack, i.e. it's on screen with only sheets over it. False
 * when no sheet is open (the screen is simply focused) or when anything
 * else, such as a full-screen modal or another tab, covers it.
 */
export function isRouteUnderSheets(rootState: StateLike | undefined, routeKey: string, routeName?: string): boolean {
  if (!rootState || !isSheetOnTop(rootState)) return false;
  let index = rootState.index ?? rootState.routes.length - 1;
  while (index >= 0 && isSheetRoute(rootState.routes[index].name)) index -= 1;
  let route = rootState.routes[index];
  while (route) {
    if (route.key === routeKey) return true;
    // A state set by a root reset (resetRoot) keeps its partial routes, with
    // no keys, until that stack next changes: matched by name instead.
    if (route.key === undefined && routeName !== undefined && route.name === routeName && !route.state) return true;
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

interface NavigationLike {
  getState: () => { type?: string; index?: number; routes: readonly { name: string }[] } | undefined;
  getParent: () => unknown;
}

/**
 * Whether there's a screen to go back to, not counting drawers. On iOS a
 * drawer is a root-stack route, so while one is open React Navigation's own
 * canGoBack() is true everywhere under it, and screens flipped to showing a
 * back button the moment a drawer opened.
 */
export function canGoBackPastSheets(navigation: unknown): boolean {
  let nav = navigation as NavigationLike | undefined;
  while (nav) {
    const state = nav.getState();
    if (state && state.type === 'stack') {
      const below = state.routes.slice(0, (state.index ?? state.routes.length - 1) + 1);
      if (below.filter((route) => !isSheetRoute(route.name)).length > 1) return true;
    }
    nav = nav.getParent() as NavigationLike | undefined;
  }
  return false;
}
