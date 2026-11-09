import { CommonActions } from '@react-navigation/native';
import { ROOT_NAVIGATOR, keepRootKeys, type PartialState } from './routes';

interface NavigationLike {
  getParent: (id?: string) => unknown;
  getState: () => { routes: readonly { name: string; key: string }[] } | undefined;
  dispatch: (action: never) => void;
}

/**
 * The root stack's navigation, from any screen in any nested navigator (or
 * from a root screen itself). Screens' navigation types don't know the root
 * navigator's id, hence the loose types.
 */
export function rootNavigation(navigation: object): NavigationLike {
  const nav = navigation as NavigationLike;
  return (nav.getParent(ROOT_NAVIGATOR) as NavigationLike | undefined) ?? nav;
}

/** Resets the root stack to `state`, keeping root screens that stay mounted. */
export function resetRoot(navigation: object, state: PartialState): void {
  const root = rootNavigation(navigation);
  root.dispatch(CommonActions.reset(keepRootKeys(state, root.getState())) as never);
}
