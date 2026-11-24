import { api } from './api';
import type { CheckinCodeMaterial } from './signedTicket';
import { asyncStorage, STORAGE_KEYS } from './storage';

export interface StoredCheckinCodes {
  material: CheckinCodeMaterial;
  // When it came from Attend, so a copy too old to trust can be told apart.
  fetchedAt: number;
}

// The keys and cancelled list, kept per event so the scanner can check codes
// with no connection. Refreshed whenever the scanner opens online.
export const checkinCodes = {
  async cached(eventId: string): Promise<StoredCheckinCodes | null> {
    const stored = await asyncStorage.get<StoredCheckinCodes>(STORAGE_KEYS.CHECKIN_CODES(eventId));
    return stored?.material && typeof stored.fetchedAt === 'number' ? stored : null;
  },

  async refresh(eventId: string): Promise<StoredCheckinCodes> {
    const stored = { material: await api.getCheckinCodes(eventId), fetchedAt: Date.now() };
    await asyncStorage.set(STORAGE_KEYS.CHECKIN_CODES(eventId), stored);
    return stored;
  },
};
