import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mockAppStateListeners = new Set<(state: string) => void>();
const mockAppState = {
  currentState: 'active',
  addEventListener: jest.fn((_type: string, listener: (state: string) => void) => {
    mockAppStateListeners.add(listener);
    return { remove: () => mockAppStateListeners.delete(listener) };
  }),
};

jest.mock('react-native', () => ({
  AppState: mockAppState,
  Platform: { OS: 'android' },
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
}));
jest.mock('../ui/Icon', () => ({ Icon: 'Icon' }));
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../hooks/useBiometricGate', () => ({
  DEFAULT_GATE_REASON: 'reason',
  useBiometricGate: jest.fn(),
}));
jest.mock('../../theme', () => ({
  useTheme: () => ({ tokens: {} }),
  useThemedStyles: () => ({}),
}));

import * as ScreenCapture from 'expo-screen-capture';
import { useSecureWindowWhile } from '../BiometricGate';

function Probe({ active }: { active: boolean }) {
  useSecureWindowWhile(active);
  return null;
}

let root: renderer.ReactTestRenderer | undefined;

function setAppState(state: string) {
  mockAppState.currentState = state;
  act(() => {
    [...mockAppStateListeners].forEach(listener => listener(state));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAppStateListeners.clear();
  mockAppState.currentState = 'active';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

describe('BiometricGate FLAG_SECURE', () => {
  it('releases at once when locked in the foreground', () => {
    act(() => { root = renderer.create(<Probe active />); });
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1);

    act(() => root!.update(<Probe active={false} />));
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps the flag after a background lock until the app is active again', () => {
    act(() => { root = renderer.create(<Probe active />); });

    mockAppState.currentState = 'background';
    act(() => root!.update(<Probe active={false} />));
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled();

    setAppState('background');
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled();

    setAppState('active');
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending release when unlocked again first', () => {
    act(() => { root = renderer.create(<Probe active />); });
    mockAppState.currentState = 'background';
    act(() => root!.update(<Probe active={false} />));

    act(() => root!.update(<Probe active />));
    setAppState('active');

    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled();
  });
});
