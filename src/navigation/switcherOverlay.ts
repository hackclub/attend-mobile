import { Easing, makeMutable } from 'react-native-reanimated';
import { haptics } from '../services/haptics';
import type { ReactNode } from 'react';
import type { IconName } from '../components/ui/Icon';
import type { SwitcherCurrent } from '../services/switcherLayout';
import type { Event, Ticket } from '../types';
import type { PartialState } from './routes';

// The event switcher overlay, opened from an event's banner. Banners register
// here while mounted (where they are, what they show, and their screen's way
// to reset the root); the overlay host at the app root reads the open request
// and animates between the banner and the list with `switcherProgress`.

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
  /** The page colour under it (its dark-mode fade). */
  blendInto?: string;
  /** Its top-right control (the account avatar), faded out by the hero. */
  accessory?: ReactNode;
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
 * Points the list is pulled down past where it rests: a pull that goes on
 * after the overlay has fully opened, or one that starts on the list to
 * close it. Rubber-banded (`rubberBand`), and sprung back to 0 on release.
 */
export const switcherStretch = makeMutable(0);

/** A pull of `distance` points, resisted more the further it goes. */
export function rubberBand(distance: number): number {
  'worklet';
  if (distance <= 0) return 0;
  const limit = 220;
  return (distance * 0.55 * limit) / (limit + distance * 0.55);
}

export type OverlayState =
  | { status: 'closed' }
  /** Mounted and following a pull, or animating open. */
  | { status: 'open'; source: SwitcherBanner; sourceRect: Rect; animateIn: boolean };

let state: OverlayState = { status: 'closed' };
// Bumped by every open and close, so an open still measuring its banner
// when the pull is let go (and closed) doesn't mount afterwards.
let generation = 0;
const listeners = new Set<() => void>();
const banners = new Map<string, SwitcherBanner>();
const bannerWaiters = new Map<string, (banner: SwitcherBanner) => void>();

const emit = () => listeners.forEach((listener) => listener());

export const switcherOverlay = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => state,

  /** A banner, while mounted. Returns the unregister. */
  registerBanner(banner: SwitcherBanner): () => void {
    banners.set(banner.key, banner);
    const waiter = bannerWaiters.get(banner.key);
    if (waiter) {
      bannerWaiters.delete(banner.key);
      waiter(banner);
    }
    return () => {
      if (banners.get(banner.key) === banner) banners.delete(banner.key);
    };
  },

  /** The banner with `key` once it's mounted, or null after `timeoutMs`. */
  waitForBanner(key: string, timeoutMs: number): Promise<SwitcherBanner | null> {
    const mounted = banners.get(key);
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
   * Mounts the overlay over `key`'s banner: following a pull already under
   * way, or (`animateIn`, from a tap) playing the same opening by itself.
   */
  async open(key: string, animateIn: boolean): Promise<void> {
    if (state.status !== 'closed') return;
    const source = banners.get(key);
    if (!source) return;
    const opening = ++generation;
    const sourceRect = await source.measure();
    if (!sourceRect || state.status !== 'closed' || opening !== generation) return;
    state = { status: 'open', source, sourceRect, animateIn };
    emit();
  },

  /**
   * Unmounts it, once it has animated away: a frame later, so the
   * animation's last frame is on screen before the views go (unmounting
   * under a frame still being drawn could leave them there, untouchable).
   */
  closed() {
    generation += 1;
    if (state.status === 'closed') return;
    state = { status: 'closed' };
    requestAnimationFrame(() => {
      if (state.status !== 'closed') return;
      switcherProgress.value = 0;
      switcherStretch.value = 0;
      emit();
    });
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
 * settle kept the overlay mounted (and the banner unable to reopen it) for
 * a while after it looked done.
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
