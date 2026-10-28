import { Platform, useWindowDimensions } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import { REGULAR_MIN_WIDTH } from './useResponsiveLayout';

// The native tab bar floats over content, so screens pad their own bottom edge
// to clear it. From iOS 27 UITabBarController can adapt into a full-height side
// rail instead of a bottom bar — both of iPhone Duo's displays do this, folded
// or not — and useBottomTabBarHeight() then reports the rail's height, which is
// the whole scene. Padded onto the bottom that pushes content clean off screen.
//
// There's no public flag for "the bar became a rail", so treat the reported
// height as a bottom inset only when it's small enough to plausibly be one.

/** A reported bar taller than this share of the scene is a side rail, not a bar. */
const MAX_BAR_SHARE_OF_SCENE = 0.25;

export function resolveTabBarInset(reportedHeight: number, sceneHeight: number): number {
  if (sceneHeight <= 0) return 0;
  return reportedHeight < sceneHeight * MAX_BAR_SHARE_OF_SCENE ? reportedHeight : 0;
}

/**
 * Height to reserve at the bottom of a screen for the native tab bar, or 0 when
 * the bar is laid out as a side rail and takes no bottom space at all.
 */
export function useTabBarInset(): number {
  const { height } = useWindowDimensions();
  return resolveTabBarInset(useBottomTabBarHeight(), height);
}

// From iPadOS 18 a regular-width iPad scene floats the tab bar along the top,
// just under the status bar, and it doesn't count towards the safe area — a
// screen's own top inset is still only the status bar. Neither the bar's
// position nor its height is reported, so this is the bar (44pt) plus a gap.
// A compact iPad scene (Slide Over, a narrow split) keeps the bottom bar, and
// iPhone Duo's displays turn it into a side rail instead, which isn't an iPad.
const TOP_TAB_BAR_CLEARANCE = 56;

export function resolveTopTabBarInset(
  platform: { os: string; isPad: boolean; version: string | number },
  sceneWidth: number
): number {
  if (platform.os !== 'ios' || !platform.isPad) return 0;
  if (parseInt(String(platform.version), 10) < 18) return 0;
  return sceneWidth >= REGULAR_MIN_WIDTH ? TOP_TAB_BAR_CLEARANCE : 0;
}

/**
 * Room to leave below the status bar for a tab bar that sits along the top,
 * or 0 wherever the bar is at the bottom or a side rail.
 */
export function useTopTabBarInset(): number {
  const { width } = useWindowDimensions();
  return resolveTopTabBarInset(
    { os: Platform.OS, isPad: Platform.OS === 'ios' && Platform.isPad, version: Platform.Version },
    width
  );
}
