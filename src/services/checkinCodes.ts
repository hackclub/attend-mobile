import { api } from './api';
import type { CheckinCodeMaterial } from './signedTicket';
import { asyncStorage, STORAGE_KEYS } from './storage';

// The keys and cancelled list, kept per event so the scanner can check codes
// with no connection. Refreshed whenever the scanner opens online.
export const checkinCodes = {
  async cached(eventId: string): Promise<CheckinCodeMaterial | null> {
    return asyncStorage.get<CheckinCodeMaterial>(STORAGE_KEYS.CHECKIN_CODES(eventId));
  },

  async refresh(eventId: string): Promise<CheckinCodeMaterial> {
    const material = await api.getCheckinCodes(eventId);
    await asyncStorage.set(STORAGE_KEYS.CHECKIN_CODES(eventId), material);
    return material;
  },
};
