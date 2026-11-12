import { Easing, makeMutable } from 'react-native-reanimated';
import { haptics } from '../services/haptics';
import type { ReactNode } from 'react';
import type { IconName } from '../components/ui/Icon';
import type { SwitcherCurrent } from '../services/switcherLayout';
import type { Event, Ticket } from '../types';
import type { PartialState } from './routes';

// The event switcher overlay, opened from an event's banner. Banners register
// here while mounted (what they show, how tall they are, and their screen's
// way to reset the root). The overlay host at the app root stays mounted,
// unseen, over the latest switchable banner, so a pull on it moves the
// overlay from the first frame: everything that follows the finger runs on
// the UI thread, from `switcherProgress` and the banner's rect, which the
// pull measures there as the finger goes down.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the overlay needs from a banner to grow out of it or back into it. */
export interface SwitcherBanner {
  /** `event:<id>` on the Overview, `ticket:<id>` on a pass. */
  key: string;
  event: Event;
  eyebrow?: string;
  eyebrowIcon?: IconName;
  meta?: string;
  /** Space above the photo, for the status bar. */
  topInset: number;
  /** Its laid-out height (a long name can make it taller than the photo). */
  height: number;
  /** The page colour under it (its dark-mode fade). */
  blendInto?: string;
  /** Its top-right control (the account avatar), faded out by the hero. */
  accessory?: ReactNode;
  /** Whether it opens the switcher (more than one event to switch to). */
  enabled: boolean;
  /** Its rect in the window, now. */
  measure: () => Promise<Rect | null>;
  /** Its screen's root reset, run under the overlay when switching. */
  switchTo: (home: PartialState, before?: () => void) => void;
  /** The entry it shows as current. */
  current: SwitcherCurrent;
}

export const bannerKey = {
  event: (event: Pick<Event, 'id'>) => `event:${event.id}`,
  ticket: (ticket: Pick<Ticket, 'id'>) => `ticket:${ticket.id}`,
};

/** 0: the banner; 1: the list, fully open. Driven by gestures and springs. */
export const switcherProgress = makeMutable(0);
/** The banner's rect in the window as the overlay opens from it. */
export const switcherSourceRect = makeMutable<Rect>({ x: 0, y: 0, width: 1, height: 1 });
/**
 * Points the list is pulled down (or up) past where it rests by a pull on
 * the list to close it. Sprung back to 0 on release.
 */
export const switcherStretch = makeMutable(0);
/**
 * Points a pull on the banner has gone past fully open: the list follows on
 * down, rubber-banded, without the stretch's fade (it isn't closing).
 */
export const switcherOverpull = makeMutable(0);
/**
 * True while a finger is down on a switchable banner. The banner's screen
 * turns its scrolling and pull-to-refresh off meanwhile (on the UI thread,
 * at once), so they can't claim a pull before the switcher does; a drag
 * upward fails the pull and turns them back on mid-drag.
 */
export const switcherBannerHeld = makeMutable(false);

/** A pull of `distance` points, resisted more the further it goes. */
export function rubberBand(distance: number): number {
  'worklet';
  if (distance <= 0) return 0;
  const limit = 220;
  return (distance * 0.55 * limit) / (limit + distance * 0.55);
}

/**
 * A pull on the list to close it: close to the finger, with a little
 * resistance only further on, so the list feels held rather than elastic.
 */
export function followPull(distance: number): number {
  'worklet';
  if (distance <= 0) return 0;
  const limit = 1400;
  return (distance * 0.95 * limit) / (limit + distance * 0.95);
}

export interface OverlayState {
  /** The banner it's mounted over (unseen until opened), if any. */
  source: SwitcherBanner | null;
  /** Opening, open or closing: taking touches, back and screen readers. */
  open: boolean;
  /** Opened by a tap, so it plays the opening by itself. */
  animateIn: boolean;
  /** Bumped by every open, so the overlay can tell one from the next. */
  openCount: number;
}

