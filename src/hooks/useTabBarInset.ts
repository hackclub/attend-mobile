import { useWindowDimensions } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';

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
