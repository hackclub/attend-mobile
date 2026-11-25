import { RemoteCache } from '../remoteCache';

describe('RemoteCache', () => {
  it('shares one request per key while it runs, then remembers the answer', async () => {
    const cache = new RemoteCache();
    const load = jest.fn(async () => 'value');
    const [a, b] = await Promise.all([cache.load('k', load), cache.load('k', load)]);
    expect([a, b]).toEqual(['value', 'value']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.get('k')).toBe('value');

    await cache.load('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps the remembered answer when a later load fails', async () => {
    const cache = new RemoteCache();
    await cache.load('k', async () => 'old');
    await expect(cache.load('k', () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
    expect(cache.get('k')).toBe('old');
  });

  it("doesn't keep an answer that lands after a sign-out", async () => {
    const cache = new RemoteCache();
    let resolve: (v: string) => void = () => {};
    const loading = cache.load('k', () => new Promise<string>((r) => { resolve = r; }));
    cache.clear();
    resolve('late');
    await loading;
    expect(cache.get('k')).toBeUndefined();
  });

  it('keeps only the most recently loaded answers', async () => {
    const cache = new RemoteCache();
    for (let i = 0; i < 30; i++) await cache.load(`k${i}`, async () => i);
    expect(cache.get('k0')).toBeUndefined();
    expect(cache.get('k29')).toBe(29);
    expect(cache.get('k6')).toBe(6);
  });
});
