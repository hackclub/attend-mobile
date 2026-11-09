const mockPlatform = { OS: 'android' };
jest.mock('react-native', () => ({ Platform: mockPlatform }));

const mockListeners: Record<string, ((evt: unknown) => void) | null> = {};
const mockNfc = {
  isSupported: jest.fn(),
  start: jest.fn(),
  isEnabled: jest.fn(),
  goToNfcSetting: jest.fn(),
  setEventListener: jest.fn((name: string, cb: ((evt: unknown) => void) | null) => {
    mockListeners[name] = cb;
  }),
  registerTagEvent: jest.fn(),
  unregisterTagEvent: jest.fn(),
  requestTechnology: jest.fn(),
  cancelTechnologyRequest: jest.fn(),
  getTag: jest.fn(),
  ndefHandler: { writeNdefMessage: jest.fn() },
  ndefFormatableHandlerAndroid: { formatNdef: jest.fn() },
};

jest.mock('react-native-nfc-manager', () => ({
  __esModule: true,
  default: mockNfc,
  NfcTech: { Ndef: 'Ndef', NdefFormatable: 'NdefFormatable' },
  NfcEvents: {
    DiscoverTag: 'NfcManagerDiscoverTag',
    StateChanged: 'NfcManagerStateChanged',
  },
  Ndef: {
    TNF_EXTERNAL_TYPE: 4,
    uriRecord: (uri: string) => ({ kind: 'uri', uri }),
    record: (tnf: number, type: string, id: number[], payload: number[]) => ({ tnf, type, id, payload }),
    encodeMessage: (records: unknown[]) => [records.length],
  },
}));

type NfcModule = typeof import('../nfc');

function load(os: 'ios' | 'android'): NfcModule {
  mockPlatform.OS = os;
  let mod: NfcModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../nfc');
  });
  return mod as NfcModule;
}

const bytes = (s: string) => s.split('').map(c => c.charCodeAt(0));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const attendRecord = (token: string) => ({ tnf: 4, type: bytes('hackclub.com:attend'), payload: bytes(token) });
const uriRecord = (body: string) => ({ tnf: 1, type: bytes('U'), payload: [0x00, ...bytes(body)] });

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockListeners)) delete mockListeners[key];
  mockNfc.isSupported.mockResolvedValue(true);
  mockNfc.start.mockResolvedValue(undefined);
  mockNfc.isEnabled.mockResolvedValue(true);
  mockNfc.registerTagEvent.mockResolvedValue(undefined);
  mockNfc.unregisterTagEvent.mockResolvedValue(undefined);
  mockNfc.cancelTechnologyRequest.mockResolvedValue(undefined);
  mockNfc.requestTechnology.mockResolvedValue('Ndef');
  mockNfc.ndefHandler.writeNdefMessage.mockResolvedValue(undefined);
  mockNfc.ndefFormatableHandlerAndroid.formatNdef.mockResolvedValue(undefined);
});

describe('parseNdefMessage', () => {
  const { parseNdefMessage, badgeReadFromResult } = load('android');

  it('prefers the Attend external record over a URI record', () => {
    const result = parseNdefMessage([uriRecord('attend://checkin/abc'), attendRecord('tok-123')] as never, '04AB');
    expect(result).toEqual({ success: true, type: 'external', payload: 'tok-123', tagId: '04AB' });
    expect(badgeReadFromResult(result)).toEqual({ payload: 'tok-123', isBadge: true });
  });

  it('decodes URI prefixes and text records', () => {
    const uri = parseNdefMessage([{ tnf: 1, type: bytes('U'), payload: [0x04, ...bytes('hack.club')] }] as never);
    expect(uri).toMatchObject({ type: 'uri', payload: 'https://hack.club' });
    // URI/text content is never a badge token, whatever it says.
    expect(badgeReadFromResult(uri)).toEqual({ payload: 'https://hack.club', isBadge: false });
    expect(parseNdefMessage([{ tnf: 1, type: bytes('T'), payload: [0x02, ...bytes('enhello')] }] as never))
      .toMatchObject({ type: 'text', payload: 'hello' });
  });

  it('reports empty tags and ignores unknown payloads as tokens', () => {
    expect(parseNdefMessage(undefined)).toMatchObject({ success: false, error: 'No NDEF data on tag' });
    const unknown = parseNdefMessage([{ tnf: 2, type: bytes('x/y'), payload: bytes('raw') }] as never);
    expect(unknown).toMatchObject({ success: true, type: 'unknown' });
    expect(badgeReadFromResult(unknown)).toBeNull();
  });
});

