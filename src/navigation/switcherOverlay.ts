import { Easing, makeMutable, withSpring } from 'react-native-reanimated';
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
  /** Null for the home switcher (see `openHome`), which has no banner. */
  event: Event | null;
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
/**
 * The morphing card (the "hero"): whether it's in use for this opening or
 * switch (1), whether its photo is drawn (1), and which banner it stands in
 * for. Shared so that banner can hide while the hero covers it, rather than
 * show through as a second banner.
 */
export const switcherHeroOn = makeMutable(0);
export const switcherHeroReady = makeMutable(0);
export const switcherHeroKey = makeMutable('');
/** A snapshot of the hero's shared values, read by the caller's worklet. */
export interface SwitcherHeroValues {
  progress: number;
  on: number;
  ready: number;
  key: string;
}
/**
 * Whether the hero is on screen (standing in for `key`'s banner, if given).
 * Takes the values rather than reading them, so an animated style that calls
 * it reads them itself and re-runs when they change.
 */
export function switcherHeroShown(hero: SwitcherHeroValues, key?: string): boolean {
  'worklet';
  const p = hero.progress;
  return (key === undefined || hero.key === key) && hero.on === 1 && hero.ready === 1 && p > 0.001 && p < 0.999;
}
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
/** A pull of `distance` points, resisted more the further it goes. */
export function rubberBand(distance: number): number {
  'worklet';
  if (distance <= 0) return 0;
  const limit = 220;
  return (distance * 0.55 * limit) / (limit + distance * 0.55);
}

/**
 * A pull on the list to close it: it moves with the finger, resisting more
 * the further it goes, so it reads as a pull against something rather than
 * the list sliding off.
 */
export function followPull(distance: number): number {
  'worklet';
  if (distance <= 0) return 0;
  const limit = 420;
  return (distance * 0.7 * limit) / (limit + distance * 0.7);
}

/** Switcher diagnostics in the log, for a build with EXPO_PUBLIC_DEBUG_SWITCHER=1. */
export const DEBUG_SWITCHER = process.env.EXPO_PUBLIC_DEBUG_SWITCHER === '1';

export interface OverlayState {
  /** The banner it's mounted over (unseen until opened), if any. */
  source: SwitcherBanner | null;
  /** Opening, open or closing: taking touches, back and screen readers. */
  open: boolean;
  /** Opened by a tap, so it plays the opening by itself. */
  animateIn: boolean;
  /** Bumped by every open, so the overlay can tell one from the next. */
  openCount: number;
  /**
   * The home switcher: the app's first screen, open with no banner under it
   * and no way to close it, only to pick an event (see `openHome`).
   */
  home: boolean;
  /** The home switcher's pick is under way: its screen going away no longer dismisses it. */
  homePicked: boolean;
}

let state: OverlayState = {
  source: null,
  open: false,
  animateIn: false,
  openCount: 0,
  home: false,
  homePicked: false,
};
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
    if (DEBUG_SWITCHER) console.log('[sw] open requested', key, 'found', !!source, 'alreadyOpen', state.open);
    if (!source) return;
    if (animateIn) {
      const rect = await source.measure();
      if (!rect || state.open) return;
      switcherSourceRect.value = rect;
    }
    state = { source, open: true, animateIn, openCount: state.openCount + 1, home: false, homePicked: false };
    if (DEBUG_SWITCHER) console.log('[sw] open', key, animateIn, 'progress', switcherProgress.value);
    emit();
  },

  /**
   * Shows it as the home screen, already open (no opening to play): the
   * screen that holds it supplies `source` with its root reset, and a null
   * event (there's no banner to grow out of or back into).
   */
  openHome(source: SwitcherBanner) {
    if (state.open) return;
    switcherHeroOn.value = 0;
    switcherHeroKey.value = '';
    switcherStretch.value = 0;
    switcherOverpull.value = 0;
    switcherProgress.value = 1;
    state = { source, open: true, animateIn: false, openCount: state.openCount + 1, home: true, homePicked: false };
    emit();
  },

  /**
   * A pick from the home switcher: it lands and closes like any switch (still
   * looking like the home one), and its screen going away as the root resets
   * no longer dismisses it.
   */
  leaveHome() {
    if (!state.home || state.homePicked) return;
    state = { ...state, homePicked: true };
    emit();
  },

  /** Its screen went away without a pick (a link, signing out): gone at once. */
  dismissHome() {
    if (state.home && state.open && !state.homePicked) this.closed();
  },

  /** Closed: unseen again, over the latest switchable banner. */
  closed() {
    if (DEBUG_SWITCHER) console.log('[sw] closed, was open', state.open, 'progress', switcherProgress.value);
    if (!state.open) return;
    switcherProgress.value = 0;
    switcherStretch.value = 0;
    switcherOverpull.value = 0;
    state = { ...state, open: false, animateIn: false, home: false, homePicked: false };
    emit();
    updateSource();
  },
};

/** How much the app behind the switcher shrinks once it's open (from its centre). */
export const SWITCHER_APP_SCALE_OUT = 0.08;
/** The corner radius of the app behind the switcher once it's open. */
export const SWITCHER_APP_RADIUS = 28;

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

/**
 * Letting go of a pull: a critically damped spring that starts at the
 * finger's speed, as UIKit's spring timing does, so the release carries the
 * drag on instead of stalling and restarting. `velocity` is in progress per
 * second; its length is fixed (about 1.5 × 260 ms), like the close timing.
 */
export function switcherRelease(toValue: number, velocity: number, done?: (finished?: boolean) => void) {
  'worklet';
  return withSpring(toValue, { duration: 260, dampingRatio: 1, velocity, overshootClamping: true }, done);
}

// Plain functions for worklets to call back with scheduleOnRN, rather than
// methods on the store object, which a worklet would have to copy over.
export function closeSwitcherOverlay(): void {
  switcherOverlay.closed();
}
/** A pull passing the point where letting go opens (or closes) the switcher. */
export function switcherPullTick(): void {
  haptics.selection();
}
/** A pull reaching fully open. */
export function switcherDetentTick(): void {
  haptics.impact('light');
}
export function openSwitcherFromPull(key: string): void {
  void switcherOverlay.open(key, false);
}
