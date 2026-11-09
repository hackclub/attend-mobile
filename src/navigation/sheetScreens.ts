/* eslint-disable @typescript-eslint/no-require-imports -- deferred on purpose */
import { useMemo } from 'react';
import type React from 'react';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { sheetOptions } from './sheetOptions';
import { COMPOSE_SHEETS } from './sheetPresenter';
import type { ComposeSheetHeight, SheetRouteName } from './sheets';

type ScreenGetter = () => React.ComponentType<any>;

export interface SheetConfig {
  getComponent: ScreenGetter;
  /** iOS: the form sheet's resting heights. */
  detents: NativeStackNavigationOptions['sheetAllowedDetents'];
  /** Android: the bottom sheet's height, when it isn't composeSheetHeight(detents). */
  composeHeight?: ComposeSheetHeight;
}

/** Each sheet's screen, loaded on its first open, and its resting heights. */
export const SHEETS: Record<SheetRouteName, SheetConfig> = {
  SwitchEventSheet: {
    getComponent: () => require('../screens/sheets/SwitchEventSheet').SwitchEventSheet,
    detents: 'fitToContents',
  },
  AccountSheet: {
    getComponent: () => require('../components/AccountSheet').AccountSheet,
    detents: [0.6, 0.95],
    // A Material sheet has no 60% stop to rest at; it fits the settings.
    composeHeight: 'fit',
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

/**
 * The form-sheet routes for the root stack, themed. None on Android, where
 * SheetHost shows the drawers as Material bottom sheets instead.
 */
export function useSheetScreens() {
  const { tokens } = useTheme();
  return useMemo(
    () =>
      (COMPOSE_SHEETS ? [] : (Object.keys(SHEETS) as SheetRouteName[])).map((name) => ({
        name,
        getComponent: SHEETS[name].getComponent,
        options: sheetOptions(tokens.bg, SHEETS[name].detents),
      })),
    [tokens.bg]
  );
}
