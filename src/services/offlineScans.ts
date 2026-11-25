import { api, ApiError } from './api';
import { isNetworkFailure } from './scannerCore';
import { asyncStorage, STORAGE_KEYS } from './storage';
import type { CreateScanResponse, ScanSource } from '../types';

// What the device could tell about the code when it saved the scan (see
// services/signedTicket). Kept so the list of waiting scans can say which
// ones were checked.
export type QueuedVerdict = 'valid' | 'cancelled' | 'unverified';

export interface QueuedScan {
  // Sent with every attempt: Attend answers a repeat with the scan it already
  // recorded, so a scan that got through just before the connection dropped
  // is never counted twice.
  clientScanId: string;
  // Who made the scan. Only they send it: if a session lapses and someone
  // else signs in, their login must not be the one recording these.
  userId: string;
  eventId: string;
  kind: 'participant' | 'badge';
  identifier: string;
  // The registration the code names, when the device could read it (a signed
  // ticket, or a cached attendee), for spotting the same person twice.
  registrationId?: string;
  scanContextId?: string;
  source: ScanSource;
  // When the scan happened, which Attend records rather than when it arrived.
  scannedAt: string;
  verdict: QueuedVerdict;
  // Server errors seen so far; see MAX_SERVER_FAILURES.
  failures: number;
  // Attend turned it down. Kept so staff see it, never sent again.
  rejected?: string;
}

// A scan the server keeps failing on (5xx) stops holding a place in the queue
// after this many tries, and is shown as rejected instead.
const MAX_SERVER_FAILURES = 5;

type SentListener = (scan: QueuedScan, response: CreateScanResponse) => void;

// Scans that couldn't be sent, kept on the device until they can. One list for
// every event, stored under pending_scans and cleared on sign-out.
export class OfflineScanQueue {
  private scans: QueuedScan[] | null = null;
  private userId: string | null = null;
  // Bumped by clear(), so a flush that was mid-request when someone signed
  // out can't write the list it read back over the cleared one.
  private generation = 0;
  private writes: Promise<unknown> = Promise.resolve();
  private flushing: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private sentListeners = new Set<SentListener>();

  // Every read-modify-write goes through here, so two at once can't lose one.
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writes.catch(() => undefined).then(operation);
    this.writes = next.catch(() => undefined);
    return next;
  }

  private async load(): Promise<QueuedScan[]> {
    if (!this.scans) {
      this.scans = (await asyncStorage.get<QueuedScan[]>(STORAGE_KEYS.PENDING_SCANS)) ?? [];
    }
    return this.scans;
  }

  private async save(scans: QueuedScan[]): Promise<void> {
    this.scans = scans;
    await asyncStorage.set(STORAGE_KEYS.PENDING_SCANS, scans);
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach(listener => listener());
  }

  // The person signed in now, or null. Scans are saved as theirs, and only
  // theirs are sent or counted.
  setUser(userId: string | null): void {
    if (this.userId === userId) return;
    this.userId = userId;
    this.notify();
  }

  enqueue(scan: Omit<QueuedScan, 'failures' | 'userId'>): Promise<void> {
    return this.serial(async () => {
      const userId = this.userId;
      if (!userId) throw new Error('No one is signed in to save this scan for.');
      const scans = await this.load();
      if (scans.some(existing => existing.clientScanId === scan.clientScanId)) return;
      await this.save([...scans, { ...scan, userId, failures: 0 }]);
    });
  }

  // The current user's scans, optionally for one event.
  async all(eventId?: string): Promise<QueuedScan[]> {
    return (await this.load()).filter(scan =>
      scan.userId === this.userId && (!eventId || scan.eventId === eventId)
    );
  }

  async pendingCount(): Promise<number> {
    return (await this.all()).filter(scan => !scan.rejected).length;
  }

  // A scan of the same person (or the same code) at the same scan point,
  // still waiting on this device.
  async findWaiting(match: {
    eventId: string;
    scanContextId?: string;
    identifier: string;
    registrationId?: string;
  }): Promise<QueuedScan | undefined> {
    return (await this.all(match.eventId)).find(scan =>
      !scan.rejected
      && scan.scanContextId === match.scanContextId
      && (
        scan.identifier === match.identifier
        || (!!match.registrationId && scan.registrationId === match.registrationId)
      )
    );
  }

  dismiss(clientScanId: string): Promise<void> {
    return this.serial(async () => {
      const scans = await this.load();
      await this.save(scans.filter(scan => scan.clientScanId !== clientScanId));
    });
  }

  private update(
    clientScanId: string,
    generation: number,
    change: (scan: QueuedScan) => QueuedScan | null
  ): Promise<void> {
    return this.serial(async () => {
      if (generation !== this.generation) return;
      const scans = await this.load();
      const next = scans.flatMap(scan => {
        if (scan.clientScanId !== clientScanId) return [scan];
        const changed = change(scan);
        return changed ? [changed] : [];
      });
      await this.save(next);
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Told about each queued scan Attend accepts, with its answer, so the
  // roster and recent scans can catch up.
  onSent(listener: SentListener): () => void {
    this.sentListeners.add(listener);
    return () => this.sentListeners.delete(listener);
  }

  // Sends what's waiting, oldest first. Stops at the first sign that the
  // connection (or the session) isn't there, and leaves the rest for next
  // time. Safe to call as often as you like; overlapping calls share one run.
  flush(): Promise<void> {
    this.flushing ??= this.run().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async run(): Promise<void> {
    const generation = this.generation;
    const userId = this.userId;
    if (!userId) return;

    const waiting = (await this.all())
      .filter(scan => !scan.rejected)
      .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));

    for (const scan of waiting) {
      if (generation !== this.generation || userId !== this.userId) return;
      try {
        const options = {
          scanContextId: scan.scanContextId,
          clientScanId: scan.clientScanId,
          source: scan.source,
          scannedAt: scan.scannedAt,
        };
        const response = scan.kind === 'badge'
          ? await api.createNfcScan(scan.eventId, scan.identifier, options)
          : await api.createScan(scan.eventId, scan.identifier, options);
        await this.update(scan.clientScanId, generation, () => null);
        if (generation === this.generation) {
          this.sentListeners.forEach(listener => listener(scan, response));
        }
      } catch (error) {
        const status = error instanceof ApiError ? error.status : null;
        // Offline, timed out, signed out, told to update the app, or rate
        // limited: none of it is this scan's fault, so try again later.
        if (isNetworkFailure(error) || status === null || status === 0 || status === 401 || status === 426 || status === 429) {
          return;
        }
        if (status >= 400 && status < 500) {
          const message = error instanceof Error ? error.message : 'Attend turned this scan down.';
          await this.update(scan.clientScanId, generation, current => ({ ...current, rejected: message }));
          continue;
        }
        await this.update(scan.clientScanId, generation, current => {
          const failures = current.failures + 1;
          return failures >= MAX_SERVER_FAILURES
            ? { ...current, failures, rejected: 'Attend kept failing on this scan.' }
            : { ...current, failures };
        });
      }
    }
  }

  // Sign-out: drops every saved scan, in turn with any write already queued,
  // and stops a flush in progress from writing anything back.
  clear(): Promise<void> {
    return this.serial(async () => {
      this.generation += 1;
      this.scans = [];
      await asyncStorage.remove(STORAGE_KEYS.PENDING_SCANS);
      this.notify();
    });
  }
}

export const offlineScans = new OfflineScanQueue();
