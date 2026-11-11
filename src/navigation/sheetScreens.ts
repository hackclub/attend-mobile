/* eslint-disable @typescript-eslint/no-require-imports -- deferred on purpose */
import { useMemo } from 'react';
import type React from 'react';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { sheetOptions } from './sheetOptions';
import { COMPOSE_SHEETS } from './sheetPresenter';
import { sheetDetents, type SheetRouteName } from './sheets';

type ScreenGetter = () => React.ComponentType<any>;

export interface SheetConfig {
  getComponent: ScreenGetter;
  /**
   * iOS: the form sheet's resting heights; Android: the bottom sheet's
   * height (composeSheetHeight). Only long lists are tall (sheetDetents).
   */
  detents: NativeStackNavigationOptions['sheetAllowedDetents'];
}

const sheet = (name: SheetRouteName, getComponent: ScreenGetter): SheetConfig => ({
  getComponent,
  detents: sheetDetents(name) as SheetConfig['detents'],
});

/** Each sheet's screen, loaded on its first open, and its resting heights. */
export const SHEETS: Record<SheetRouteName, SheetConfig> = {
  SwitchEventSheet: sheet('SwitchEventSheet', () => require('../screens/sheets/SwitchEventSheet').SwitchEventSheet),
  AccountSheet: sheet('AccountSheet', () => require('../components/AccountSheet').AccountSheet),
  ScanContextSheet: sheet('ScanContextSheet', () => require('../screens/sheets/ScanContextSheet').ScanContextSheet),
  ScannerSearchSheet: sheet('ScannerSearchSheet', () => require('../screens/sheets/ScannerSearchSheet').ScannerSearchSheet),
  FilterSheet: sheet('FilterSheet', () => require('../components/FilterSheet').FilterSheet),
  OptionsSheet: sheet('OptionsSheet', () => require('../screens/sheets/OptionsSheet').OptionsSheet),
  MultiSelectSheet: sheet('MultiSelectSheet', () => require('../screens/sheets/MultiSelectSheet').MultiSelectSheet),
  LinkSheet: sheet('LinkSheet', () => require('../screens/sheets/LinkSheet').LinkSheet),
  KioskSetupSheet: sheet('KioskSetupSheet', () => require('../screens/sheets/KioskSetupSheet').KioskSetupSheet),
  KioskUnlockSheet: sheet('KioskUnlockSheet', () => require('../screens/sheets/KioskUnlockSheet').KioskUnlockSheet),
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
