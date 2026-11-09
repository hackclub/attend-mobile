import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { darkColors, lightColors, type ThemeColors } from './colors';
import {
  darkTokens,
  hitTarget,
  lightTokens,
  radii,
  spacing,
  typography,
  type ThemeTokens,
} from './tokens';

export type ColorScheme = 'light' | 'dark';
/** What the user picked in Account › Appearance. */
export type ThemePreference = 'system' | ColorScheme;

export const THEME_PREFERENCE_KEY = 'attend.themePreference';

export interface Theme {
  scheme: ColorScheme;
  isDark: boolean;
  /** Console design tokens for the active scheme. Use these in new code. */
  tokens: ThemeTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  type: typeof typography;
  hitTarget: number;
  /** Legacy role names, aliased onto `tokens`. Prefer `tokens`. */
  colors: ThemeColors;
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
    scheme,
    isDark,
    tokens: isDark ? darkTokens : lightTokens,
    spacing,
    radii,
    type: typography,
    hitTarget,
    colors: isDark ? darkColors : (lightColors as unknown as ThemeColors),
    shadowOpacity: isDark ? 0 : 1,
    elevation: isDark ? 0 : 1,
    barStyle: isDark ? 'light' : 'dark',
  };
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');

interface PreferenceContextValue {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** False until the stored preference has been read. */
  loaded: boolean;
}

const ThemeContext = createContext<Theme>(lightTheme);
const PreferenceContext = createContext<PreferenceContextValue>({
  preference: 'system',
  setPreference: () => {},
  loaded: false,
});

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

// Tell the native side too, so system UI the app hosts (alerts, pickers,
// keyboards) matches the override. 'auto' hands control back to the OS.
function applyNativeOverride(preference: ThemePreference) {
  try {
    Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
  } catch {
    // Not available on every platform; the JS theme still applies.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (isPreference(stored)) {
          setPreferenceState(stored);
          if (stored !== 'system') applyNativeOverride(stored);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyNativeOverride(next);
    AsyncStorage.setItem(THEME_PREFERENCE_KEY, next).catch(() => {});
  }, []);

  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const theme = scheme === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => {});
  }, [theme]);

  const preferenceValue = useMemo(
    () => ({ preference, setPreference, loaded }),
    [preference, setPreference, loaded],
  );

  return (
    <PreferenceContext.Provider value={preferenceValue}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </PreferenceContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Reads and sets the system / light / dark override (persisted). */
export function useThemePreference(): PreferenceContextValue {
  return useContext(PreferenceContext);
}

/**
 * Builds a component's StyleSheet for the active scheme and caches it per
 * factory, so switching appearance rebuilds each sheet once rather than on
 * every render.
 *
 *   const makeStyles = (colors: ThemeColors, theme: Theme) => StyleSheet.create({
 *     card: { backgroundColor: theme.tokens.bg, borderColor: theme.tokens.box },
 *   });
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
