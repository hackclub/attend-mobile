import NetInfo from '@react-native-community/netinfo';
import { asyncStorage, STORAGE_KEYS } from './storage';
import { api } from './api';
import { mergeParticipant, mergeParticipants, type ParticipantUpdate } from './participantIndex';
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
    const netInfo = await NetInfo.fetch();
    const lastSyncAt = await asyncStorage.get<string>(STORAGE_KEYS.LAST_SYNC);

    return {
      isOnline: netInfo.isConnected ?? false,
      isSyncing: this.isSyncing,
      pendingScans: 0,
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
    return (await asyncStorage.get<Event[]>(STORAGE_KEYS.EVENTS)) ?? [];
  }

  async cacheParticipants(eventId: string, participants: Participant[]): Promise<void> {
    const generation = this.cacheGeneration;
    await this.enqueueParticipantCache(eventId, async () => {
      if (generation !== this.cacheGeneration) return;
      await asyncStorage.set(STORAGE_KEYS.PARTICIPANTS(eventId), participants);
    });
  }

  async getCachedParticipants(eventId: string): Promise<Participant[]> {
    return (await asyncStorage.get<Participant[]>(STORAGE_KEYS.PARTICIPANTS(eventId))) ?? [];
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

      await asyncStorage.set(STORAGE_KEYS.PARTICIPANTS(eventId), participants);
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
      const participants = mergeParticipants(latest, incoming);
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

  async syncAll(eventId: string): Promise<void> {
    const generation = this.cacheGeneration;
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      throw new Error('No network connection');
    }

    this.isSyncing = true;
    await this.notifyListeners();

    try {
      const [events] = await Promise.all([
        api.getEvents(),
        this.refreshParticipants(eventId, generation),
      ]);

      await this.cacheEvents(events, generation);

      try {
        await this.syncScans(eventId, generation);
      } catch (error) {
        console.warn('[Sync] Scan sync failed:', error);
      }

      await this.enqueueCacheWrite(generation, () =>
        asyncStorage.set(STORAGE_KEYS.LAST_SYNC, new Date().toISOString())
      );
    } finally {
      this.isSyncing = false;
      await this.notifyListeners();
    }
  }

  async refreshParticipants(
    eventId: string,
    generation = this.cacheGeneration
  ): Promise<Participant[]> {
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

  async clear(): Promise<void> {
    this.cacheGeneration += 1;
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
