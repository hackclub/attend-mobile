import { asyncStorage } from './storage';
import type { Event } from '../types';

// Event ids whose participants API answered 403. Persisted so a cold start
// doesn't offer the roster tab for a second before the first refusal lands.
const FORBIDDEN_KEY = 'participants_forbidden_events';

// Roles that EventPolicy#api_participants? refuses outright. A "limited" user
// is *not* one of them: they get a payload with dates of birth and addresses
// omitted, which is why PII presence is a separate question from roster access.
const ROLES_WITHOUT_PARTICIPANT_RECORDS = ['read_only'];

/**
 * Whether this event's role includes participants' exact dates of birth and
 * addresses (home and travel pickup alike).
 *
 * Only an explicit false restricts. The field is absent on servers that predate
 * it and on events cached by an older build, and blanking every birthday for
 * every organizer on an older server would be far worse than the omission this
 * guards against.
 */
export function canViewParticipantPii(event?: Event | null): boolean {
  return event?.can_view_participant_pii !== false;
}

/** Whether this event's role is one the participants API refuses outright. */
export function roleAllowsParticipantRecords(event?: Event | null): boolean {
  const role = event?.role;
  if (!role) return true;
  return !ROLES_WITHOUT_PARTICIPANT_RECORDS.includes(role);
}

/**
 * A store of the events whose participant endpoints have answered 403.
 *
 * The declared role is the primary signal, but it only arrives with a fresh
 * events payload; an observed 403 covers older servers, roles this build
 * doesn't know, and access revoked mid-session. A later success clears the
 * flag, so regaining access needs no sign-out.
 */
class ForbiddenParticipantsStore {
  private ids = new Set<string>();
  private listeners = new Set<() => void>();
  // Bumped on every change so useSyncExternalStore has a stable snapshot to
  // compare; the Set itself is mutated in place.
  private version = 0;
  private hydrating: Promise<void> | null = null;

  has(eventId?: string | null): boolean {
    return !!eventId && this.ids.has(eventId);
  }

  getVersion(): number {
    return this.version;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reads the persisted set once per app launch. Safe to call repeatedly. */
  hydrate(): Promise<void> {
    this.hydrating ??= (async () => {
      const stored = await asyncStorage.get<string[]>(FORBIDDEN_KEY);
      if (!stored?.length) return;
      let changed = false;
      for (const id of stored) {
        if (!this.ids.has(id)) {
          this.ids.add(id);
          changed = true;
        }
      }
      if (changed) this.notify();
    })().catch(error => {
      console.warn('[Access] Failed to restore participant access flags:', error);
    });
    return this.hydrating;
  }

  mark(eventId: string): void {
    if (this.ids.has(eventId)) return;
    this.ids.add(eventId);
    this.notify();
    void this.persist();
  }

  clear(eventId: string): void {
    if (!this.ids.delete(eventId)) return;
    this.notify();
    void this.persist();
  }

  /**
   * Reconciles the flags against the roles the events payload declares.
   *
   * A declared role is authoritative in *both* directions: it marks an event
   * whose role has no participant access, and clears one whose role does. The
   * clear matters because a stale flag is otherwise unrecoverable — the sync
   * layer won't issue the participants request that would clear it, so a role
   * upgrade (or a flag left over from a previous role) would strand the user
   * behind an empty roster until they signed out.
   *
   * An event the payload reports no role for is left alone, so a 403 observed
   * against a server that predates the field still sticks.
   */
  applyEventRoles(events: Event[]): void {
    for (const event of events) {
      if (!event.role) continue;
      if (roleAllowsParticipantRecords(event)) {
        this.clear(event.id);
      } else {
        this.mark(event.id);
      }
    }
  }

  reset(): void {
    if (this.ids.size === 0) return;
    this.ids.clear();
    this.notify();
    void this.persist();
  }

  private notify(): void {
    this.version += 1;
    this.listeners.forEach(listener => listener());
  }

  private async persist(): Promise<void> {
    try {
      await asyncStorage.set(FORBIDDEN_KEY, [...this.ids]);
    } catch (error) {
      console.warn('[Access] Failed to persist participant access flags:', error);
    }
  }
}

export const forbiddenParticipants = new ForbiddenParticipantsStore();

/**
 * Whether participant records (roster, search, detail) are reachable for this
 * event. False when the declared role excludes them or the API has already
 * refused; screens use it to hide entry points instead of offering dead ends.
 */
export function canViewParticipantRecords(event?: Event | null): boolean {
  if (!event) return true;
  return roleAllowsParticipantRecords(event) && !forbiddenParticipants.has(event.id);
}
