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
  eventId: string;
  kind: 'participant' | 'badge';
  identifier: string;
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
    this.listeners.forEach(listener => listener());
  }

  enqueue(scan: Omit<QueuedScan, 'failures'>): Promise<void> {
    return this.serial(async () => {
      const scans = await this.load();
      if (scans.some(existing => existing.clientScanId === scan.clientScanId)) return;
      await this.save([...scans, { ...scan, failures: 0 }]);
    });
  }

  async all(eventId?: string): Promise<QueuedScan[]> {
    const scans = await this.load();
    return eventId ? scans.filter(scan => scan.eventId === eventId) : [...scans];
  }

  async pendingCount(): Promise<number> {
    return (await this.load()).filter(scan => !scan.rejected).length;
  }

  dismiss(clientScanId: string): Promise<void> {
    return this.serial(async () => {
      const scans = await this.load();
      await this.save(scans.filter(scan => scan.clientScanId !== clientScanId));
    });
  }

  private update(clientScanId: string, change: (scan: QueuedScan) => QueuedScan | null): Promise<void> {
    return this.serial(async () => {
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
    const waiting = (await this.load())
      .filter(scan => !scan.rejected)
      .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));

    for (const scan of waiting) {
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
        await this.update(scan.clientScanId, () => null);
        this.sentListeners.forEach(listener => listener(scan, response));
      } catch (error) {
        const status = error instanceof ApiError ? error.status : null;
        // Offline, timed out, signed out, told to update the app, or rate
        // limited: none of it is this scan's fault, so try again later.
        if (isNetworkFailure(error) || status === null || status === 0 || status === 401 || status === 426 || status === 429) {
          return;
        }
        if (status >= 400 && status < 500) {
          const message = error instanceof Error ? error.message : 'Attend turned this scan down.';
          await this.update(scan.clientScanId, current => ({ ...current, rejected: message }));
          continue;
        }
        await this.update(scan.clientScanId, current => {
          const failures = current.failures + 1;
          return failures >= MAX_SERVER_FAILURES
            ? { ...current, failures, rejected: 'Attend kept failing on this scan.' }
            : { ...current, failures };
        });
      }
    }
  }

  // After sign-out, which deletes pending_scans along with the other caches.
  forget(): void {
    this.scans = null;
    this.listeners.forEach(listener => listener());
  }
}

export const offlineScans = new OfflineScanQueue();
