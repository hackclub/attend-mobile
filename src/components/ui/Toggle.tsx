import React from 'react';
import { Platform, Switch, type StyleProp, type ViewStyle } from 'react-native';
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
 * The platform switch (UISwitch on iOS, the Material switch on Android),
 * tinted with the accent. In a row, prefer ListRow's `toggle` so the whole
 * row flips it.
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
      // iOS keeps its white thumb; Android's follows the Material switch.
      thumbColor={Platform.OS === 'android' ? (value ? tokens.accentOn : tokens.bg) : undefined}
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
