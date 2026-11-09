import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { isAndroid, pressedStyle, ripple, STATE_LAYER_ALPHA } from './pressFeedback';

export interface PressableSurfaceProps extends Omit<PressableProps, 'style' | 'android_ripple' | 'children'> {
  /**
   * The shape: border radius, border, background, size, margins and flex.
   * A function gets `pressed` on iOS only; Android ripples instead.
   */
  style?: StyleProp<ViewStyle> | ((pressed: boolean) => StyleProp<ViewStyle>);
  /** Layout of the content inside the shape: padding, direction, alignment. */
  contentStyle?: StyleProp<ViewStyle>;
  /** The content colour; the ripple is this at `rippleAlpha`. */
  rippleColor: string;
  rippleAlpha?: number;
  /**
   * Draw the ripple over the content. Only for content that would hide it,
   * like a full-bleed photo, and only with a translucent colour.
   */
  rippleForeground?: boolean;
  /** iOS pressed opacity, or null to leave the pressed look to `style`. */
  pressedOpacity?: number | null;
  children?: ReactNode;
}

/**
 * A pressable whose Android ripple stays inside its rounded shape. The shape
 * is an outer view that clips (radius, border, background); the Pressable
 * inside it carries the ripple under the content. The content ignores
 * touches so the ripple starts where the finger is. On iOS it is one
 * Pressable that dims while held.
 *
 * Android only delivers a touch to a child of a clipping view when it lands
 * inside that view, so `hitSlop` goes on the outer view too; without it a
 * slop outside the shape never reaches the Pressable.
 */
export function PressableSurface({
  style,
  contentStyle,
  rippleColor,
  rippleAlpha = STATE_LAYER_ALPHA,
  rippleForeground = false,
  pressedOpacity,
  children,
  hitSlop,
  ...pressableProps
}: PressableSurfaceProps) {
  const shape = (pressed: boolean) => (typeof style === 'function' ? style(pressed) : style);
  const content = (
    <View pointerEvents="none" style={[styles.fill, contentStyle]}>
      {children}
    </View>
  );

  if (isAndroid) {
    return (
      <View style={[shape(false), styles.clip]} hitSlop={hitSlop}>
        <Pressable
          {...pressableProps}
          hitSlop={hitSlop}
          android_ripple={ripple(rippleColor, { alpha: rippleAlpha, foreground: rippleForeground })}
          style={styles.fill}
        >
          {content}
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      {...pressableProps}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        shape(pressed),
        pressedOpacity === null ? null : pressedStyle(pressed, pressedOpacity),
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  fill: { flexGrow: 1 },
});
