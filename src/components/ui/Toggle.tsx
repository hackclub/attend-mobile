import React from 'react';
import { Switch, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { haptics } from '../../services/haptics';

export interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** Required: a switch with no visible label still needs a spoken one. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  /** Hide it from assistive tech when the row around it is the control. */
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The platform switch, tinted with the accent: UISwitch on iOS (the Material 3
 * Compose switch on Android: Toggle.android.tsx). In a row, prefer ListRow's
 * `toggle` so the whole row flips it.
 */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  decorative = false,
  style,
  testID,
}: ToggleProps) {
  const { tokens } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={(next) => {
        haptics.toggle(next);
        onValueChange(next);
      }}
      disabled={disabled}
      trackColor={{ false: tokens.inputDisabled, true: tokens.accent }}
      // No thumb colour on either platform: iOS keeps its white thumb and
      // Android's comes from the Material 3 theme, which keeps the off thumb
      // visible in dark mode (the page colour vanished against the track).
      ios_backgroundColor={tokens.inputDisabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessible={!decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      style={style}
      testID={testID}
    />
  );
}
