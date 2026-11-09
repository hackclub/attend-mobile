import React from 'react';
import { View } from 'react-native';
import { CircularProgressIndicator } from '@expo/ui/jetpack-compose';
import { fillMaxSize } from '@expo/ui/jetpack-compose/modifiers';
import { MaterialHost } from './MaterialHost';
import type { SpinnerProps } from './Spinner';

const SIZES = { small: 20, large: 36 } as const;

/**
 * Android: Material 3's indeterminate circular progress indicator (Jetpack
 * Compose). See Spinner.tsx for iOS.
 */
export function Spinner({
  size = 'small',
  color,
  accessibilityLabel = 'Loading',
  decorative = false,
}: SpinnerProps) {
  const side = SIZES[size];
  return (
    <View
      style={{ width: side, height: side }}
      {...(decorative
        ? { importantForAccessibility: 'no-hide-descendants' as const }
        : {
          accessible: true,
          accessibilityRole: 'progressbar' as const,
          accessibilityLabel,
          accessibilityState: { busy: true },
        })}
    >
      <MaterialHost style={{ width: side, height: side }}>
        <CircularProgressIndicator
          color={color}
          strokeWidth={size === 'small' ? 2.5 : 4}
          modifiers={[fillMaxSize()]}
        />
      </MaterialHost>
    </View>
  );
}
