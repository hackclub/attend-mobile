import { ScannerPowerController, type ScannerPowerDependencies } from '../scannerPower';

function powerDependencies(currentBrightness = 0.8): jest.Mocked<ScannerPowerDependencies> {
  return {
    getBrightness: jest.fn().mockResolvedValue(currentBrightness),
    setBrightness: jest.fn().mockResolvedValue(undefined),
    restoreBrightness: jest.fn().mockResolvedValue(undefined),
    activateKeepAwake: jest.fn().mockResolvedValue(undefined),
    deactivateKeepAwake: jest.fn().mockResolvedValue(undefined),
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ScannerPowerController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the device awake, dims after idle, and restores on activity', async () => {
    const dependencies = powerDependencies(0.8);
    const controller = new ScannerPowerController(dependencies, {
      idleMs: 30_000,
      dimLevel: 0.2,
    });

    await controller.enable();
    expect(dependencies.activateKeepAwake).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(30_000);
    await flushPromises();
    expect(dependencies.setBrightness).toHaveBeenCalledWith(0.2);

    await controller.recordActivity();
    expect(dependencies.setBrightness).toHaveBeenLastCalledWith(0.8);
  });

  it('never brightens a screen that was already below the dim ceiling', async () => {
    const dependencies = powerDependencies(0.12);
    const controller = new ScannerPowerController(dependencies, {
      idleMs: 30_000,
      dimLevel: 0.2,
    });

    await controller.enable();
    jest.advanceTimersByTime(30_000);
    await flushPromises();

    expect(dependencies.setBrightness).toHaveBeenCalledWith(0.12);
  });

  it.each(['disable', 'background', 'dispose'] as const)(
    'restores brightness and auto-lock behavior on %s',
    async action => {
      const dependencies = powerDependencies(0.7);
      const controller = new ScannerPowerController(dependencies, {
        idleMs: 30_000,
        dimLevel: 0.2,
      });
      await controller.enable();

      await controller[action]();

      expect(dependencies.restoreBrightness).toHaveBeenCalledWith(0.7);
      expect(dependencies.deactivateKeepAwake).toHaveBeenCalledTimes(1);
    }
  );

  it('pairs native activation and cleanup only once', async () => {
    const dependencies = powerDependencies();
    const controller = new ScannerPowerController(dependencies, {
      idleMs: 30_000,
      dimLevel: 0.2,
    });

    await controller.enable();
    await controller.enable();
    await controller.disable();
    await controller.dispose();

    expect(dependencies.activateKeepAwake).toHaveBeenCalledTimes(1);
    expect(dependencies.deactivateKeepAwake).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-flight idle dim before restoring brightness', async () => {
    let finishDim: (() => void) | undefined;
    const dependencies = powerDependencies(0.75);
    dependencies.setBrightness.mockImplementation(() => new Promise<void>(resolve => {
      finishDim = resolve;
    }));
    const controller = new ScannerPowerController(dependencies, {
      idleMs: 30_000,
      dimLevel: 0.2,
    });

    await controller.enable();
    jest.advanceTimersByTime(30_000);
    await flushPromises();

    const disabling = controller.disable();
    expect(dependencies.restoreBrightness).not.toHaveBeenCalled();
    finishDim?.();
    await disabling;

    expect(dependencies.restoreBrightness).toHaveBeenCalledWith(0.75);
  });

  it('serializes activity behind an in-flight dim and restores immediately', async () => {
    let finishDim: (() => void) | undefined;
    const dependencies = powerDependencies(0.75);
    dependencies.setBrightness
      .mockImplementationOnce(() => new Promise<void>(resolve => {
        finishDim = resolve;
      }))
      .mockResolvedValueOnce(undefined);
    const controller = new ScannerPowerController(dependencies, {
      idleMs: 30_000,
      dimLevel: 0.2,
    });

    await controller.enable();
    jest.advanceTimersByTime(30_000);
    await flushPromises();

    const activity = controller.recordActivity();
    expect(dependencies.setBrightness).toHaveBeenCalledTimes(1);
    finishDim?.();
    await activity;

    expect(dependencies.setBrightness).toHaveBeenLastCalledWith(0.75);
  });
});
