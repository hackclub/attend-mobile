import React from 'react';
import { View } from 'react-native';
import {
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, testID as testIDModifier, weight } from '@expo/ui/jetpack-compose/modifiers';
import { haptics } from '../../services/haptics';
import { MaterialHost } from './MaterialHost';
import type { SegmentedControlProps, SegmentOption } from './SegmentedControl';

const segmentLabel = (option: SegmentOption<string>) =>
  option.count != null ? `${option.label} · ${option.count}` : option.label;

/**
 * Android: Material 3 single-choice segmented buttons (Jetpack Compose), in
 * the app's theme. Segments share the width; a long label wraps rather than
 * being cut off. See SegmentedControl.tsx for iOS.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
  testID,
}: SegmentedControlProps<T>) {
  return (
    <View style={style}>
      <MaterialHost matchContents={{ vertical: true }}>
        <SingleChoiceSegmentedButtonRow
          modifiers={[
            fillMaxWidth(),
            // Names the group, e.g. "Theme"; each segment reads as a radio
            // button with its selected state.
            semantics({ contentDescription: accessibilityLabel }),
            ...(testID ? [testIDModifier(testID)] : []),
          ]}
        >
          {options.map((option) => {
            const selected = option.value === value;
            const label = segmentLabel(option);
            return (
              <SegmentedButton
                key={option.value}
                selected={selected}
                onClick={() => {
                  if (selected) return;
                  haptics.segment();
                  onChange(option.value);
                }}
                modifiers={[
                  weight(1),
                  ...(option.accessibilityLabel
                    ? [semantics({ contentDescription: option.accessibilityLabel })]
                    : []),
                ]}
              >
                <SegmentedButton.Label>
                  <ComposeText maxLines={2} style={{ textAlign: 'center' }}>
                    {label}
                  </ComposeText>
                </SegmentedButton.Label>
              </SegmentedButton>
            );
          })}
        </SingleChoiceSegmentedButtonRow>
      </MaterialHost>
    </View>
  );
}
