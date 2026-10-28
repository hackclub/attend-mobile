import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../services/biometric', () => ({
  biometricService: {
    isAvailable: jest.fn().mockResolvedValue(true),
    getBiometricTypeName: jest.fn().mockResolvedValue('Face ID'),
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
  jest.mocked(biometricService.getBiometricTypeName).mockResolvedValue('Face ID');
});

describe('useBiometric', () => {
  it('reports what the device offers', async () => {
    const hook = await renderHook();

    expect(hook.isAvailable).toBe(true);
    expect(hook.biometricType).toBe('Face ID');
  });

  it('offers no way to turn protection off', async () => {
    const hook = await renderHook();

    expect(hook).not.toHaveProperty('toggleEnabled');
    expect(hook).not.toHaveProperty('isEnabled');
  });

  it('runs every unlock through the service', async () => {
    jest.mocked(biometricService.authenticate).mockResolvedValue(false);
    const hook = await renderHook();

    let result: boolean | undefined;
    await act(async () => {
      result = await hook.authenticate('Authenticate to view participant details');
    });

    expect(biometricService.authenticate)
      .toHaveBeenCalledWith('Authenticate to view participant details');
    expect(result).toBe(false);
  });
});
