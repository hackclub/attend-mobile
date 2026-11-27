import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mockSystem = { scheme: 'light' as 'light' | 'dark' };
const mockSetColorScheme = jest.fn();

jest.mock('react-native', () => ({
  useColorScheme: () => mockSystem.scheme,
  Appearance: { setColorScheme: (s: string) => mockSetColorScheme(s) },
}));
jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  THEME_PREFERENCE_KEY,
  ThemeProvider,
  darkTokens,
  lightTokens,
  useTheme,
  useThemePreference,
  type Theme,
} from '..';

type Probe = { theme: Theme; pref: ReturnType<typeof useThemePreference> };

async function mount(): Promise<() => Probe> {
  let latest: Probe | undefined;
  function Inner() {
    latest = { theme: useTheme(), pref: useThemePreference() };
    return null;
  }
  await act(async () => {
    renderer.create(
      <ThemeProvider>
        <Inner />
      </ThemeProvider>,
    );
  });
  return () => latest!;
}

beforeEach(async () => {
  mockSystem.scheme = 'light';
  mockSetColorScheme.mockClear();
  await AsyncStorage.clear();
});

describe('ThemeProvider', () => {
  it('follows the system scheme by default', async () => {
    mockSystem.scheme = 'dark';
    const get = await mount();
    expect(get().pref.preference).toBe('system');
    expect(get().theme.scheme).toBe('dark');
    expect(get().theme.tokens).toBe(darkTokens);
  });

  it('applies and persists an override', async () => {
    const get = await mount();
    expect(get().theme.tokens).toBe(lightTokens);
    await act(async () => get().pref.setPreference('dark'));
    expect(get().theme.isDark).toBe(true);
    expect(mockSetColorScheme).toHaveBeenLastCalledWith('dark');
    expect(await AsyncStorage.getItem(THEME_PREFERENCE_KEY)).toBe('dark');

    await act(async () => get().pref.setPreference('system'));
    expect(get().theme.isDark).toBe(false);
    expect(mockSetColorScheme).toHaveBeenLastCalledWith('auto');
  });

  it('restores a stored override', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, 'dark');
    const get = await mount();
    expect(get().pref.loaded).toBe(true);
    expect(get().pref.preference).toBe('dark');
    expect(get().theme.scheme).toBe('dark');
  });
});
