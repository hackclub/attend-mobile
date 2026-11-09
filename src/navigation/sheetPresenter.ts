import { createContext, useCallback, useContext } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import type { SheetRouteName } from './sheets';
import { sheetStack } from './sheetStack';

/**
 * How the drawers are presented. iOS: form-sheet routes on the root stack,
 * which are the system sheet (UISheetPresentationController). Android: a
 * Material 3 ModalBottomSheet (Jetpack Compose, via @expo/ui) that SheetHost
 * mounts over the whole app, with the drag handle, scrim and predictive back
 * the platform's own sheets have.
 *
 * Screens don't branch on this: they open a drawer with `useOpenSheet()` and
 * a drawer closes itself with `useCloseSheet()`, whichever way it is shown.
 */
export const COMPOSE_SHEETS = Platform.OS === 'android';

/** What SheetHost gives each drawer it shows (Android). */
export interface PresentedSheet {
  /** Animates the drawer away, then unmounts it. */
  close: () => void;
}

export const PresentedSheetContext = createContext<PresentedSheet | null>(null);

/** Opens a drawer. Its data goes through its sheet channel first (`claim()`). */
export function useOpenSheet(): (name: SheetRouteName) => void {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return useCallback(
    (name: SheetRouteName) => {
      if (COMPOSE_SHEETS) sheetStack.open(name);
      else navigation.navigate(name);
    },
    [navigation]
  );
}

/** Closes the drawer this is rendered in. */
export function useCloseSheet(): () => void {
  const presented = useContext(PresentedSheetContext);
  const navigation = useNavigation();
  return useCallback(() => {
    if (presented) presented.close();
    else if (navigation.canGoBack()) navigation.goBack();
  }, [navigation, presented]);
}

/**
 * Whether this is inside a Material bottom sheet (Android), which draws its
 * own drag handle and keeps clear of the navigation bar and keyboard itself.
 */
export function useInComposeSheet(): boolean {
  return useContext(PresentedSheetContext) !== null;
}
