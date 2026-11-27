import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { radii } from '../theme/tokens';

/**
 * Screen options for a form-sheet route: the native sheet with a grabber and
 * the kit's container radius. `detents` are fractions of the screen height,
 * ascending (Android uses the first three), or 'fitToContents'.
 */
export function sheetOptions(
  background: string,
  detents: NativeStackNavigationOptions['sheetAllowedDetents'] = 'fitToContents'
): NativeStackNavigationOptions {
  return {
    presentation: 'formSheet',
    headerShown: false,
    sheetAllowedDetents: detents,
    sheetGrabberVisible: true,
    sheetCornerRadius: radii.container + 8,
    contentStyle: { backgroundColor: background },
  };
}
