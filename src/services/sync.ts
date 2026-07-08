import NetInfo from '@react-native-community/netinfo';
import { asyncStorage, STORAGE_KEYS } from './storage';
import { api } from './api';
import type { Event, Participant, PendingScan, RemoteScan } from '../types';

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

  async getStatus(): Promise<SyncStatus> {
    const netInfo = await NetInfo.fetch();
    const pendingScans = await this.getPendingScans();
    const lastSyncAt = await asyncStorage.get<string>(STORAGE_KEYS.LAST_SYNC);

    return {
      isOnline: netInfo.isConnected ?? false,
      isSyncing: this.isSyncing,
      pendingScans: pendingScans.length,
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

  async cacheEvents(events: Event[]): Promise<void> {
    await asyncStorage.set(STORAGE_KEYS.EVENTS, events);
  }

  async getCachedEvents(): Promise<Event[]> {
    return (await asyncStorage.get<Event[]>(STORAGE_KEYS.EVENTS)) ?? [];
  }

  async cacheParticipants(eventId: string, participants: Participant[]): Promise<void> {
    await asyncStorage.set(STORAGE_KEYS.PARTICIPANTS(eventId), participants);
  }

  async getCachedParticipants(eventId: string): Promise<Participant[]> {
    return (await asyncStorage.get<Participant[]>(STORAGE_KEYS.PARTICIPANTS(eventId))) ?? [];
  }

  async setCurrentEvent(event: Event | null): Promise<void> {
    if (event) {
      await asyncStorage.set(STORAGE_KEYS.CURRENT_EVENT, event);
    } else {
      await asyncStorage.remove(STORAGE_KEYS.CURRENT_EVENT);
    }
  }

  async getCurrentEvent(): Promise<Event | null> {
    return asyncStorage.get<Event>(STORAGE_KEYS.CURRENT_EVENT);
  }

  async getPendingScans(): Promise<PendingScan[]> {
    return (await asyncStorage.get<PendingScan[]>(STORAGE_KEYS.PENDING_SCANS)) ?? [];
  }

  async addPendingScan(scan: PendingScan): Promise<void> {
    const pending = await this.getPendingScans();
    pending.push(scan);
    await asyncStorage.set(STORAGE_KEYS.PENDING_SCANS, pending);
    await this.notifyListeners();
  }

  async removePendingScans(localIds: string[]): Promise<void> {
    const pending = await this.getPendingScans();
    const filtered = pending.filter(s => !localIds.includes(s.localId));
    await asyncStorage.set(STORAGE_KEYS.PENDING_SCANS, filtered);
    await this.notifyListeners();
  }

  async syncPendingScans(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) {
      return { synced: 0, failed: 0 };
    }

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    await this.notifyListeners();

    const pending = await this.getPendingScans();
    let synced = 0;
    let failed = 0;
    const syncedIds: string[] = [];

    const scansByEvent = new Map<string, PendingScan[]>();
    for (const scan of pending) {
      const existing = scansByEvent.get(scan.eventId) ?? [];
      existing.push(scan);
      scansByEvent.set(scan.eventId, existing);
    }

    for (const [eventId, scans] of scansByEvent) {
      try {
        await api.syncScans(
          eventId,
          scans.map(s => ({
            participantId: s.participantId,
            scannedAt: s.scannedAt,
          }))
        );
        synced += scans.length;
        syncedIds.push(...scans.map(s => s.localId));
      } catch {
        for (const scan of scans) {
          try {
            await api.createScan(eventId, scan.participantId);
            synced++;
            syncedIds.push(scan.localId);
          } catch {
            failed++;
          }
        }
      }
    }

    if (syncedIds.length > 0) {
      await this.removePendingScans(syncedIds);
    }

    await asyncStorage.set(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

    this.isSyncing = false;
    await this.notifyListeners();

    return { synced, failed };
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
  async syncScans(eventId: string): Promise<RemoteScan[]> {
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
    await asyncStorage.set(STORAGE_KEYS.SCANS(eventId), scans);
    if (cursor) {
      await asyncStorage.set(STORAGE_KEYS.SCAN_SYNC_CURSOR(eventId), cursor);
    }
    return scans;
  }

  async syncAll(eventId: string): Promise<void> {
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      throw new Error('No network connection');
    }

    this.isSyncing = true;
    await this.notifyListeners();

    try {
      const [events, participants] = await Promise.all([
        api.getEvents(),
        api.getParticipants(eventId),
      ]);

      await this.cacheEvents(events);
      await this.cacheParticipants(eventId, participants);
      await this.syncPendingScans();

      try {
        await this.syncScans(eventId);
      } catch (error) {
        console.warn('[Sync] Scan sync failed:', error);
      }

      await asyncStorage.set(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    } finally {
      this.isSyncing = false;
      await this.notifyListeners();
    }
  }

  async refreshParticipants(eventId: string): Promise<Participant[]> {
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      return this.getCachedParticipants(eventId);
    }

    try {
      const participants = await api.getParticipants(eventId);
      await this.cacheParticipants(eventId, participants);
      return participants;
    } catch {
      return this.getCachedParticipants(eventId);
    }
  }

  async clear(): Promise<void> {
    const keys = await asyncStorage.getAllKeys();
    for (const key of keys) {
      if (
        key.startsWith('participants_') ||
        key.startsWith('scans_') ||
        key.startsWith('scan_sync_cursor_') ||
        key === STORAGE_KEYS.PENDING_SCANS ||
        key === STORAGE_KEYS.LAST_SYNC ||
        key === STORAGE_KEYS.EVENTS ||
        key === STORAGE_KEYS.CURRENT_EVENT
      ) {
        await asyncStorage.remove(key);
      }
    }
    await this.notifyListeners();
  }
}

export const syncService = new SyncService();
