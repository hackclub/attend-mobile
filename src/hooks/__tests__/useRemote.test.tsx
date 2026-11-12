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
