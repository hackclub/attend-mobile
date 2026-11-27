import type { MaterialColors } from '@expo/ui/jetpack-compose';
import type { ThemeTokens } from './tokens';

type Hex = MaterialColors['primary'];
const hex = (color: string) => color as Hex;

/**
 * The Material 3 colour roles for the app's own theme, so Jetpack Compose
 * controls on Android (switches, segmented buttons, chips, menus, pickers,
 * bottom sheets) take the in-app light/dark scheme and the brand accent,
 * not the device's wallpaper colours.
 *
 * Roles left out keep the palette Host seeds from the brand colour.
 */
export function materialColorOverrides(tokens: ThemeTokens): Partial<MaterialColors> {
  return {
    primary: hex(tokens.accent),
    onPrimary: hex(tokens.accentOn),
    primaryContainer: hex(tokens.selected),
    onPrimaryContainer: hex(tokens.textH),
    // The selected segment, the selected filter chip.
    secondaryContainer: hex(tokens.selected),
    onSecondaryContainer: hex(tokens.textH),
    background: hex(tokens.bg),
    onBackground: hex(tokens.text),
    surface: hex(tokens.bg),
    onSurface: hex(tokens.text),
    onSurfaceVariant: hex(tokens.text2),
    surfaceContainerLowest: hex(tokens.bg),
    // A bottom sheet's surface: the page.
    surfaceContainerLow: hex(tokens.bg),
    // Menus and picker dialogs: a step off the page.
    surfaceContainer: hex(tokens.shaded),
    surfaceContainerHigh: hex(tokens.shaded),
    // An off switch's track, as the RN switch had it.
    surfaceContainerHighest: hex(tokens.inputDisabled),
    outline: hex(tokens.input),
    outlineVariant: hex(tokens.div),
    error: hex(tokens.error),
    onError: hex(tokens.onStatusFill),
    errorContainer: hex(tokens.errorBg),
    onErrorContainer: hex(tokens.error),
  };
}
