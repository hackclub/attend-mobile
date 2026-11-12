import NfcManager, { NfcTech, Ndef, NfcEvents, TagEvent } from 'react-native-nfc-manager';
import { Platform } from 'react-native';

export interface NFCReadResult {
  success: boolean;
  type?: 'uri' | 'text' | 'external' | 'unknown';
  payload?: string;
  error?: string;
  tagId?: string;
}

export interface NFCWriteData {
  badgeUrl: string;
  attendToken: string;
}

/**
 * Progress of the current read/write. iOS shows its own "hold near reader"
 * sheet; Android has none, so the UI shows its own sheet from this state
 * (see `needsInAppPrompt`).
 */
export type NFCSessionState =
  | { status: 'idle' }
  | { status: 'waiting'; operation: 'read' | 'write' }
  | { status: 'success'; operation: 'read' | 'write' }
  | { status: 'error'; operation: 'read' | 'write'; error: string };

export interface NFCSnapshot {
  session: NFCSessionState;
  /** The NFC radio is switched on (always false before init / when unsupported). */
  adapterEnabled: boolean;
  /** Android only: background badge listening is registered and NFC is on. */
  autoReadActive: boolean;
}

/** NDEF external type that carries the Attend badge token. */
export const ATTEND_RECORD_TYPE = 'hackclub.com:attend';

const TNF_WELL_KNOWN = 0x01;
const TNF_EXTERNAL_TYPE = 0x04;

// android.nfc.NfcAdapter.FLAG_READER_NFC_A | _B | _F | _V. Reader mode stops
// Android's own tag dispatcher (and other apps) from grabbing the badge.
const ANDROID_READER_FLAGS = 0x1 | 0x2 | 0x4 | 0x8;
const ANDROID_READER_OPTIONS = {
  isReaderModeEnabled: true,
  readerModeFlags: ANDROID_READER_FLAGS,
};

function bytesToString(bytes: number[]): string {
  return bytes.map(b => String.fromCharCode(b)).join('');
}

function stringToBytes(str: string): number[] {
  return str.split('').map(c => c.charCodeAt(0));
}

function decodeUriPayload(payload: number[]): string {
  const prefixes: { [key: number]: string } = {
    0x00: '',
    0x01: 'http://www.',
    0x02: 'https://www.',
    0x03: 'http://',
    0x04: 'https://',
    0x05: 'tel:',
    0x06: 'mailto:',
  };
  return (prefixes[payload[0]] || '') + bytesToString(payload.slice(1));
}

function decodeTextPayload(payload: number[]): string {
  const langCodeLen = payload[0] & 0x3f;
  return bytesToString(payload.slice(1 + langCodeLen));
}

