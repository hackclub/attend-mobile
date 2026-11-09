/* eslint-disable @typescript-eslint/no-require-imports -- deferred on purpose */
import { useMemo } from 'react';
import type React from 'react';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { sheetOptions } from './sheetOptions';
import type { SheetRouteName } from './sheets';

type ScreenGetter = () => React.ComponentType<any>;

// Each sheet's screen, loaded on its first open, and its resting heights.
const SHEETS: Record<
  SheetRouteName,
  { getComponent: ScreenGetter; detents: NativeStackNavigationOptions['sheetAllowedDetents'] }
> = {
  AccountSheet: {
    getComponent: () => require('../components/AccountSheet').AccountSheet,
    detents: [0.6, 0.95],
  },
  ScanContextSheet: {
    getComponent: () => require('../screens/sheets/ScanContextSheet').ScanContextSheet,
    detents: 'fitToContents',
  },
  ScannerSearchSheet: {
    getComponent: () => require('../screens/sheets/ScannerSearchSheet').ScannerSearchSheet,
    detents: [0.9],
  },
  FilterSheet: {
    getComponent: () => require('../components/FilterSheet').FilterSheet,
    detents: [0.9],
  },
  OptionsSheet: {
    getComponent: () => require('../screens/sheets/OptionsSheet').OptionsSheet,
    detents: 'fitToContents',
  },
  MultiSelectSheet: {
    getComponent: () => require('../screens/sheets/MultiSelectSheet').MultiSelectSheet,
    detents: [0.9],
  },
  LinkSheet: {
    getComponent: () => require('../screens/sheets/LinkSheet').LinkSheet,
    detents: 'fitToContents',
  },
};

/** The form-sheet routes for the root stack, themed. */
export function useSheetScreens() {
  const { tokens } = useTheme();
  return useMemo(
    () =>
      (Object.keys(SHEETS) as SheetRouteName[]).map((name) => ({
        name,
        getComponent: SHEETS[name].getComponent,
        options: sheetOptions(tokens.bg, SHEETS[name].detents),
      })),
    [tokens.bg]
  );
}
