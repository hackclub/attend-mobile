import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useTheme } from '../../theme';

export interface DashedDividerProps {
  /** Defaults to the strong divider token. */
  color?: string;
  /** Stroke width in points. */
  thickness?: number;
  /** Dash length and the gap after it. */
  dash?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A horizontal dashed rule, e.g. a ticket's perforation. Drawn with SVG
 * because a one-sided dashed border doesn't render on Android.
 */
export function DashedDivider({ color, thickness = 1.5, dash = 6, gap = 5, style }: DashedDividerProps) {
  const { tokens } = useTheme();
  return (
    <View style={[{ height: thickness }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={thickness}>
        <Line
          x1="0"
          y1={thickness / 2}
          x2="100%"
          y2={thickness / 2}
          stroke={color ?? tokens.div}
          strokeWidth={thickness}
          strokeDasharray={[dash, gap]}
        />
      </Svg>
    </View>
  );
}
