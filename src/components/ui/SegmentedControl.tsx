import React, { useState } from 'react';
import { PixelRatio, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import NativeSegmentedControlClass, {
  type SegmentedControlProps as NativeSegmentedControlProps,
} from '@react-native-segmented-control/segmented-control';
import { useTheme } from '../../theme';
import { haptics } from '../../services/haptics';
import { iosSegmentFontSize } from './segmentFontSize';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Shown after the label on the same line: "Arrivals · 14". */
  count?: string | number;
  accessibilityLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers, e.g. "Theme". */
  accessibilityLabel: string;
  /** `radio` for a setting (Appearance), `tab` for a view switcher (People). */
  role?: 'radio' | 'tab';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// The package types its class against older React typings.
const NativeSegmentedControl =
  NativeSegmentedControlClass as unknown as React.ComponentType<NativeSegmentedControlProps>;

const segmentLabel = (option: SegmentOption<string>) =>
  option.count != null ? `${option.label} · ${option.count}` : option.label;

/**
 * A segmented control: the native UISegmentedControl on iOS (Material 3
 * segmented buttons on Android: SegmentedControl.android.tsx). Labels are
 * never cut off: iOS shrinks the font a little.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
  testID,
}: SegmentedControlProps<T>) {
  const { tokens, isDark } = useTheme();
  const [width, setWidth] = useState(0);
  const values = options.map(segmentLabel);
  const fontSize = iosSegmentFontSize(values, width, PixelRatio.getFontScale());
  return (
    <NativeSegmentedControl
      values={values}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      selectedIndex={Math.max(0, options.findIndex((option) => option.value === value))}
      onChange={(event) => {
        const next = options[event.nativeEvent.selectedSegmentIndex];
        if (!next || next.value === value) return;
        haptics.segment();
        onChange(next.value);
      }}
      appearance={isDark ? 'dark' : 'light'}
      fontStyle={{ color: tokens.text, fontSize }}
      activeFontStyle={{ color: tokens.textH, fontWeight: '600', fontSize }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.ios, style]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  ios: { height: 32 },
});