let state: OverlayState = { source: null, open: false, animateIn: false, openCount: 0 };
const listeners = new Set<() => void>();
/** Registered banners, oldest first; the overlay sits over the latest switchable one. */
let banners: SwitcherBanner[] = [];
const bannerWaiters = new Map<string, (banner: SwitcherBanner) => void>();

const emit = () => listeners.forEach((listener) => listener());

function latestSource(): SwitcherBanner | null {
  for (let i = banners.length - 1; i >= 0; i--) if (banners[i].enabled) return banners[i];
  return null;
}

/** While it's closed, follows the latest switchable banner. */
function updateSource() {
  if (state.open) return;
  const source = latestSource();
  if (source !== state.source) {
    state = { ...state, source };
    emit();
  }
}

export const switcherOverlay = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => state,

  /** A banner, while mounted (registered again when it changes). Returns the unregister. */
  registerBanner(banner: SwitcherBanner): () => void {
    banners = [...banners.filter((b) => b.key !== banner.key), banner];
    const waiter = bannerWaiters.get(banner.key);
    if (waiter) {
      bannerWaiters.delete(banner.key);
      waiter(banner);
    }
    updateSource();
    return () => {
      banners = banners.filter((b) => b !== banner);
      updateSource();
    };
  },

  /** The banner with `key` once it's mounted, or null after `timeoutMs`. */
  waitForBanner(key: string, timeoutMs: number): Promise<SwitcherBanner | null> {
    const mounted = banners.find((b) => b.key === key);
    if (mounted) return Promise.resolve(mounted);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        bannerWaiters.delete(key);
        resolve(null);
      }, timeoutMs);
      bannerWaiters.set(key, (banner) => {
        clearTimeout(timer);
        resolve(banner);
      });
    });
  },

  /**
   * Opens it over `key`'s banner: following a pull already under way (its
   * rect measured as the finger went down), or (`animateIn`, from a tap)
   * playing the same opening by itself.
   */
  async open(key: string, animateIn: boolean): Promise<void> {
    if (state.open) return;
    const source = banners.find((b) => b.key === key);
    if (!source) return;
    if (animateIn) {
      const rect = await source.measure();
      if (!rect || state.open) return;
      switcherSourceRect.value = rect;
    }
    state = { source, open: true, animateIn, openCount: state.openCount + 1 };
    emit();
  },

  /** Closed: unseen again, over the latest switchable banner. */
  closed() {
    if (!state.open) return;
    switcherProgress.value = 0;
    switcherStretch.value = 0;
    switcherOverpull.value = 0;
    state = { ...state, open: false, animateIn: false };
    emit();
    updateSource();
  },
};

/** How far a pull goes to open the switcher fully. */
export const SWITCHER_PULL_DISTANCE = 260;
/** Let go past this much of the pull and it opens; short of it, it doesn't. */
export const SWITCHER_OPEN_THRESHOLD = 0.35;
/** A flick this fast (points/s) opens or closes it whatever the distance. */
export const SWITCHER_FLICK_VELOCITY = 800;
export const SWITCHER_SPRING = { damping: 26, stiffness: 260, mass: 1 };
/**
 * Closing and landing: a fixed-length ease rather than a spring, whose long
 * settle kept the overlay busy (and the banner unable to reopen it) for a
 * while after it looked done.
 */
export const SWITCHER_CLOSE_TIMING = { duration: 340, easing: Easing.bezier(0.2, 0, 0, 1) };

// Plain functions for worklets to call back with scheduleOnRN, rather than
// methods on the store object, which a worklet would have to copy over.
export function closeSwitcherOverlay(): void {
  switcherOverlay.closed();
}
export function switcherPullTick(): void {
  haptics.selection();
}
export function openSwitcherFromPull(key: string): void {
  void switcherOverlay.open(key, false);
}
