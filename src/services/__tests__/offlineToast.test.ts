import NetInfo from '@react-native-community/netinfo';
import { OFFLINE_REFRESH_MESSAGE, toastIfOffline } from '../offlineToast';
import { toast } from '../toast';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

const fetchMock = NetInfo.fetch as unknown as jest.Mock;

describe('toastIfOffline', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    toast.hide();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the offline toast, above the given offset, with no connection', async () => {
    fetchMock.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await expect(toastIfOffline({ bottomOffset: 80 })).resolves.toBe(true);
    expect(toast.get()).toMatchObject({ message: OFFLINE_REFRESH_MESSAGE, bottomOffset: 80 });
  });

  it('counts a connection without internet as offline', async () => {
    fetchMock.mockResolvedValue({ isConnected: true, isInternetReachable: false });
    await expect(toastIfOffline()).resolves.toBe(true);
    expect(toast.get()?.message).toBe(OFFLINE_REFRESH_MESSAGE);
  });

  it('stays quiet online, or while reachability is still unknown', async () => {
    fetchMock.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    await expect(toastIfOffline()).resolves.toBe(false);
    fetchMock.mockResolvedValue({ isConnected: true, isInternetReachable: null });
    await expect(toastIfOffline()).resolves.toBe(false);
    expect(toast.get()).toBeNull();
  });

  it('stays quiet if the network state can’t be read', async () => {
    fetchMock.mockRejectedValue(new Error('no module'));
    await expect(toastIfOffline()).resolves.toBe(false);
    expect(toast.get()).toBeNull();
  });
});

describe('toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    toast.hide();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('goes by itself after a few seconds, and a newer one replaces it', () => {
    const seen: (string | undefined)[] = [];
    const unsubscribe = toast.subscribe(() => seen.push(toast.get()?.message));
    toast.show('one');
    jest.advanceTimersByTime(2000);
    toast.show('two');
    jest.advanceTimersByTime(2000);
    expect(toast.get()?.message).toBe('two');
    jest.advanceTimersByTime(2000);
    expect(toast.get()).toBeNull();
    expect(seen).toEqual(['one', 'two', undefined]);
    unsubscribe();
  });
});