describe('NFC service on Android', () => {
  it('reports support and uses reader mode for reads', async () => {
    const { nfcService } = load('android');
    expect(await nfcService.init()).toBe(true);
    expect(nfcService.needsInAppPrompt).toBe(true);
    mockNfc.getTag.mockResolvedValue({ id: '01', ndefMessage: [attendRecord('tok')] });

    const states: string[] = [];
    nfcService.subscribe(s => states.push(s.session.status));
    const result = await nfcService.readTag();

    expect(result).toMatchObject({ success: true, type: 'external', payload: 'tok' });
    expect(mockNfc.requestTechnology).toHaveBeenCalledWith('Ndef', expect.objectContaining({ isReaderModeEnabled: true }));
    expect(states).toEqual(['waiting', 'success']);
    expect(mockNfc.cancelTechnologyRequest).toHaveBeenCalled();
  });

  it('writes a URI + token message and formats blank tags', async () => {
    const { nfcService } = load('android');
    await nfcService.init();
    expect(await nfcService.writeTag({ badgeUrl: 'https://x', attendToken: 't' })).toEqual({ success: true });
    expect(mockNfc.ndefHandler.writeNdefMessage).toHaveBeenCalledWith([2]);

    mockNfc.requestTechnology.mockResolvedValue('NdefFormatable');
    expect(await nfcService.writeTag({ badgeUrl: 'https://x', attendToken: 't' })).toEqual({ success: true });
    expect(mockNfc.ndefFormatableHandlerAndroid.formatNdef).toHaveBeenCalledWith([2]);
    expect(nfcService.getSnapshot().session).toEqual({ status: 'success', operation: 'write' });
    nfcService.resetSession();
    expect(nfcService.getSnapshot().session).toEqual({ status: 'idle' });
  });

  it('maps cancellation to idle and failures to an error state', async () => {
    const { nfcService } = load('android');
    await nfcService.init();
    mockNfc.requestTechnology.mockRejectedValueOnce(new Error('UserCancel: cancelled'));
    expect(await nfcService.writeTag({ badgeUrl: 'u', attendToken: 't' })).toEqual({ success: false, error: 'Cancelled' });
    expect(nfcService.getSnapshot().session).toEqual({ status: 'idle' });

    mockNfc.ndefHandler.writeNdefMessage.mockRejectedValueOnce(new Error('Tag is read-only'));
    expect(await nfcService.writeTag({ badgeUrl: 'u', attendToken: 't' })).toEqual({ success: false, error: 'Tag is read-only' });
    expect(nfcService.getSnapshot().session).toEqual({ status: 'error', operation: 'write', error: 'Tag is read-only' });
  });

  it('auto-reads badge taps until stopped', async () => {
    const { nfcService } = load('android');
    const seen: string[] = [];
    const stop = nfcService.startAutoRead(r => seen.push(r.payload ?? ''));
    await flush();
    await flush();

    expect(mockNfc.registerTagEvent).toHaveBeenCalledWith(expect.objectContaining({ isReaderModeEnabled: true }));
    expect(nfcService.getSnapshot().autoReadActive).toBe(true);

    mockListeners.NfcManagerDiscoverTag?.({ id: '1', ndefMessage: [attendRecord('a')] });
    mockListeners.NfcManagerDiscoverTag?.({ id: '2', ndefMessage: [attendRecord('b')] });
    expect(seen).toEqual(['a', 'b']);

    stop();
    await flush();
    expect(mockNfc.unregisterTagEvent).toHaveBeenCalled();
    expect(nfcService.getSnapshot().autoReadActive).toBe(false);
  });

  it('is inactive while NFC is switched off', async () => {
    const { nfcService } = load('android');
    nfcService.startAutoRead(() => {});
    await flush();
    await flush();
    expect(nfcService.getSnapshot().autoReadActive).toBe(true);

    mockListeners.NfcManagerStateChanged?.({ state: 'off' });
    expect(nfcService.getSnapshot().autoReadActive).toBe(false);

    mockListeners.NfcManagerStateChanged?.({ state: 'on' });
    await flush();
    await flush();
    expect(nfcService.getSnapshot().autoReadActive).toBe(true);
  });

  it('pauses auto-read during a write and resumes it afterwards', async () => {
    const { nfcService } = load('android');
    const seen: string[] = [];
    nfcService.startAutoRead(r => seen.push(r.payload ?? ''));
    await flush();
    await flush();
    expect(mockNfc.registerTagEvent).toHaveBeenCalledTimes(1);

    let releaseTag: (tech: string) => void = () => {};
    mockNfc.requestTechnology.mockReturnValueOnce(new Promise(resolve => { releaseTag = resolve; }));
    const write = nfcService.writeTag({ badgeUrl: 'u', attendToken: 't' });
    await flush();
    await flush();
    expect(mockNfc.unregisterTagEvent).toHaveBeenCalledTimes(1);

    // The library emits DiscoverTag for the write's tag too; it must not leak out.
    mockListeners.NfcManagerDiscoverTag?.({ id: '1', ndefMessage: [attendRecord('old')] });
    releaseTag('Ndef');
    await write;
    await flush();
    await flush();

    expect(seen).toEqual([]);
    expect(mockNfc.registerTagEvent).toHaveBeenCalledTimes(2);
    expect(nfcService.getSnapshot().autoReadActive).toBe(true);
  });
});

