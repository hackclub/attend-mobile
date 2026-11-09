import { useCallback, useSyncExternalStore } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ROOT_NAVIGATOR } from './routes';
import { isRouteUnderSheets } from './sheets';

/**
 * Whether this screen is still on screen with only form sheets over it. A
 * sheet blurs the screen under it, so this tells "a sheet is open" apart
 * from a tab switch or a full-screen route, e.g. to keep a camera running.
 */
export function useIsUnderSheet(): { underSheet: boolean; checkUnderSheet: () => boolean } {
  const navigation = useNavigation();
  const { key } = useRoute();
  const root = navigation.getParent(ROOT_NAVIGATOR);

  const checkUnderSheet = useCallback(() => isRouteUnderSheets(root?.getState(), key), [key, root]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const unsubscribers = [
        navigation.addListener('focus', onChange),
        navigation.addListener('blur', onChange),
        ...(root ? [root.addListener('state', onChange)] : []),
      ];
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
    [navigation, root]
  );
  const underSheet = useSyncExternalStore(subscribe, checkUnderSheet, checkUnderSheet);
  return { underSheet, checkUnderSheet };
}
