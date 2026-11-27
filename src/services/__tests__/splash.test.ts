const preventAutoHideAsync = jest.fn(() => Promise.resolve(true));
const hideAsync = jest.fn(() => Promise.resolve());
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync, hideAsync }));

import { SPLASH_TIMEOUT_MS } from '../splash';

type SplashModule = typeof import('../splash');

// Each test gets a fresh copy, since the module remembers it has hidden.
function loadSplash(): SplashModule {
  let mod!: SplashModule;
  jest.isolateModules(() => {
    mod = require('../splash');
  });
  return mod;
}

beforeEach(() => {
  jest.useFakeTimers();
  preventAutoHideAsync.mockClear();
  hideAsync.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('splash', () => {
  it('holds the splash until hidden, and hides it once', () => {
    const splash = loadSplash();
    splash.holdSplash();
    expect(preventAutoHideAsync).toHaveBeenCalledTimes(1);
    expect(hideAsync).not.toHaveBeenCalled();

    splash.hideSplash();
    splash.hideSplash();
    jest.advanceTimersByTime(SPLASH_TIMEOUT_MS);
    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('hides anyway once the timeout passes', () => {
    const splash = loadSplash();
    splash.holdSplash();
    jest.advanceTimersByTime(SPLASH_TIMEOUT_MS - 1);
    expect(hideAsync).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('is ready only once auth has restored and the navigator has mounted', () => {
    const { isAppReady } = loadSplash();
    expect(isAppReady({ authLoading: true, navigationReady: false })).toBe(false);
    expect(isAppReady({ authLoading: true, navigationReady: true })).toBe(false);
    expect(isAppReady({ authLoading: false, navigationReady: false })).toBe(false);
    expect(isAppReady({ authLoading: false, navigationReady: true })).toBe(true);
  });
});
