import NetInfo from '@react-native-community/netinfo';
import { api } from './api';
import { asyncStorage, STORAGE_KEYS } from './storage';
import { responseOutcome } from './scannerCore';
import type { CreateScanResponse, ScanSource } from '../types';

/**
 * Durable queue for scans made while Attend can't be reached.
 *
 * Each event has its own oldest-first list in AsyncStorage, so queued scans
 * survive the app being killed. A flush sends them in order with their
 * original client_scan_id and scanned_at; the server deduplicates on
 * client_scan_id, so resending a scan it already recorded is safe and comes
 * back as already_scanned.
 *
 * - Server success (scanned or already_scanned) removes the item.
 * - A network failure, timeout, 401, 408, 429 or 5xx keeps it and stops the
 *   flush for that event, preserving order.
 * - Any other 4xx (participant not found, context deleted, forbidden) moves it
 *   to the event's failed list for the user to see. Nothing is dropped
 *   silently.
 *
 * Every item is tagged with the user who scanned it. Only the signed-in
 * user's items are counted or sent; setUser() discards anyone else's.
 */

export type QueuedScanKind = 'participant' | 'badge';

export interface QueuedScan {
  clientScanId: string;
  eventId: string;
  kind: QueuedScanKind;
  // participant_id for 'participant', the NFC badge token for 'badge'.
  identifier: string;
  scanContextId?: string;
  source: ScanSource;
  scannedAt: string;
  queuedAt: string;
  // From the cached roster when known; used only for local duplicate checks.
  participantEventId?: string;
  attempts: number;
  lastError?: string;
  // The signed-in user who made the scan. Missing only on items queued by
  // builds that didn't tag them.
  userId?: string;
}

export type EnqueueInput = Omit<QueuedScan, 'queuedAt' | 'attempts' | 'lastError' | 'userId'>;

export interface FailedScan extends QueuedScan {
  error: string;
  status?: number;
  failedAt: string;
}

export interface FlushReport {
  eventId: string;
  // Recorded by the server as a new scan.
  scanned: number;
  // Resolved as a repeat (including a resend of a scan the server already had).
  alreadyScanned: number;
  // Permanently rejected during this flush; also kept in getFailed().
  failed: FailedScan[];
  // Still queued after this flush.
  remaining: number;
  // True when the flush stopped because Attend could not be reached.
  offline: boolean;
}

export type ScanQueueEvent =
  | { type: 'changed'; eventId: string; pending: number; failed: number }
  | { type: 'confirmed'; eventId: string; item: QueuedScan; response: CreateScanResponse }
  | { type: 'flushed'; reports: FlushReport[] };

export type ScanQueueListener = (event: ScanQueueEvent) => void;

// React Native's AppState, passed in so this module stays free of
// react-native imports (and loadable in plain Jest).
export interface AppStateSource {
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

const QUEUE_PREFIX = 'scan_queue_';
const FAILED_PREFIX = 'scan_queue_failed_';
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const status = Number((error as { status: unknown }).status);
  return Number.isFinite(status) ? status : null;
}

/**
 * A rejection the server will give again for the same request. Everything
 * else (network errors, timeouts, an expired session, rate limits, server
 * errors, anything unrecognised) is worth retrying later.
 */
export function isPermanentRejection(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === null) return false;
  if (status < 400 || status >= 500) return false;
  return status !== 401 && status !== 408 && status !== 429;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Scan was rejected.';
}

function sameRequest(item: QueuedScan, other: { identifier: string; participantEventId?: string }): boolean {
  if (item.identifier === other.identifier) return true;
  return !!item.participantEventId && item.participantEventId === other.participantEventId;
}

export class ScanQueue {
  private listeners = new Set<ScanQueueListener>();
  private lock: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private flushing: Promise<FlushReport[]> | null = null;
  private flushRequested = false;
  private started = 0;
  private stopListeners: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveOfflineFlushes = 0;
  private wasConnected: boolean | null = null;
  private userId: string | null = null;

  private ownedBy(userId: string | null) {
    return (item: QueuedScan) => !!userId && item.userId === userId;
  }

