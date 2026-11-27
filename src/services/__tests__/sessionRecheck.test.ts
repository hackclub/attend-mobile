import type { SessionValidation } from '../auth';
import { createSessionRecheck } from '../sessionRecheck';

const flush = () => new Promise(resolve => setImmediate(resolve));

function setup(outcomes: SessionValidation[] = []) {
  let now = 0;
  const validate = jest.fn(async () => outcomes.shift() ?? { status: 'unverified' as const });
  const onOutcome = jest.fn();
  const recheck = createSessionRecheck({ validate, onOutcome, minIntervalMs: 60_000, now: () => now });
  return { recheck, validate, onOutcome, advance: (ms: number) => { now += ms; } };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('createSessionRecheck', () => {
  it('does nothing unless the last outcome was unverified', async () => {
    const { recheck, validate } = setup();
    recheck.trigger();
    recheck.record('t1', { status: 'valid', user: { id: 'u1' } as never });
    recheck.trigger();
    await flush();
    expect(validate).not.toHaveBeenCalled();
  });

  it('rechecks an unverified session and reports the outcome', async () => {
    const { recheck, validate, onOutcome } = setup([{ status: 'expired' }]);
    recheck.record('t1', { status: 'unverified' });
    recheck.trigger();
    await flush();
    expect(validate).toHaveBeenCalledWith('t1');
    expect(onOutcome).toHaveBeenCalledWith('t1', { status: 'expired' });

    // Settled: nothing left to recheck.
    recheck.trigger();
    await flush();
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('rechecks at most once a minute, then once more when the minute is up', async () => {
    jest.useFakeTimers();
    const { recheck, validate, advance } = setup();
    recheck.record('t1', { status: 'unverified' });
    recheck.trigger();
    await Promise.resolve();
    await Promise.resolve();
    expect(validate).toHaveBeenCalledTimes(1);

    advance(10_000);
    recheck.trigger();
    recheck.trigger();
    expect(validate).toHaveBeenCalledTimes(1);

    advance(50_000);
    jest.advanceTimersByTime(50_000);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('drops an answer for a session that was cleared meanwhile', async () => {
    let resolve: (outcome: SessionValidation) => void = () => {};
    const onOutcome = jest.fn();
    const recheck = createSessionRecheck({
      validate: () => new Promise(r => { resolve = r; }),
      onOutcome,
    });
    recheck.record('t1', { status: 'unverified' });
    recheck.trigger();
    recheck.clear();
    resolve({ status: 'expired' });
    await flush();
    expect(onOutcome).not.toHaveBeenCalled();
  });

  it('cancels a deferred recheck on clear', () => {
    jest.useFakeTimers();
    const { recheck, validate, advance } = setup();
    recheck.record('t1', { status: 'unverified' });
    recheck.trigger();
    advance(1_000);
    recheck.trigger();
    recheck.clear();
    advance(60_000);
    jest.advanceTimersByTime(60_000);
    expect(validate).toHaveBeenCalledTimes(1);
  });
});