function asBytes(value: unknown): number[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Turns a tag's NDEF records into a read result. The Attend external record
 * wins; otherwise the first URI or text record; otherwise the first payload.
 */
export function parseNdefMessage(
  records: TagEvent['ndefMessage'] | null | undefined,
  tagId?: string
): NFCReadResult {
  if (!records || records.length === 0) {
    return { success: false, error: 'No NDEF data on tag', tagId };
  }

  for (const record of records) {
    const payload = asBytes(record.payload);
    if (payload.length === 0) continue;
    if (record.tnf === TNF_EXTERNAL_TYPE && bytesToString(asBytes(record.type)) === ATTEND_RECORD_TYPE) {
      return { success: true, type: 'external', payload: bytesToString(payload), tagId };
    }
  }

  for (const record of records) {
    const payload = asBytes(record.payload);
    if (payload.length === 0) continue;
    if (record.tnf !== TNF_WELL_KNOWN) continue;
    const type = bytesToString(asBytes(record.type));
    if (type === 'U') {
      return { success: true, type: 'uri', payload: decodeUriPayload(payload), tagId };
    }
    if (type === 'T') {
      return { success: true, type: 'text', payload: decodeTextPayload(payload), tagId };
    }
  }

  const first = asBytes(records[0].payload);
  if (first.length > 0) {
    return { success: true, type: 'unknown', payload: bytesToString(first), tagId };
  }

  return { success: false, error: 'Could not parse NDEF data', tagId };
}

/** What a badge tap hands to the scanner. */
export interface NFCBadgeRead {
  /** The Attend token, or the URI/text record's content. */
  payload: string;
  /**
   * True only for the `hackclub.com:attend` external record: the payload is a
   * badge token for the badge endpoint. A URI/text record is just content
   * (an attend://checkin/… link when it is an Attend badge at all) and must
   * be recognised by `parseQRCode` before it goes anywhere.
   */
  isBadge: boolean;
}

/**
 * The payload a badge tap hands to the scanner: the Attend token from the
 * external record, or else the URI/text record. Null when the tag carries
 * nothing Attend could use.
 */
export function badgeReadFromResult(result: NFCReadResult): NFCBadgeRead | null {
  if (!result.success || !result.payload) return null;
  if (result.type === 'external' || result.type === 'uri' || result.type === 'text') {
    const payload = result.payload.trim();
    return payload ? { payload, isBadge: result.type === 'external' } : null;
  }
  return null;
}

function isCancelled(message: string): boolean {
  return /cancel/i.test(message);
}

type Listener = (snapshot: NFCSnapshot) => void;
type AutoReadListener = (result: NFCReadResult) => void;

class NFCService {
  private isInitialized = false;
  private isSupported = false;
  private initPromise: Promise<boolean> | null = null;

  private snapshot: NFCSnapshot = {
    session: { status: 'idle' },
    adapterEnabled: false,
    autoReadActive: false,
  };
  private listeners = new Set<Listener>();

  // Android auto-read. Every change to the native tag registration runs
  // through `serial` so register/unregister calls never interleave.
  private autoReadListener: AutoReadListener | null = null;
  private autoReadRegistered = false;
  private queue: Promise<void> = Promise.resolve();

  // One-shot reads/writes run one at a time through `techQueue` (the native
  // module holds a single tech request). `techRequests` counts the running
  // one plus any waiting, so auto-read stays paused until the last finishes.
  private techRequests = 0;
  private techQueue: Promise<unknown> = Promise.resolve();

  /** Android has no system NFC sheet, so the app must show its own. */
  get needsInAppPrompt(): boolean {
    return Platform.OS === 'android';
  }

  init(): Promise<boolean> {
    if (this.isInitialized) return Promise.resolve(this.isSupported);
    if (!this.initPromise) {
      this.initPromise = this.doInit().finally(() => {
        this.initPromise = null;
      });
    }
    return this.initPromise;
  }

  private async doInit(): Promise<boolean> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      this.isInitialized = true;
      this.isSupported = false;
      return false;
    }
    try {
      this.isSupported = await NfcManager.isSupported();
      if (this.isSupported) {
        await NfcManager.start();
        if (Platform.OS === 'android') {
          NfcManager.setEventListener(NfcEvents.StateChanged, (evt: { state?: string }) => {
            this.handleAdapterState(evt?.state);
          });
        }
        await this.isEnabled();
      }
      this.isInitialized = true;
      return this.isSupported;
    } catch (error) {
      console.error('[NFC] Init error:', error);
      this.isInitialized = true;
      this.isSupported = false;
      return false;
    }
  }

  get supported(): boolean {
    return this.isSupported;
  }

  async isEnabled(): Promise<boolean> {
    if (!this.isSupported) return false;
    let enabled = false;
    try {
      enabled = await NfcManager.isEnabled();
    } catch {
      enabled = false;
    }
    this.update({ adapterEnabled: enabled });
    return enabled;
  }

  /** Android: opens the system NFC settings so the user can switch NFC on. */
  async openSettings(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      await NfcManager.goToNfcSetting();
    } catch {
      // No settings screen on this device.
    }
  }

  getSnapshot(): NFCSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Clears a finished success/error state (e.g. when the UI closes its sheet). */
  resetSession(): void {
    if (this.snapshot.session.status !== 'waiting') {
      this.update({ session: { status: 'idle' } });
    }
  }

  private update(patch: Partial<NFCSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    next.autoReadActive = this.autoReadRegistered && next.adapterEnabled;
    const prev = this.snapshot;
    if (
      prev.session === next.session &&
      prev.adapterEnabled === next.adapterEnabled &&
      prev.autoReadActive === next.autoReadActive
    ) return;
    this.snapshot = next;
    this.listeners.forEach(listener => listener(next));
  }

  private handleAdapterState(state: string | undefined): void {
    if (state === 'on') {
      this.update({ adapterEnabled: true });
      // Reader mode set while NFC was off may not have taken effect.
      if (this.autoReadListener) {
        this.serial(async () => {
          await this.unregisterAutoRead();
          await this.syncAutoRead();
        });
      }
    } else if (state === 'off' || state === 'turning_off') {
      this.update({ adapterEnabled: false });
    }
  }

  private serial(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  // ---------------------------------------------------------------------------
  // Auto-read (Android): continuous badge listening without a tech request.

  /**
   * Android only: listen for badge taps until the returned stop function is
   * called. Each tap is parsed with the same NDEF rules as `readTag`. Taps are
   * ignored while a `readTag`/`writeTag` is in progress. No-op elsewhere.
   */
  startAutoRead(listener: AutoReadListener): () => void {
    if (Platform.OS !== 'android') return () => {};
    this.autoReadListener = listener;
    this.serial(() => this.syncAutoRead());
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      if (this.autoReadListener !== listener) return;
      this.autoReadListener = null;
      this.serial(() => this.syncAutoRead());
    };
  }

  private handleDiscoveredTag = (tag: TagEvent | null | undefined) => {
    const listener = this.autoReadListener;
    if (!listener || this.techRequests > 0 || !tag) return;
    listener(parseNdefMessage(tag.ndefMessage, tag.id));
  };

  private async syncAutoRead(): Promise<void> {
    const wanted = !!this.autoReadListener && this.techRequests === 0;
    if (wanted && !this.autoReadRegistered) {
      if (!(await this.init())) return;
      try {
        NfcManager.setEventListener(NfcEvents.DiscoverTag, this.handleDiscoveredTag);
        await NfcManager.registerTagEvent(ANDROID_READER_OPTIONS);
        this.autoReadRegistered = true;
      } catch (error) {
        console.warn('[NFC] Could not start badge listening:', error);
        NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      }
      await this.isEnabled();
      this.update({});
    } else if (!wanted && this.autoReadRegistered) {
      await this.unregisterAutoRead();
    }
  }

  private async unregisterAutoRead(): Promise<void> {
    if (!this.autoReadRegistered) return;
    this.autoReadRegistered = false;
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    try {
      await NfcManager.unregisterTagEvent();
    } catch {
      // Already gone.
    }
    this.update({});
  }

  // ---------------------------------------------------------------------------
  // One-shot read / write.

  /**
   * Runs one tech request and publishes its outcome. On Android, auto-read is
   * paused for its duration: the library registers its own tag session for
   * the request and tears it down afterwards, which would otherwise drop ours.
   * The outcome is published before cleanup, which on Android waits ~1s so a
   * badge still on the phone is not handed to the system dispatcher.
   */
  private withTechRequest<T extends { success: boolean; error?: string }>(
    operation: 'read' | 'write',
    body: () => Promise<T>
  ): Promise<T | { success: false; error: string }> {
    this.techRequests += 1;
    const run = this.techQueue.then(() => this.runTechRequest(operation, body));
    this.techQueue = run.catch(() => undefined);
    return run;
  }

  private async runTechRequest<T extends { success: boolean; error?: string }>(
    operation: 'read' | 'write',
    body: () => Promise<T>
  ): Promise<T | { success: false; error: string }> {
    try {
      if (Platform.OS === 'android' && !(await this.init())) {
        return { success: false, error: 'NFC not supported on this device' };
      }
      this.update({ session: { status: 'waiting', operation } });
      try {
        if (Platform.OS === 'android') {
          await this.serial(() => this.unregisterAutoRead());
        }
        let result: T | { success: false; error: string };
        try {
          result = await body();
        } catch (error: any) {
          const message = error?.message || `NFC ${operation} failed`;
          result = { success: false, error: isCancelled(message) ? 'Cancelled' : message };
        }
        return this.finish(operation, result);
      } finally {
        await this.cleanup();
      }
    } finally {
      this.techRequests -= 1;
      if (Platform.OS === 'android' && this.techRequests === 0) {
        this.serial(() => this.syncAutoRead());
      }
    }
  }

  private finish<T extends { success: boolean; error?: string }>(
    operation: 'read' | 'write',
    result: T
  ): T {
    if (result.success) {
      this.update({ session: { status: 'success', operation } });
    } else if (result.error === 'Cancelled') {
      this.update({ session: { status: 'idle' } });
    } else {
      this.update({
        session: { status: 'error', operation, error: result.error || `NFC ${operation} failed` },
      });
    }
    return result;
  }

  readTag(): Promise<NFCReadResult> {
    return this.withTechRequest<NFCReadResult>('read', async () => {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: 'Hold your device near the NFC tag',
        ...ANDROID_READER_OPTIONS,
      });
      const tag = await NfcManager.getTag();
      if (!tag) return { success: false, error: 'No tag found' };
      return parseNdefMessage(tag.ndefMessage, tag.id);
    });
  }

  writeTag(data: NFCWriteData): Promise<{ success: boolean; error?: string }> {
    return this.withTechRequest('write', async () => {
      const bytes = encodeBadgeMessage(data);
      if (Platform.OS === 'android') {
        // Blank tags only expose NdefFormatable until they are formatted.
        const tech = await NfcManager.requestTechnology(
          [NfcTech.Ndef, NfcTech.NdefFormatable],
          ANDROID_READER_OPTIONS
        );
        if (tech === NfcTech.NdefFormatable) {
          await NfcManager.ndefFormatableHandlerAndroid.formatNdef(bytes);
          return { success: true };
        }
      } else {
        await NfcManager.requestTechnology(NfcTech.Ndef, {
          alertMessage: 'Hold your device near the NFC tag to write',
        });
      }
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
      return { success: true };
    });
  }

  async cancelOperation(): Promise<void> {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // Ignore cancel errors
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/** URI record (badge link) followed by the Attend external token record. */
export function encodeBadgeMessage(data: NFCWriteData): number[] {
  const uriRecord = Ndef.uriRecord(data.badgeUrl);
  const externalRecord = Ndef.record(
    Ndef.TNF_EXTERNAL_TYPE,
    ATTEND_RECORD_TYPE,
    [],
    stringToBytes(data.attendToken)
  );
  return Ndef.encodeMessage([uriRecord, externalRecord]);
}

export const nfcService = new NFCService();
