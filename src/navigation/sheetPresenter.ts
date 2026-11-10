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
  /**
   * Animates the drawer away, then unmounts it and calls `then`; or, with
   * `whileClosing`, calls `then` straight away as it starts to go.
   */
  close: (then?: () => void, options?: LeaveSheetOptions) => void;
}

export interface LeaveSheetOptions {
  /**
   * Android: run `go` as the drawer starts to close rather than once it has
   * gone. Its sheet is a window of its own, outside the navigators, so the
   * screens under it can change while it animates away. iOS always waits:
   * there the drawer is a route on the root stack. Only for a `go` the
   * drawer's own content survives, e.g. not signing out.
   */
  whileClosing?: boolean;
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
 * Leaves this drawer for somewhere else: `go` resets the root, replaces the
 * screen or signs out. `go` only runs once the drawer has gone, so the
 * navigation never races its dismissal (which left the app not taking
 * touches). Android: once the Material sheet has animated away and
 * unmounted. iOS: once the form sheet's route has finished closing.
 */
export function useLeaveSheet(): (go: () => void, options?: LeaveSheetOptions) => void {
  const presented = useContext(PresentedSheetContext);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return useCallback(
    (go: () => void, options?: LeaveSheetOptions) => {
      if (presented) {
        presented.close(go, options);
        return;
      }
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const unsubscribe = navigation.addListener('transitionEnd', (event) => {
        if (event.data.closing) finish();
      });
      function finish() {
        if (done) return;
        done = true;
        unsubscribe();
        if (timer) clearTimeout(timer);
        go();
      }
      if (!navigation.canGoBack()) {
        finish();
        return;
      }
      // A sheet closed from JS is gone from the navigation state at once, so
      // its closing transitionEnd never arrives: this timer is what normally
      // runs `go`, just after the sheet has animated away.
      timer = setTimeout(finish, SHEET_DISMISS_MS);
      navigation.goBack();
    },
    [navigation, presented]
  );
}

/**
 * How long until a form sheet closed from JS has animated away. Measured at
 * about 200 ms on iOS 26; the generous margin keeps `go` clear of the
 * dismissal on a slower or busier device, which matters more than speed.
 */
const SHEET_DISMISS_MS = 500;

/**
 * Whether this is inside a Material bottom sheet (Android), which draws its
 * own drag handle and keeps clear of the navigation bar and keyboard itself.
 */
export function useInComposeSheet(): boolean {
  return useContext(PresentedSheetContext) !== null;
}
