import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../services/biometric', () => {
  const listeners = new Set<() => void>();
  return {
    biometricService: {
      isSessionValid: jest.fn(() => false),
      authenticate: jest.fn(),
      onLock: jest.fn((listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
      clearSession: jest.fn(() => listeners.forEach((l) => l())),
    },
  };
});

import { biometricService } from '../../services/biometric';
import { useBiometricGate } from '../useBiometricGate';

type Gate = ReturnType<typeof useBiometricGate>;

let latest: Gate;
let root: renderer.ReactTestRenderer | undefined;

function Probe({ onRender }: { onRender: (gate: Gate) => void }) {
  onRender(useBiometricGate());
  return null;
}

async function mount() {
  await act(async () => {
    root = renderer.create(<Probe onRender={(gate) => { latest = gate; }} />);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(biometricService.isSessionValid).mockReturnValue(false);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

describe('useBiometricGate', () => {
  it('prompts on mount and unlocks on success', async () => {
    jest.mocked(biometricService.authenticate).mockResolvedValue(true);
    await mount();

    expect(biometricService.authenticate).toHaveBeenCalledTimes(1);
    expect(latest.status).toBe('unlocked');
  });

  it('opens straight away, without a prompt, while the session is valid', async () => {
    jest.mocked(biometricService.isSessionValid).mockReturnValue(true);
    await mount();

    expect(biometricService.authenticate).not.toHaveBeenCalled();
    expect(latest.status).toBe('unlocked');
  });

  it('stays locked when the prompt is cancelled', async () => {
    jest.mocked(biometricService.authenticate).mockResolvedValue(false);
    await mount();

    expect(latest.status).toBe('locked');
    expect(latest.isUnlocked).toBe(false);
  });

  it('fails closed when the prompt throws', async () => {
    jest.mocked(biometricService.authenticate).mockRejectedValue(new Error('no hardware'));
    await mount();

    expect(latest.status).toBe('locked');
  });

  it('locks again when the session ends, and unlocks only via Unlock', async () => {
    jest.mocked(biometricService.authenticate).mockResolvedValue(true);
    await mount();
    expect(latest.status).toBe('unlocked');

    await act(async () => {
      biometricService.clearSession();
    });
    expect(latest.status).toBe('locked');
    // No automatic re-prompt after a lock.
    expect(biometricService.authenticate).toHaveBeenCalledTimes(1);

    await act(async () => {
      await latest.unlock();
    });
    expect(latest.status).toBe('unlocked');
    expect(biometricService.authenticate).toHaveBeenCalledTimes(2);
  });

  it('lets an open prompt decide when a lock arrives mid-prompt', async () => {
    // Android's passcode screen backgrounds the app while the prompt runs.
    const pending = deferred<boolean>();
    jest.mocked(biometricService.authenticate).mockReturnValue(pending.promise);
    await mount();
    expect(latest.status).toBe('authenticating');

    await act(async () => {
      biometricService.clearSession();
    });
    expect(latest.status).toBe('authenticating');

    await act(async () => {
      pending.resolve(true);
    });
    expect(latest.status).toBe('unlocked');
  });

  it('runs only one prompt at a time', async () => {
    const pending = deferred<boolean>();
    jest.mocked(biometricService.authenticate).mockReturnValue(pending.promise);
    await mount();

    await act(async () => {
      void latest.unlock();
    });
    expect(biometricService.authenticate).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(false);
    });
    expect(latest.status).toBe('locked');
  });
});
