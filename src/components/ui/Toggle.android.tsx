import React from 'react';
import { View } from 'react-native';
import { Switch } from '@expo/ui/jetpack-compose';
import { semantics, testID as testIDModifier } from '@expo/ui/jetpack-compose/modifiers';
import { haptics } from '../../services/haptics';
import { MaterialHost } from './MaterialHost';
import type { ToggleProps } from './Toggle';

/**
 * Android: the Material 3 switch (Jetpack Compose), in the app's theme: the
 * accent track when on, the outlined track and thumb when off. See Toggle.tsx
 * for iOS.
 */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  decorative = false,
  style,
  testID,
}: ToggleProps) {
  const modifiers = [
    ...(decorative ? [] : [semantics({ contentDescription: accessibilityLabel })]),
    ...(testID ? [testIDModifier(testID)] : []),
  ];
  return (
    // When the row around it is the control, the switch is hidden from
    // TalkBack, which reads the row (and its checked state) instead.
    <View style={style} importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}>
      <MaterialHost matchContents>
        <Switch
          value={value}
          enabled={!disabled}
          onCheckedChange={(next) => {
            haptics.toggle(next);
            onValueChange(next);
          }}
          modifiers={modifiers}
        />
      </MaterialHost>
    </View>
  );
}
