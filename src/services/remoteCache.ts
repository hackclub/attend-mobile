/**
 * The last answer for each remote panel (an event's incidents, messages,
 * travel), so a screen shows it at once and refreshes behind it, and a load
 * started early (as a switch begins) is shared with the screen that then asks.
 *
 * In memory only, and cleared on sign-out: incidents are safeguarding data,
 * which stays off the disk. Keeps the most recently used few events' worth.
 */

/** About eight events' panels. */
const MAX_ENTRIES = 24;

export class RemoteCache {
  private values = new Map<string, unknown>();
  private inflight = new Map<string, Promise<unknown>>();
  // Bumped by clear(), so an answer for a signed-out session isn't kept.
  private generation = 0;

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  /**
   * Loads `key`, or joins the load already running for it, and remembers the
   * answer. A failure leaves whatever was remembered in place.
   */
  load<T>(key: string, load: () => Promise<T>): Promise<T> {
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const generation = this.generation;
    const request: Promise<T> = load()
      .then((value) => {
        if (generation === this.generation) this.remember(key, value);
        return value;
      })
      .finally(() => {
        if (this.inflight.get(key) === request) this.inflight.delete(key);
      });
    this.inflight.set(key, request);
    return request;
  }

  /** Drops one answer, e.g. once the role can no longer see it. */
  forget(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.generation += 1;
    this.values.clear();
    this.inflight.clear();
  }

  private remember(key: string, value: unknown): void {
    // Re-inserted, so the map's order is least recently loaded first.
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > MAX_ENTRIES) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
  }
}

export const remoteCache = new RemoteCache();
