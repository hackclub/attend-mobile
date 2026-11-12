import React, { useState } from 'react';
import { PixelRatio, View } from 'react-native';
import {
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, height, semantics, testID as testIDModifier, weight } from '@expo/ui/jetpack-compose/modifiers';
import { haptics } from '../../services/haptics';
import { MaterialHost } from './MaterialHost';
import type { SegmentedControlProps, SegmentOption } from './SegmentedControl';
import { androidSegmentWraps } from './segmentFontSize';

// Material's segment label is 14sp on a 20sp line, with 8dp above and below.
const LABEL_LINE_HEIGHT = 20;
const SEGMENT_PADDING_Y = 16;

const segmentLabel = (option: SegmentOption<string>) =>
  option.count != null ? `${option.label} · ${option.count}` : option.label;

/**
 * Android: Material 3 single-choice segmented buttons (Jetpack Compose), in
 * the app's theme. Segments share the width; a long label wraps rather than
 * being cut off, and then every label takes two lines, so the segments stay
 * the same height. See SegmentedControl.tsx for iOS.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
  testID,
}: SegmentedControlProps<T>) {
  const [width, setWidth] = useState(0);
  const fontScale = PixelRatio.getFontScale();
  // A fixed height rather than two lines of text, so a one-line label stays
  // centred in its segment.
  const twoLineHeight = androidSegmentWraps(options.map(segmentLabel), width, fontScale)
    ? Math.ceil(2 * LABEL_LINE_HEIGHT * fontScale + SEGMENT_PADDING_Y)
    : null;
  return (
    <View style={style} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
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
                  ...(twoLineHeight ? [height(twoLineHeight)] : []),
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
