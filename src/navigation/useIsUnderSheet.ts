import { useCallback, useSyncExternalStore } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ROOT_NAVIGATOR } from './routes';
import { isRouteUnderSheets } from './sheets';
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
  const { key } = useRoute();
  const root = navigation.getParent(ROOT_NAVIGATOR);

  const checkUnderSheet = useCallback(
    () =>
      isRouteUnderSheets(root?.getState(), key) ||
      (sheetStack.get().length > 0 && navigation.isFocused()),
    [key, navigation, root]
  );
  const subscribe = useCallback(
    (onChange: () => void) => {
      const unsubscribers = [
        navigation.addListener('focus', onChange),
        navigation.addListener('blur', onChange),
        ...(root ? [root.addListener('state', onChange)] : []),
        sheetStack.subscribe(onChange),
      ];
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
    [navigation, root]
  );
  const underSheet = useSyncExternalStore(subscribe, checkUnderSheet, checkUnderSheet);
  return { underSheet, checkUnderSheet };
}
