import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mockSetEvents = jest.fn();
jest.mock('../../context/AppContext', () => ({
  useApp: () => ({
    state: { auth: { user: { id: 'u1' } }, events: [], currentEvent: null },
    setEvents: mockSetEvents,
  }),
}));
jest.mock('../../services/api', () => ({
  api: { getEvents: jest.fn(), getMyTickets: jest.fn() },
}));
jest.mock('../../services/sync', () => ({
  syncService: { getCacheGeneration: () => 1, cacheEvents: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../services/eventSwitcher', () => ({
  canSwitchEvents: () => false,
  groupSwitcherEvents: () => ({ organising: [], past: [] }),
  switcherEventCount: () => 0,
}));

import { api } from '../../services/api';
import { resetSwitcherEventsCache, useSwitcherEvents } from '../useSwitcherEvents';

function Probe({ out }: { out: { refresh?: () => Promise<void>; isLoading?: boolean } }) {
  const switcher = useSwitcherEvents();
  out.refresh = switcher.refresh;
  out.isLoading = switcher.isLoading;
  return null;
}

async function mount(out: { refresh?: () => Promise<void>; isLoading?: boolean } = {}) {
  let root: renderer.ReactTestRenderer | undefined;
  await act(async () => {
    root = renderer.create(<Probe out={out} />);
  });
  return root!;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSwitcherEventsCache();
  jest.mocked(api.getEvents).mockResolvedValue([]);
  jest.mocked(api.getMyTickets).mockResolvedValue([]);
});

describe('useSwitcherEvents', () => {
  it('shares one load between the Overview and the switcher', async () => {
    await act(async () => {
      renderer.create(
        <>
          <Probe out={{}} />
          <Probe out={{}} />
        </>
      );
    });
    expect(api.getEvents).toHaveBeenCalledTimes(1);
    expect(api.getMyTickets).toHaveBeenCalledTimes(1);
  });

  it('reuses a recent load without a spinner, and refetches on refresh', async () => {
    (await mount()).unmount();
    const out: { refresh?: () => Promise<void>; isLoading?: boolean } = {};
    await mount(out);
    expect(api.getEvents).toHaveBeenCalledTimes(1);
    expect(out.isLoading).toBe(false);

    await act(async () => {
      await out.refresh!();
    });
    expect(api.getEvents).toHaveBeenCalledTimes(2);
  });

  it('fetches again once the load is a minute old', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    (await mount()).unmount();
    now.mockReturnValue(1_000_000 + 61_000);
    await mount();
    expect(api.getEvents).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });
});
