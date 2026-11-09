import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { haptics } from '../../services/haptics';
import { ripple, STATE_LAYER_ALPHA } from './pressFeedback';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Optional second line, e.g. a count. */
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

/** Console segmented control: bordered strip, selected segment tinted. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  role = 'radio',
  style,
  testID,
}: SegmentedControlProps<T>) {
  const { tokens, type, radii } = useTheme();
  const hasCounts = options.some((o) => o.count != null);

  return (
    <View
      accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'}
      accessibilityLabel={accessibilityLabel}
      style={[styles.strip, { borderColor: tokens.input, borderRadius: radii.input }, style]}
      testID={testID}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(option.value);
            }}
            accessibilityRole={role}
            accessibilityLabel={
              option.accessibilityLabel ??
              (option.count != null ? `${option.label}, ${option.count}` : option.label)
            }
            accessibilityState={role === 'tab' ? { selected } : { checked: selected }}
            android_ripple={ripple(tokens.text, { alpha: STATE_LAYER_ALPHA })}
            style={[
              styles.segment,
              hasCounts ? styles.withCount : styles.single,
              index > 0 && { borderLeftWidth: 1, borderLeftColor: tokens.input },
              selected && { backgroundColor: tokens.selected },
            ]}
          >
            <Text
              style={[selected || hasCounts ? type.label : type.body, { color: selected ? tokens.accent : tokens.text }]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
            {option.count != null ? (
              <Text style={[type.body, { color: selected ? tokens.accent : tokens.text2 }]} numberOfLines={1}>
                {option.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', borderWidth: 1, overflow: 'hidden' },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  single: { minHeight: 40 },
  withCount: { paddingVertical: 6, minHeight: 44 },
});