  // Serialises every read-modify-write of queue storage.
  private withLock<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.lock.catch(() => undefined).then(operation);
    this.lock = next.catch(() => undefined);
    return next;
  }

  private async read(eventId: string): Promise<QueuedScan[]> {
    const items = await asyncStorage.get<QueuedScan[]>(STORAGE_KEYS.SCAN_QUEUE(eventId));
    return Array.isArray(items) ? items : [];
  }

  private async readFailed(eventId: string): Promise<FailedScan[]> {
    const items = await asyncStorage.get<FailedScan[]>(STORAGE_KEYS.SCAN_QUEUE_FAILED(eventId));
    return Array.isArray(items) ? items : [];
  }

  private async write(eventId: string, items: QueuedScan[]): Promise<void> {
    if (items.length === 0) {
      await asyncStorage.remove(STORAGE_KEYS.SCAN_QUEUE(eventId));
    } else {
      await asyncStorage.set(STORAGE_KEYS.SCAN_QUEUE(eventId), items);
    }
  }

  private async writeFailed(eventId: string, items: FailedScan[]): Promise<void> {
    if (items.length === 0) {
      await asyncStorage.remove(STORAGE_KEYS.SCAN_QUEUE_FAILED(eventId));
    } else {
      await asyncStorage.set(STORAGE_KEYS.SCAN_QUEUE_FAILED(eventId), items);
    }
  }

  private emit(event: ScanQueueEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('[ScanQueue] Listener failed:', error);
      }
    }
  }

  private async emitChanged(eventId: string): Promise<void> {
    const [pending, failed] = await Promise.all([this.getPending(eventId), this.getFailed(eventId)]);
    this.emit({ type: 'changed', eventId, pending: pending.length, failed: failed.length });
  }

  subscribe(listener: ScanQueueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Persists a scan for later delivery. Returns false when a scan with the
   * same client_scan_id is already queued or failed, so a retried enqueue
   * never sends the same scan twice.
   */
  async enqueue(input: EnqueueInput): Promise<boolean> {
    const generation = this.generation;
    const userId = this.userId;
    if (!userId) {
      console.warn('[ScanQueue] Not queueing a scan with nobody signed in');
      return false;
    }
    const added = await this.withLock(async () => {
      if (generation !== this.generation) return false;
      const [items, failed] = await Promise.all([
        this.read(input.eventId),
        this.readFailed(input.eventId),
      ]);
      if (
        items.some(item => item.clientScanId === input.clientScanId)
        || failed.some(item => item.clientScanId === input.clientScanId)
      ) {
        return false;
      }
      items.push({ ...input, queuedAt: new Date().toISOString(), attempts: 0, userId });
      await this.write(input.eventId, items);
      return true;
    });
    if (added) {
      await this.emitChanged(input.eventId);
      if (!this.retryTimer) this.scheduleRetry(BACKOFF_BASE_MS);
    }
    return added;
  }

  /**
   * Sets who is signed in. Items queued by anyone else are deleted, so they
   * can never be sent with this user's session. Untagged items from older
   * builds are adopted when `adoptUntagged` is set (a restored session: they
   * can only be this user's), and deleted otherwise. Pass null on sign-out to
   * stop sending without deleting anything.
   */
  async setUser(userId: string | null, { adoptUntagged = false }: { adoptUntagged?: boolean } = {}): Promise<void> {
    if (userId === this.userId && !adoptUntagged) return;
    if (userId !== this.userId) {
      // Stops a flush running for the previous user.
      this.generation += 1;
      this.clearRetry();
      this.consecutiveOfflineFlushes = 0;
    }
    this.userId = userId;
    if (!userId) return;

    const changed = await this.withLock(async () => {
      if (this.userId !== userId) return [];
      const ids = await this.queuedEventIds({ includeFailed: true });
      const touched: string[] = [];
      const keep = <T extends QueuedScan>(items: T[]): T[] => items.flatMap(item => {
        if (item.userId === userId) return [item];
        if (!item.userId && adoptUntagged) return [{ ...item, userId }];
        return [];
      });
      for (const eventId of ids) {
        const [items, failed] = await Promise.all([this.read(eventId), this.readFailed(eventId)]);
        const keptItems = keep(items);
        const keptFailed = keep(failed);
        const same = (a: QueuedScan[], b: QueuedScan[]) =>
          a.length === b.length && a.every((item, i) => item.userId === b[i].userId);
        if (same(items, keptItems) && same(failed, keptFailed)) continue;
        await this.write(eventId, keptItems);
        await this.writeFailed(eventId, keptFailed);
        touched.push(eventId);
      }
      return touched;
    });
    for (const eventId of changed) await this.emitChanged(eventId);
  }

  getUser(): string | null {
    return this.userId;
  }

  async getPending(eventId: string): Promise<QueuedScan[]> {
    return (await this.read(eventId)).filter(this.ownedBy(this.userId));
  }

  async getFailed(eventId: string): Promise<FailedScan[]> {
    return (await this.readFailed(eventId)).filter(this.ownedBy(this.userId));
  }

  /** Removes failed scans the user has seen: one by client_scan_id, or all. */
  async dismissFailed(eventId: string, clientScanId?: string): Promise<void> {
    await this.withLock(async () => {
      const failed = await this.readFailed(eventId);
      await this.writeFailed(
        eventId,
        clientScanId ? failed.filter(item => item.clientScanId !== clientScanId) : []
      );
    });
    await this.emitChanged(eventId);
  }

  private async queuedEventIds({ includeFailed = false }: { includeFailed?: boolean } = {}): Promise<string[]> {
    const keys = await asyncStorage.getAllKeys();
    const ids = new Set<string>();
    for (const key of keys) {
      if (key.startsWith(FAILED_PREFIX)) {
        if (includeFailed) ids.add(key.slice(FAILED_PREFIX.length));
      } else if (key.startsWith(QUEUE_PREFIX)) {
        ids.add(key.slice(QUEUE_PREFIX.length));
      }
    }
    return [...ids].sort();
  }

  /** The signed-in user's scans waiting to sync, across every event. */
  async getPendingCount(): Promise<number> {
    const eventIds = await this.queuedEventIds();
    const lists = await Promise.all(eventIds.map(eventId => this.getPending(eventId)));
    return lists.reduce((total, items) => total + items.length, 0);
  }

  /**
   * Whether this device already queued a scan of the same person in the same
   * context, for the offline "already scanned" hint.
   */
  async findQueuedScan(
    eventId: string,
    match: { identifier: string; participantEventId?: string; scanContextId?: string }
  ): Promise<QueuedScan | null> {
    const items = await this.getPending(eventId);
    return items.find(item =>
      (item.scanContextId ?? null) === (match.scanContextId ?? null) && sameRequest(item, match)
    ) ?? null;
  }

  private send(item: QueuedScan): Promise<CreateScanResponse> {
    const options = {
      scanContextId: item.scanContextId,
      clientScanId: item.clientScanId,
      source: item.source,
      scannedAt: item.scannedAt,
    };
    return item.kind === 'badge'
      ? api.createNfcScan(item.eventId, item.identifier, options)
      : api.createScan(item.eventId, item.identifier, options);
  }

  private async flushEvent(eventId: string, generation: number, userId: string): Promise<FlushReport> {
    const report: FlushReport = {
      eventId,
      scanned: 0,
      alreadyScanned: 0,
      failed: [],
      remaining: 0,
      offline: false,
    };

    for (;;) {
      if (generation !== this.generation) break;
      // Never another user's scan, even one setUser() hasn't purged yet.
      const item = (await this.read(eventId)).find(this.ownedBy(userId));
      if (!item) break;

      let response: CreateScanResponse;
      try {
        response = await this.send(item);
      } catch (error) {
        if (generation !== this.generation) break;
        if (isPermanentRejection(error)) {
          const failedItem: FailedScan = {
            ...item,
            attempts: item.attempts + 1,
            error: errorMessage(error),
            status: errorStatus(error) ?? undefined,
            failedAt: new Date().toISOString(),
          };
          await this.withLock(async () => {
            if (generation !== this.generation) return;
            const items = await this.read(eventId);
            await this.write(eventId, items.filter(i => i.clientScanId !== item.clientScanId));
            const failed = await this.readFailed(eventId);
            await this.writeFailed(eventId, [...failed, failedItem]);
          });
          report.failed.push(failedItem);
          await this.emitChanged(eventId);
          continue;
        }

        await this.withLock(async () => {
          if (generation !== this.generation) return;
          const items = await this.read(eventId);
          await this.write(eventId, items.map(i => i.clientScanId === item.clientScanId
            ? { ...i, attempts: i.attempts + 1, lastError: errorMessage(error) }
            : i));
        });
        report.offline = true;
        break;
      }

      if (generation !== this.generation) break;
      await this.withLock(async () => {
        if (generation !== this.generation) return;
        const items = await this.read(eventId);
        await this.write(eventId, items.filter(i => i.clientScanId !== item.clientScanId));
      });
      if (responseOutcome(response) === 'scanned') {
        report.scanned += 1;
      } else {
        report.alreadyScanned += 1;
      }
      this.emit({ type: 'confirmed', eventId, item, response });
      await this.emitChanged(eventId);
    }

    report.remaining = generation === this.generation
      ? (await this.read(eventId)).filter(this.ownedBy(userId)).length
      : 0;
    return report;
  }

  private async runFlush(eventId?: string): Promise<FlushReport[]> {
    const generation = this.generation;
    const userId = this.userId;
    if (!userId) return [];
    const eventIds = eventId ? [eventId] : await this.queuedEventIds();
    if (eventIds.length === 0) return [];

    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected === false) {
      const reports: FlushReport[] = [];
      for (const id of eventIds) {
        const remaining = (await this.read(id)).filter(this.ownedBy(userId)).length;
        if (remaining > 0) {
          reports.push({ eventId: id, scanned: 0, alreadyScanned: 0, failed: [], remaining, offline: true });
        }
      }
      return reports;
    }

    const reports: FlushReport[] = [];
    for (const id of eventIds) {
      reports.push(await this.flushEvent(id, generation, userId));
    }
    return reports;
  }

  /**
   * Sends queued scans, oldest first. Flushes one event, or every event with
   * queued scans. A call made while a flush runs waits for it and then runs
   * once more, so scans queued in the meantime are not missed.
   */
  async flush(eventId?: string): Promise<FlushReport[]> {
    if (this.flushing) {
      this.flushRequested = true;
      return this.flushing;
    }

    const run = (async () => {
      const reports = await this.runFlush(eventId);
      while (this.flushRequested) {
        this.flushRequested = false;
        // A request made mid-flush may be for any event: cover them all.
        reports.push(...await this.runFlush());
      }
      return reports;
    })();
    this.flushing = run;

    try {
      const reports = await run;
      if (reports.length > 0) this.emit({ type: 'flushed', reports });
      this.afterFlush(reports);
      return reports;
    } finally {
      if (this.flushing === run) this.flushing = null;
    }
  }

  private afterFlush(reports: FlushReport[]): void {
    const latest = new Map(reports.map(report => [report.eventId, report]));
    const remaining = [...latest.values()].some(report => report.remaining > 0);
    if (!remaining) {
      this.consecutiveOfflineFlushes = 0;
      this.clearRetry();
      return;
    }
    const progressed = reports.some(report => report.scanned + report.alreadyScanned > 0);
    this.consecutiveOfflineFlushes = progressed ? 0 : this.consecutiveOfflineFlushes + 1;
    const delay = Math.min(
      BACKOFF_BASE_MS * 2 ** Math.max(0, this.consecutiveOfflineFlushes - 1),
      BACKOFF_MAX_MS
    );
    this.scheduleRetry(delay);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  // Periodic retry while items remain; only runs between start() and stop().
  private scheduleRetry(delayMs: number): void {
    if (this.started === 0) return;
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush().catch(error => console.warn('[ScanQueue] Retry flush failed:', error));
    }, delayMs);
  }

  private triggerFlush(reason: string): void {
    void this.flush().catch(error => console.warn(`[ScanQueue] Flush on ${reason} failed:`, error));
  }

  /**
   * Starts automatic flushing: now, on reconnect, when the app returns to the
   * foreground, and periodically with backoff while scans remain. Returns a
   * function that stops it.
   */
  start(appState: AppStateSource): () => void {
    this.started += 1;
    if (this.started === 1) {
      const netUnsubscribe = NetInfo.addEventListener(state => {
        const connected = state.isConnected !== false;
        const reconnected = connected && this.wasConnected === false;
        this.wasConnected = connected;
        if (reconnected) {
          this.consecutiveOfflineFlushes = 0;
          this.triggerFlush('reconnect');
        }
      });
      const appStateSubscription = appState.addEventListener('change', state => {
        if (state === 'active') this.triggerFlush('foreground');
      });
      this.stopListeners = () => {
        netUnsubscribe();
        appStateSubscription.remove();
      };
      this.triggerFlush('start');
    }

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.stop();
    };
  }

  private stop(): void {
    this.started = Math.max(0, this.started - 1);
    if (this.started > 0) return;
    this.stopListeners?.();
    this.stopListeners = null;
    this.wasConnected = null;
    this.clearRetry();
  }

  /** Deletes every queued and failed scan. Call on logout. */
  async clear(): Promise<void> {
    this.generation += 1;
    this.clearRetry();
    this.consecutiveOfflineFlushes = 0;
    const eventIds = await this.withLock(async () => {
      const keys = await asyncStorage.getAllKeys();
      const ids = new Set<string>();
      for (const key of keys) {
        if (key.startsWith(FAILED_PREFIX)) {
          ids.add(key.slice(FAILED_PREFIX.length));
          await asyncStorage.remove(key);
        } else if (key.startsWith(QUEUE_PREFIX)) {
          ids.add(key.slice(QUEUE_PREFIX.length));
          await asyncStorage.remove(key);
        }
      }
      return [...ids];
    });
    for (const eventId of eventIds) {
      this.emit({ type: 'changed', eventId, pending: 0, failed: 0 });
    }
  }
}

export const scanQueue = new ScanQueue();