describe('NFC tech requests', () => {
  it('runs overlapping reads and writes one at a time and keeps auto-read paused until both finish', async () => {
    const { nfcService } = load('android');
    nfcService.startAutoRead(() => {});
    await flush();
    await flush();
    expect(mockNfc.registerTagEvent).toHaveBeenCalledTimes(1);

    const releases: ((tech: string) => void)[] = [];
    mockNfc.requestTechnology.mockImplementation(() => new Promise(resolve => { releases.push(resolve); }));
    mockNfc.getTag.mockResolvedValue({ id: '1', ndefMessage: [attendRecord('tok')] });

    const write = nfcService.writeTag({ badgeUrl: 'u', attendToken: 't' });
    const read = nfcService.readTag();
    await flush();
    await flush();
    // Only the first request reached the native module.
    expect(mockNfc.requestTechnology).toHaveBeenCalledTimes(1);

    releases[0]('Ndef');
    await write;
    await flush();
    await flush();
    expect(mockNfc.requestTechnology).toHaveBeenCalledTimes(2);
    // The read is still waiting, so auto-read must not have come back.
    expect(mockNfc.registerTagEvent).toHaveBeenCalledTimes(1);
    expect(nfcService.getSnapshot().autoReadActive).toBe(false);

    releases[1]('Ndef');
    expect(await read).toMatchObject({ success: true, payload: 'tok' });
    await flush();
    await flush();
    expect(mockNfc.registerTagEvent).toHaveBeenCalledTimes(2);
    expect(nfcService.getSnapshot().autoReadActive).toBe(true);
    mockNfc.requestTechnology.mockReset();
  });
});

describe('NFC service on iOS', () => {
  it('does not start auto-read and keeps the system sheet', async () => {
    const { nfcService } = load('ios');
    expect(nfcService.needsInAppPrompt).toBe(false);
    nfcService.startAutoRead(() => {})();
    await flush();
    expect(mockNfc.registerTagEvent).not.toHaveBeenCalled();
  });
});
