import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mockPlatform = { OS: 'android' };
jest.mock('react-native', () => ({
  Platform: mockPlatform,
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

let mockTagListener: ((result: unknown) => void) | null = null;
let mockSnapshotListener: (() => void) | null = null;
const mockSnapshot = { session: { status: 'idle' }, adapterEnabled: true, autoReadActive: false };
const mockStop = jest.fn();

jest.mock('../../services/nfc', () => {
  const actual = jest.requireActual('../../services/nfc');
  return {
    badgeTokenFromResult: actual.badgeTokenFromResult,
    nfcService: {
      startAutoRead: jest.fn((listener: (result: unknown) => void) => {
        mockTagListener = listener;
        return mockStop;
      }),
      subscribe: jest.fn((listener: () => void) => {
        mockSnapshotListener = listener;
        return () => { mockSnapshotListener = null; };
      }),
      getSnapshot: () => mockSnapshot,
      isEnabled: jest.fn(),
    },
  };
});

jest.mock('react-native-nfc-manager', () => ({ __esModule: true, default: {}, NfcEvents: {}, NfcTech: {}, Ndef: {} }));

import { nfcService } from '../../services/nfc';
import { useNfcAutoRead } from '../useNfcAutoRead';

function setup(enabled: boolean, onToken: (t: string) => void) {
  const result: { active?: boolean } = {};
  function Probe(props: { enabled: boolean }) {
    Object.assign(result, useNfcAutoRead({ enabled: props.enabled, onToken }));
    return null;
  }
  let root: renderer.ReactTestRenderer | undefined;
  act(() => {
    root = renderer.create(<Probe enabled={enabled} />);
  });
  return {
    result,
    rerender: (next: boolean) => act(() => root!.update(<Probe enabled={next} />)),
    unmount: () => act(() => root!.unmount()),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform.OS = 'android';
  mockSnapshot.autoReadActive = false;
  mockTagListener = null;
});

it('forwards badge tokens, suppresses quick repeats and stops on disable', () => {
  const onToken = jest.fn();
  const { result, rerender } = setup(true, onToken);
  expect(nfcService.startAutoRead).toHaveBeenCalledTimes(1);
  expect(result.active).toBe(false);

  act(() => {
    mockSnapshot.autoReadActive = true;
    mockSnapshotListener?.();
  });
  expect(result.active).toBe(true);

  const tap = (payload: string) => mockTagListener?.({ success: true, type: 'external', payload });
  tap('tok-1');
  tap('tok-1');
  tap('tok-2');
  mockTagListener?.({ success: false, error: 'No NDEF data on tag' });
  expect(onToken.mock.calls).toEqual([['tok-1'], ['tok-2']]);

  rerender(false);
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(result.active).toBe(false);
});

it('cleans up on unmount', () => {
  const { unmount } = setup(true, jest.fn());
  unmount();
  expect(mockStop).toHaveBeenCalledTimes(1);
});

it('is a no-op on iOS', () => {
  mockPlatform.OS = 'ios';
  const { result } = setup(true, jest.fn());
  expect(nfcService.startAutoRead).not.toHaveBeenCalled();
  expect(result.active).toBe(false);
});
