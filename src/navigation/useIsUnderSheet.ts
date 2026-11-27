import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ROOT_NAVIGATOR } from './routes';
import { isRouteUnderSheets, isSheetOnTop, rootKeyUnderSheets } from './sheets';
import { sheetStack } from './sheetStack';

/**
 * Whether this screen is still on screen with only sheets over it, e.g. to
 * keep a camera running but paused.
 *
 * iOS: a form sheet blurs the screen under it, so this tells "a sheet is
 * open" apart from a tab switch or a full-screen route. Android: a Material
 * bottom sheet is a window over the app and leaves the screen focused, so
 * it's any open sheet over the focused screen.
 */
export function useIsUnderSheet(): { underSheet: boolean; checkUnderSheet: () => boolean } {
  const navigation = useNavigation();
  const { key, name } = useRoute();
  const root = navigation.getParent(ROOT_NAVIGATOR);
  // Whether this screen was the focused one the last time no form sheet was
  // up, and under which root route. The root state alone can't always tell:
  // a nested stack still on its first screen has no state of its own there,
  // so a screen in a tab that hasn't navigated (the scanner, an event's
  // overview) can't be found under a sheet by its key. Noted a frame after
  // each change, as the root state only has a new sheet by then.
  const lastFocus = useRef({ focused: navigation.isFocused(), rootKey: rootKeyUnderSheets(root?.getState()) });

  const checkUnderSheet = useCallback(() => {
    const rootState = root?.getState();
    return (
      isRouteUnderSheets(rootState, key, name) ||
      (isSheetOnTop(rootState) &&
        lastFocus.current.focused &&
        lastFocus.current.rootKey === rootKeyUnderSheets(rootState)) ||
      (sheetStack.get().length > 0 && navigation.isFocused())
    );
  }, [key, name, navigation, root]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const note = () => {
        const rootState = root?.getState();
        if (isSheetOnTop(rootState)) return;
        lastFocus.current = { focused: navigation.isFocused(), rootKey: rootKeyUnderSheets(rootState) };
      };
      let frame: number | null = null;
      const noteSoon = () => {
        onChange();
        if (frame !== null) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = null;
          note();
          onChange();
        });
      };
      const unsubscribers = [
        navigation.addListener('focus', () => {
          note();
          noteSoon();
        }),
        navigation.addListener('blur', noteSoon),
        ...(root ? [root.addListener('state', noteSoon)] : []),
        sheetStack.subscribe(onChange),
      ];
      return () => {
        if (frame !== null) cancelAnimationFrame(frame);
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    },
    [navigation, root]
  );
  const underSheet = useSyncExternalStore(subscribe, checkUnderSheet, checkUnderSheet);
  return { underSheet, checkUnderSheet };
}
