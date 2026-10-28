import { useWindowDimensions, Platform } from 'react-native';

// iPhone Duo's inner display reports iPad-like metrics while Platform.isPad
// stays false, and the scene resizes underneath us every time the device is
// folded, unfolded or rotated. So every layout decision keys off the current
// scene size rather than the device class or the orientation, which is also
// what Apple asks for in "Preparing your app for iPhone Duo": target size
// classes and container bounds, never a specific screen.
// https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo

/** Above this the scene is wider than a phone column (regular-ish width). */
export const REGULAR_MIN_WIDTH = 600;
/** A 320pt sidebar plus a detail pane that can still hold a participant. */
export const SPLIT_MIN_WIDTH = 700;

export interface ResponsiveLayout {
  width: number;
  height: number;
  /** iPad hardware. For platform affordances only — never for layout. */
  isPad: boolean;
  /** Phone-width column: outer display, folded Duo, narrow multitasking. */
  isCompact: boolean;
  /** Roomy scene: inner Duo display, iPad, wide multitasking. */
  isRegular: boolean;
  isLandscape: boolean;
  useSplitView: boolean;
}

export function resolveResponsiveLayout(width: number, height: number): Omit<ResponsiveLayout, 'isPad'> {
  return {
    width,
    height,
    isCompact: width < REGULAR_MIN_WIDTH,
    isRegular: width >= REGULAR_MIN_WIDTH,
    isLandscape: width > height,
    useSplitView: width >= SPLIT_MIN_WIDTH,
  };
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  return {
    ...resolveResponsiveLayout(width, height),
    isPad: Platform.OS === 'ios' && Platform.isPad === true,
  };
}
