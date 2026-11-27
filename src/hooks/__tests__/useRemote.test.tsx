import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../services/api', () => {
  class ApiError extends Error {
    constructor(public status: number) {
      super(`HTTP ${status}`);
    }
    get isForbidden() {
      return this.status === 403;
    }
  }
  return { ApiError };
});

import { ApiError } from '../../services/api';
import { remoteCache } from '../../services/remoteCache';
import { useRemote, type Remote } from '../useRemote';

type Deferred = { resolve: (v: string) => void; reject: (e: unknown) => void };

function setup() {
  const pending: Record<string, Deferred[]> = {};
  const load = (key: string) => () =>
    new Promise<string>((resolve, reject) => {
      (pending[key] ??= []).push({ resolve, reject });
    });
  const loaders: Record<string, () => Promise<string>> = {};
  const loaderFor = (key: string) => (loaders[key] ??= load(key));

  const out: { value?: Remote<string>; reload?: () => Promise<void> } = {};
  function Probe({ eventId }: { eventId: string }) {
    const [value, reload] = useRemote(loaderFor(eventId), eventId);
    out.value = value;
    out.reload = reload;
    return null;
  }
  let root: renderer.ReactTestRenderer | undefined;
  act(() => {
    root = renderer.create(<Probe eventId="a" />);
  });
  return {
    out,
    pending,
    switchTo: (eventId: string) => act(() => root!.update(<Probe eventId={eventId} />)),
  };
}

it('does not load on mount, only when asked', () => {
  const { out, pending } = setup();
  expect(out.value).toEqual({ state: 'loading' });
  expect(pending.a).toBeUndefined();
});

it('ignores an answer for the previous event that arrives after the new one', async () => {
  const { out, pending, switchTo } = setup();
  await act(async () => { void out.reload!(); });
  switchTo('b');
  await act(async () => { void out.reload!(); });

  await act(async () => { pending.b[0].resolve('B'); });
  expect(out.value).toEqual({ state: 'ready', data: 'B' });

  await act(async () => { pending.a[0].resolve('A'); });
  expect(out.value).toEqual({ state: 'ready', data: 'B' });
});

it('keeps only the newest request for the same key', async () => {
  const { out, pending } = setup();
  await act(async () => { void out.reload!(); });
  await act(async () => { void out.reload!(); });

  await act(async () => { pending.a[1].resolve('new'); });
  await act(async () => { pending.a[0].resolve('old'); });
  expect(out.value).toEqual({ state: 'ready', data: 'new' });
});

it('maps a 403 to forbidden and other failures to error', async () => {
  const { out, pending } = setup();
  await act(async () => { void out.reload!(); });
  await act(async () => { pending.a[0].reject(new (ApiError as any)(403)); });
  expect(out.value).toEqual({ state: 'forbidden' });

  await act(async () => { void out.reload!(); });
  await act(async () => { pending.a[1].reject(new Error('offline')); });
  expect(out.value).toEqual({ state: 'error' });
});

describe('with a cache key', () => {
  const cache = remoteCache;
  beforeEach(() => cache.clear());

  function probe(load: () => Promise<string>, eventId = 'a') {
    const out: { value?: Remote<string>; reload?: () => Promise<void> } = {};
    function Probe({ id }: { id: string }) {
      const [value, reload] = useRemote(load, id, `panel:${id}`);
      out.value = value;
      out.reload = reload;
      return null;
    }
    act(() => {
      renderer.create(<Probe id={eventId} />);
    });
    return out;
  }

  it('shows the last answer at once and refreshes behind it', async () => {
    await cache.load('panel:a', async () => 'old');
    let resolve: (v: string) => void = () => {};
    const out = probe(() => new Promise<string>((r) => { resolve = r; }));
    expect(out.value).toEqual({ state: 'ready', data: 'old' });

    await act(async () => { void out.reload!(); });
    expect(out.value).toEqual({ state: 'ready', data: 'old' });
    await act(async () => { resolve('new'); });
    expect(out.value).toEqual({ state: 'ready', data: 'new' });
    expect(cache.get('panel:a')).toBe('new');
  });

  it('joins a load already running instead of starting another', async () => {
    let resolve: (v: string) => void = () => {};
    const early = jest.fn(() => new Promise<string>((r) => { resolve = r; }));
    void cache.load('panel:a', early);
    const late = jest.fn(async () => 'late');
    const out = probe(late);

    await act(async () => { void out.reload!(); });
    await act(async () => { resolve('early'); });
    expect(early).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
    expect(out.value).toEqual({ state: 'ready', data: 'early' });
  });

  it('keeps the last answer when a refresh fails, but not when it is refused', async () => {
    await cache.load('panel:a', async () => 'old');
    const failing = probe(() => Promise.reject(new TypeError('Network request failed')));
    await act(async () => { await failing.reload!(); });
    expect(failing.value).toEqual({ state: 'ready', data: 'old' });

    const refused = probe(() => Promise.reject(new (ApiError as any)(403)));
    await act(async () => { await refused.reload!(); });
    expect(refused.value).toEqual({ state: 'forbidden' });
    expect(cache.get('panel:a')).toBeUndefined();
  });
});
