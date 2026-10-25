import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { darkColors, lightColors, type ThemeColors } from './colors';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  colors: ThemeColors;
  scheme: ColorScheme;
  isDark: boolean;
  // Shadows read as grime on a dark page — depth there comes from the card
  // being a step lighter than the background plus a faint light ring. These
  // let a style block drop its elevation without branching on `isDark`.
  shadowOpacity: number;
  elevation: number;
  // For native surfaces that take a light/dark keyword (blur effects,
  // keyboard appearance, the status bar).
  barStyle: 'light' | 'dark';
}

function buildTheme(scheme: ColorScheme): Theme {
  const isDark = scheme === 'dark';
  return {
    colors: isDark ? darkColors : (lightColors as unknown as ThemeColors),
    scheme,
    isDark,
    shadowOpacity: isDark ? 0 : 1,
    elevation: isDark ? 0 : 1,
    barStyle: isDark ? 'light' : 'dark',
  };
}

const lightTheme = buildTheme('light');
const darkTheme = buildTheme('dark');

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Attend follows the system appearance; there is no in-app override.
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => {});
  }, [theme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Builds a component's StyleSheet for the active scheme and caches it per
 * factory, so switching appearance rebuilds each sheet once rather than on
 * every render.
 *
 *   const makeStyles = (colors: ThemeColors) => StyleSheet.create({ ... });
 *   const styles = useThemedStyles(makeStyles);
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors, theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => {
    let cache = styleCache.get(factory);
    if (!cache) {
      cache = new Map();
      styleCache.set(factory, cache);
    }
    let sheet = cache.get(theme.scheme);
    if (!sheet) {
      sheet = factory(theme.colors, theme);
      cache.set(theme.scheme, sheet);
    }
    return sheet as T;
  }, [factory, theme]);
}

const styleCache = new WeakMap<object, Map<ColorScheme, unknown>>();
