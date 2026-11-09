import NetInfo from '@react-native-community/netinfo';
import { asyncStorage, STORAGE_KEYS } from './storage';
import { api } from './api';
import { forbiddenParticipants } from './eventAccess';
import { mergeParticipant, mergeParticipants, type ParticipantUpdate } from './participantIndex';
import { PARTICIPANT_CACHE_VERSION, slimParticipants } from './participantCache';
import { scanQueue } from './scanQueue';
import type { Event, Participant, RemoteScan, ScanContext } from '../types';

// Upper bound on pages per sync pass; at 500 scans/page this covers 50k
// scans while still terminating if the server misbehaves.
const MAX_SCAN_SYNC_PAGES = 100;

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingScans: number;
  lastSyncAt: string | null;
}

class SyncService {
  private isSyncing = false;
  private listeners: Set<(status: SyncStatus) => void> = new Set();
  private participantCacheQueues = new Map<string, Promise<unknown>>();
  private cacheGeneration = 0;
  private cacheWriteQueue: Promise<void> = Promise.resolve();
  private participantCacheMigration: Promise<void> | null = null;

  constructor() {
    // Queued scans feed pendingScans, and a scan confirmed by a later flush
    // updates the cached roster just like a live one.
    scanQueue.subscribe(event => {
      if (event.type === 'changed') {
        void this.notifyListeners().catch(() => undefined);
      } else if (event.type === 'confirmed') {
        void this.cacheConfirmedParticipant(event.eventId, event.response.participant)
          .catch(error => console.warn('[Sync] Failed to cache flushed scan participant:', error));
      }
    });
  }

  /**
   * Re-slims rosters written by builds that cached every participant field.
   * Runs once per install (tracked by a version key) before any roster read
   * or write, so a fat cache never survives an upgrade.
   */
  private migrateParticipantCache(): Promise<void> {
    this.participantCacheMigration ??= (async () => {
      const version = await asyncStorage.get<number>(STORAGE_KEYS.PARTICIPANT_CACHE_VERSION);
      if (version === PARTICIPANT_CACHE_VERSION) return;
      const keys = await asyncStorage.getAllKeys();
      for (const key of keys) {
        if (!key.startsWith('participants_')) continue;
        const cached = await asyncStorage.get<Participant[]>(key);
        if (Array.isArray(cached)) {
          await asyncStorage.set(key, slimParticipants(cached));
        } else {
          await asyncStorage.remove(key);
        }
      }
      await asyncStorage.set(STORAGE_KEYS.PARTICIPANT_CACHE_VERSION, PARTICIPANT_CACHE_VERSION);
    })().catch(error => {
      this.participantCacheMigration = null;
      console.warn('[Sync] Participant cache migration failed:', error);
    });
    return this.participantCacheMigration;
  }

  getCacheGeneration(): number {
    return this.cacheGeneration;
  }

  private enqueueCacheWrite(
    generation: number,
    operation: () => Promise<void>
  ): Promise<void> {
    const next = this.cacheWriteQueue.catch(() => undefined).then(async () => {
      if (generation !== this.cacheGeneration) return;
      await operation();
    });
    this.cacheWriteQueue = next.catch(() => undefined);
    return next;
  }

