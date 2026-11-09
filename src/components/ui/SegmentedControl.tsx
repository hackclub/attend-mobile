import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import NativeSegmentedControlClass, {
  type SegmentedControlProps as NativeSegmentedControlProps,
} from '@react-native-segmented-control/segmented-control';
import { useTheme } from '../../theme';
import { haptics } from '../../services/haptics';
import { Icon } from './Icon';
import { ripple, STATE_LAYER_ALPHA } from './pressFeedback';

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
 * A segmented control: the native UISegmentedControl on iOS, Material 3
 * segmented buttons on Android. Labels stay on one line.
 */
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  return Platform.OS === 'ios' ? <IosSegmentedControl {...props} /> : <MaterialSegmentedButtons {...props} />;
}

function IosSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
  testID,
}: SegmentedControlProps<T>) {
  const { tokens, isDark } = useTheme();
  return (
    <NativeSegmentedControl
      values={options.map(segmentLabel)}
      selectedIndex={Math.max(0, options.findIndex((option) => option.value === value))}
      onChange={(event) => {
        const next = options[event.nativeEvent.selectedSegmentIndex];
        if (!next || next.value === value) return;
        haptics.selection();
        onChange(next.value);
      }}
      appearance={isDark ? 'dark' : 'light'}
      fontStyle={{ color: tokens.text }}
      activeFontStyle={{ color: tokens.textH, fontWeight: '600' }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.ios, style]}
      testID={testID}
    />
  );
}

function MaterialSegmentedButtons<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  role = 'radio',
  style,
  testID,
}: SegmentedControlProps<T>) {
  const { tokens, type, radii } = useTheme();
  return (
    <View
      accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'}
      accessibilityLabel={accessibilityLabel}
      style={[styles.strip, { borderColor: tokens.input, borderRadius: radii.pill }, style]}
      testID={testID}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const label = segmentLabel(option);
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(option.value);
            }}
            accessibilityRole={role}
            accessibilityLabel={option.accessibilityLabel ?? label}
            accessibilityState={role === 'tab' ? { selected } : { checked: selected }}
            android_ripple={ripple(tokens.text, { alpha: STATE_LAYER_ALPHA })}
            style={[
              styles.segment,
              index > 0 && { borderLeftWidth: 1, borderLeftColor: tokens.input },
              selected && { backgroundColor: tokens.selected },
            ]}
          >
            {selected ? <Icon name="check" size={16} color={tokens.textH} /> : null}
            <Text
              style={[type.label, styles.label, { color: selected ? tokens.textH : tokens.text }]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ios: { height: 32 },
  strip: { flexDirection: 'row', borderWidth: 1, overflow: 'hidden', minHeight: 40 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  label: { flexShrink: 1 },
});
