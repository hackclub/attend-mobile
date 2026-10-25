import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../services/biometric', () => ({
  biometricService: {
    isAvailable: jest.fn().mockResolvedValue(true),
    isEnabled: jest.fn().mockResolvedValue(true),
    getBiometricTypeName: jest.fn().mockResolvedValue('Face ID'),
    confirmIdentity: jest.fn(),
    setEnabled: jest.fn().mockResolvedValue(undefined),
    authenticate: jest.fn(),
    clearSession: jest.fn(),
  },
}));

import { biometricService } from '../../services/biometric';
import { useBiometric } from '../useBiometric';

type Hook = ReturnType<typeof useBiometric>;

async function renderHook(): Promise<Hook> {
  let latest: Hook | undefined;

  function Probe() {
    latest = useBiometric();
    return null;
  }

  await act(async () => {
    renderer.create(<Probe />);
  });

  return latest as Hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(biometricService.isAvailable).mockResolvedValue(true);
  jest.mocked(biometricService.isEnabled).mockResolvedValue(true);
  jest.mocked(biometricService.getBiometricTypeName).mockResolvedValue('Face ID');
});

describe('useBiometric.toggleEnabled', () => {
  it('keeps protection on when the prompt to turn it off is not passed', async () => {
    jest.mocked(biometricService.confirmIdentity).mockResolvedValue(false);
    const hook = await renderHook();

    let result: boolean | undefined;
    await act(async () => {
      result = await hook.toggleEnabled();
    });

    expect(biometricService.confirmIdentity).toHaveBeenCalledWith('Disable Face ID protection');
    expect(biometricService.setEnabled).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('turns protection off once the prompt is passed', async () => {
    jest.mocked(biometricService.confirmIdentity).mockResolvedValue(true);
    const hook = await renderHook();

    await act(async () => {
      await hook.toggleEnabled();
    });

    expect(biometricService.setEnabled).toHaveBeenCalledWith(false);
  });

  it('requires the prompt to turn protection on as well', async () => {
    jest.mocked(biometricService.isEnabled).mockResolvedValue(false);
    jest.mocked(biometricService.confirmIdentity).mockResolvedValue(false);
    const hook = await renderHook();

    await act(async () => {
      await hook.toggleEnabled();
    });

    expect(biometricService.confirmIdentity).toHaveBeenCalledWith('Enable Face ID protection');
    expect(biometricService.setEnabled).not.toHaveBeenCalled();
  });
});
