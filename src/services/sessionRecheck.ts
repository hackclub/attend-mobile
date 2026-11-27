import type { SessionValidation } from './auth';

// A restored session whose /me check couldn't be completed (offline, server
// error) is checked again on reconnect and on returning to the foreground,
// at most once per interval, so a token revoked meanwhile still signs out.
export const SESSION_RECHECK_MIN_INTERVAL_MS = 60_000;

export interface SessionRecheckOptions {
  validate: (token: string) => Promise<SessionValidation>;
  /** Called with each recheck's outcome, for the token it checked. */
  onOutcome: (token: string, outcome: SessionValidation) => void;
  minIntervalMs?: number;
  now?: () => number;
}

export interface SessionRecheck {
  /** Records a check's outcome: only `unverified` leaves a recheck pending. */
  record: (token: string, outcome: SessionValidation) => void;
  /** Nothing to recheck (signed out, or signed in afresh). */
  clear: () => void;
  /** Reconnected or foregrounded: recheck now, or once the interval allows. */
  trigger: () => void;
  dispose: () => void;
}

export function createSessionRecheck({
  validate,
  onOutcome,
  minIntervalMs = SESSION_RECHECK_MIN_INTERVAL_MS,
  now = Date.now,
}: SessionRecheckOptions): SessionRecheck {
  let pendingToken: string | null = null;
  let lastAttemptAt: number | null = null;
  let running = false;
  let deferred: ReturnType<typeof setTimeout> | null = null;

  const cancelDeferred = () => {
    if (deferred) clearTimeout(deferred);
    deferred = null;
  };

  const run = () => {
    const token = pendingToken;
    if (!token || running) return;
    running = true;
    lastAttemptAt = now();
    void validate(token)
      .catch((): SessionValidation => ({ status: 'unverified' }))
      .then((outcome) => {
        running = false;
        // Signed out or in again meanwhile: the answer is for another session.
        if (pendingToken !== token) return;
        record(token, outcome);
        onOutcome(token, outcome);
      });
  };

  const trigger = () => {
    if (!pendingToken || running || deferred) return;
    const wait = lastAttemptAt === null ? 0 : lastAttemptAt + minIntervalMs - now();
    if (wait <= 0) {
      run();
      return;
    }
    // Too soon after the last try: try once more when the interval is up,
    // since a reconnect inside it won't be announced again.
    deferred = setTimeout(() => {
      deferred = null;
      run();
    }, wait);
  };

  const record = (token: string, outcome: SessionValidation) => {
    if (outcome.status === 'unverified') {
      pendingToken = token;
    } else {
      pendingToken = null;
      cancelDeferred();
    }
  };

  return {
    record,
    clear: () => {
      pendingToken = null;
      cancelDeferred();
    },
    trigger,
    dispose: cancelDeferred,
  };
}
