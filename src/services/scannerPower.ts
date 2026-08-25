export interface ScannerPowerDependencies {
  getBrightness(): Promise<number>;
  setBrightness(value: number): Promise<void>;
  restoreBrightness(originalValue: number): Promise<void>;
  activateKeepAwake(): Promise<void>;
  deactivateKeepAwake(): Promise<void>;
}

export interface ScannerPowerOptions {
  idleMs: number;
  dimLevel: number;
}

export class ScannerPowerController {
  private active = false;
  private dimmed = false;
  private originalBrightness: number | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dependencies: ScannerPowerDependencies,
    private readonly options: ScannerPowerOptions
  ) {}

  async enable(): Promise<void> {
    return this.enqueue(async () => {
      if (this.active) return;

      const originalBrightness = await this.dependencies.getBrightness();
      await this.dependencies.activateKeepAwake();
      this.originalBrightness = originalBrightness;
      this.active = true;
      this.scheduleIdleTimer();
    });
  }

  async recordActivity(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.active || this.originalBrightness === null) return;

      this.clearIdleTimer();
      if (this.dimmed) {
        await this.dependencies.setBrightness(this.originalBrightness);
        this.dimmed = false;
      }
      this.scheduleIdleTimer();
    });
  }

  async disable(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.active || this.originalBrightness === null) return;

      const originalBrightness = this.originalBrightness;
      this.active = false;
      this.originalBrightness = null;
      this.dimmed = false;
      this.clearIdleTimer();

      await Promise.allSettled([
        this.dependencies.restoreBrightness(originalBrightness),
        this.dependencies.deactivateKeepAwake(),
      ]);
    });
  }

  async background(): Promise<void> {
    await this.disable();
  }

  async dispose(): Promise<void> {
    await this.disable();
  }

  private scheduleIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      void this.enqueue(() => this.dimAfterIdle());
    }, this.options.idleMs);
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operationQueue.then(operation, operation);
    this.operationQueue = next.catch(() => undefined);
    return next;
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private async dimAfterIdle(): Promise<void> {
    if (!this.active || this.originalBrightness === null) return;

    const dimmedBrightness = Math.min(this.originalBrightness, this.options.dimLevel);
    try {
      await this.dependencies.setBrightness(dimmedBrightness);
      this.dimmed = this.active;
    } catch {
      this.dimmed = false;
    }
  }
}