  private enqueueParticipantCache<T>(
    eventId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.participantCacheQueues.get(eventId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const tracked = next.finally(() => {
      if (this.participantCacheQueues.get(eventId) === tracked) {
        this.participantCacheQueues.delete(eventId);
      }
    });
    this.participantCacheQueues.set(eventId, tracked);
    return tracked;
  }

  async getStatus(): Promise<SyncStatus> {
    const [netInfo, lastSyncAt, pendingScans] = await Promise.all([
      NetInfo.fetch(),
      asyncStorage.get<string>(STORAGE_KEYS.LAST_SYNC),
      scanQueue.getPendingCount(),
    ]);

    return {
      isOnline: netInfo.isConnected ?? false,
      isSyncing: this.isSyncing,
      pendingScans,
      lastSyncAt,
    };
  }

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async notifyListeners(): Promise<void> {
    const status = await this.getStatus();
    this.listeners.forEach(listener => listener(status));
  }

  async cacheEvents(
    events: Event[],
    generation = this.cacheGeneration
  ): Promise<void> {
    await this.enqueueCacheWrite(generation, () =>
      asyncStorage.set(STORAGE_KEYS.EVENTS, events)
    );
  }

  async getCachedEvents(): Promise<Event[]> {
    const events = (await asyncStorage.get<Event[]>(STORAGE_KEYS.EVENTS)) ?? [];
    forbiddenParticipants.applyEventRoles(events);
    return events;
  }

  async cacheParticipants(eventId: string, participants: Participant[]): Promise<void> {
    const generation = this.cacheGeneration;
    await this.enqueueParticipantCache(eventId, async () => {
      await this.migrateParticipantCache();
      if (generation !== this.cacheGeneration) return;
      await asyncStorage.set(STORAGE_KEYS.PARTICIPANTS(eventId), slimParticipants(participants));
    });
  }

  async getCachedParticipants(eventId: string): Promise<Participant[]> {
    await this.migrateParticipantCache();
    const cached = await asyncStorage.get<Participant[]>(STORAGE_KEYS.PARTICIPANTS(eventId));
    return Array.isArray(cached) ? slimParticipants(cached) : [];
  }

  async cacheConfirmedParticipant(
    eventId: string,
    incoming: ParticipantUpdate
  ): Promise<Participant> {
    const generation = this.cacheGeneration;
    return this.enqueueParticipantCache(eventId, async () => {
      if (generation !== this.cacheGeneration) {
        throw new Error('Participant cache was cleared');
      }
      const cached = await this.getCachedParticipants(eventId);
      const current = cached.find(
        participant => participant.participant_event_id === incoming.participant_event_id
      );
      const merged = mergeParticipant(current, incoming);
      const participants = current
        ? cached.map(participant =>
            participant.participant_event_id === merged.participant_event_id ? merged : participant
          )
        : [...cached, merged];

      await asyncStorage.set(STORAGE_KEYS.PARTICIPANTS(eventId), slimParticipants(participants));
      return merged;
    });
  }

  private async mergeParticipantPage(
    eventId: string,
    incoming: Participant[],
    syncedAt: string,
    generation: number
  ): Promise<Participant[]> {
    return this.enqueueParticipantCache(eventId, async () => {
      if (generation !== this.cacheGeneration) {
        return this.getCachedParticipants(eventId);
      }
      const latest = await this.getCachedParticipants(eventId);
      const participants = slimParticipants(mergeParticipants(latest, incoming));
      await asyncStorage.set(STORAGE_KEYS.PARTICIPANTS(eventId), participants);
      if (syncedAt) {
        await asyncStorage.set(
          STORAGE_KEYS.PARTICIPANT_SYNC_CURSOR(eventId),
          syncedAt
        );
      }
      return participants;
    });
  }

  private async getLatestCachedParticipants(
    eventId: string,
    generation: number
  ): Promise<Participant[]> {
    return this.enqueueParticipantCache(eventId, async () => {
      if (generation !== this.cacheGeneration) return [];
      return this.getCachedParticipants(eventId);
    });
  }

  async cacheScanContexts(
    eventId: string,
    contexts: ScanContext[],
    generation = this.cacheGeneration
  ): Promise<void> {
    await this.enqueueCacheWrite(generation, () =>
      asyncStorage.set(STORAGE_KEYS.SCAN_CONTEXTS(eventId), contexts)
    );
  }

  async getCachedScanContexts(eventId: string): Promise<ScanContext[]> {
    return (await asyncStorage.get<ScanContext[]>(STORAGE_KEYS.SCAN_CONTEXTS(eventId))) ?? [];
  }

  async setCurrentEvent(
    event: Event | null,
    generation = this.cacheGeneration
  ): Promise<void> {
    await this.enqueueCacheWrite(generation, () => event
      ? asyncStorage.set(STORAGE_KEYS.CURRENT_EVENT, event)
      : asyncStorage.remove(STORAGE_KEYS.CURRENT_EVENT)
    );
  }

  async getCurrentEvent(): Promise<Event | null> {
    return asyncStorage.get<Event>(STORAGE_KEYS.CURRENT_EVENT);
  }

  async getCachedScans(eventId: string): Promise<RemoteScan[]> {
    return (await asyncStorage.get<RemoteScan[]>(STORAGE_KEYS.SCANS(eventId))) ?? [];
  }

  async getScanSyncCursor(eventId: string): Promise<string | null> {
    return asyncStorage.get<string>(STORAGE_KEYS.SCAN_SYNC_CURSOR(eventId));
  }

  /**
   * Incrementally sync scans from the server.
   *
   * When a cursor is stored, pages through GET /scans?since=<cursor> until
   * has_more is false, following synced_at as the next cursor. Pages within
   * a window are oldest-first; merging is by scan id, so ordering and
   * boundary-scan re-delivery are both harmless. The cursor is kept as the
   * verbatim server string to preserve fractional seconds.
   */
  async syncScans(
    eventId: string,
    generation = this.cacheGeneration
  ): Promise<RemoteScan[]> {
    const cached = await this.getCachedScans(eventId);
    const byId = new Map(cached.map(s => [s.id, s]));

    let cursor = await this.getScanSyncCursor(eventId);
    let hasMore = true;

    for (let page = 0; hasMore && page < MAX_SCAN_SYNC_PAGES; page++) {
      const response = await api.getScans(eventId, cursor ?? undefined);

      for (const scan of response.scans) {
        byId.set(scan.id, scan);
      }

      hasMore = !!cursor && response.has_more;
      if (response.synced_at) {
        if (hasMore && response.synced_at === cursor) {
          // Cursor didn't advance; bail rather than loop forever.
          break;
        }
        cursor = response.synced_at;
      } else {
        break;
      }
    }

    const scans = [...byId.values()];
    await this.enqueueCacheWrite(generation, async () => {
      await asyncStorage.set(STORAGE_KEYS.SCANS(eventId), scans);
      if (cursor) {
        await asyncStorage.set(STORAGE_KEYS.SCAN_SYNC_CURSOR(eventId), cursor);
      }
    });
    return scans;
  }

  /**
   * Sends the signed-in user's queued scans for every event, waiting at most
   * `timeoutMs` (the flush carries on in the background after that). Resolves
   * with how many are still waiting.
   */
  async flushQueuedScans(timeoutMs?: number): Promise<number> {
    const flush = scanQueue.flush();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (timeoutMs === undefined) {
        await flush;
      } else {
        await Promise.race([
          flush,
          new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs); }),
        ]);
      }
    } catch (error) {
      console.warn('[Sync] Scan queue flush failed:', error);
    } finally {
      if (timer) clearTimeout(timer);
    }
    return scanQueue.getPendingCount();
  }

  /**
   * Sends every queued scan (all events, not just this one), then pulls the
   * event list and, given an event, its roster and scans.
   */
  async syncAll(eventId?: string | null): Promise<void> {
    const generation = this.cacheGeneration;
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      throw new Error('No network connection');
    }

    this.isSyncing = true;
    await this.notifyListeners();

    try {
      // Push this device's offline scans before pulling, so the pulled
      // roster and scan list already include them. The pending count covers
      // every event, so the flush does too.
      await this.flushQueuedScans();

      const [events] = await Promise.all([
        api.getEvents(),
        eventId ? this.refreshParticipants(eventId, generation) : Promise.resolve([]),
      ]);

      await this.cacheEvents(events, generation);

      if (eventId) {
        try {
          await this.syncScans(eventId, generation);
        } catch (error) {
          console.warn('[Sync] Scan sync failed:', error);
        }
      }

      await this.enqueueCacheWrite(generation, () =>
        asyncStorage.set(STORAGE_KEYS.LAST_SYNC, new Date().toISOString())
      );
    } finally {
      this.isSyncing = false;
      await this.notifyListeners();
    }
  }

  /**
   * @param options.probeForbidden Ask again even for an event already known to
   *   refuse participants. Set only for an explicit, user-initiated refresh:
   *   it's the escape hatch for a server that reports no role, where a granted
   *   role would otherwise never be noticed.
   */
  async refreshParticipants(
    eventId: string,
    generation = this.cacheGeneration,
    options: { probeForbidden?: boolean } = {}
  ): Promise<Participant[]> {
    // A role without participant access gets the same answer every time, so
    // background sync must not keep asking. One user-initiated pull may.
    if (forbiddenParticipants.has(eventId) && !options.probeForbidden) {
      return this.getLatestCachedParticipants(eventId, generation);
    }

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      return this.getLatestCachedParticipants(eventId, generation);
    }

    try {
      const cursor = await asyncStorage.get<string>(STORAGE_KEYS.PARTICIPANT_SYNC_CURSOR(eventId));
      const response = await api.getParticipants(eventId, cursor ?? undefined);
      return this.mergeParticipantPage(
        eventId,
        response.participants,
        response.synced_at,
        generation
      );
    } catch {
      return this.getLatestCachedParticipants(eventId, generation);
    }
  }

  /**
   * Sign-out: wipes every cached roster, scan list, event and the current
   * event. Queued scans are deleted too unless `keepQueuedScans` is set (an
   * expired session): then they stay, tagged with their user, and are sent
   * only if that same user signs back in.
   */
  async clear({ keepQueuedScans = false }: { keepQueuedScans?: boolean } = {}): Promise<void> {
    this.cacheGeneration += 1;
    if (keepQueuedScans) {
      await scanQueue.setUser(null);
    } else {
      await scanQueue.clear().catch(error => console.warn('[Sync] Scan queue clear failed:', error));
      await scanQueue.setUser(null);
    }
    forbiddenParticipants.reset();
    await Promise.allSettled(this.participantCacheQueues.values());
    this.participantCacheQueues.clear();
    const clearOperation = this.cacheWriteQueue.catch(() => undefined).then(async () => {
      const keys = await asyncStorage.getAllKeys();
      for (const key of keys) {
        if (
          key.startsWith('participants_') ||
          key.startsWith('scans_') ||
          key.startsWith('scan_sync_cursor_') ||
          key.startsWith('participant_sync_cursor_') ||
          key.startsWith('scan_contexts_') ||
          key === STORAGE_KEYS.PENDING_SCANS ||
          key === STORAGE_KEYS.LAST_SYNC ||
          key === STORAGE_KEYS.EVENTS ||
          key === STORAGE_KEYS.CURRENT_EVENT
        ) {
          await asyncStorage.remove(key);
        }
      }
    });
    this.cacheWriteQueue = clearOperation.catch(() => undefined);
    await clearOperation;
    await this.notifyListeners();
  }
}

export const syncService = new SyncService();
