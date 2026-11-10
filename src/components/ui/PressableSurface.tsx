import React, { useState, type ReactNode } from 'react';
import {
  Animated,
  experimental_LayoutConformance as LayoutConformance,
  Pressable,
  type GestureResponderEvent,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { isAndroid, pressedStyle, ripple, STATE_LAYER_ALPHA } from './pressFeedback';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  /**
   * Shrink to this scale while held (e.g. 0.98), for cards and tiles, on top
   * of the ripple or dimming. Off with Reduce Motion.
   */
  pressScale?: number;
  children?: ReactNode;
}

/**
 * A pressable whose Android ripple stays inside its rounded shape. The shape
 * is an outer view that clips (radius, border, background); the Pressable
 * inside it fills the shape, lays out the content and carries the ripple
 * under it. It takes touches itself (`box-only`), not its content, so the
 * ripple starts where the finger is. On iOS it is one Pressable that dims
 * while held.
 *
 * Android only delivers a touch to a child of a clipping view when it lands
 * inside that view, so `hitSlop` goes on the outer view too; without it a
 * slop outside the shape never reaches the Pressable.
 *
 * The Pressable grows to fill a shape larger than its content (a fixed-size
 * icon button, a tile stretched by its row), so the shape is laid out with
 * strict (CSS) flexbox. React Native's default Yoga errata include
 * StretchFlexBasis: an auto-height box with a growing child, measured
 * against the space its parent has (any alignment but stretch, e.g.
 * `alignSelf: 'flex-start'` or a row's `alignItems: 'center'`), grows to
 * fill that space instead of fitting its content. In a ScrollView that is
 * the whole content's height, so a back link or an inline button became
 * thousands of points tall. Yoga's strict mode only gets one level of
 * growing right, so only the box inside the shape grows (the Pressable on
 * Android, the content view on iOS), and the caller's content keeps the
 * default layout.
 */
export function PressableSurface({
  style,
  contentStyle,
  rippleColor,
  rippleAlpha = STATE_LAYER_ALPHA,
  rippleForeground = false,
  pressedOpacity,
  pressScale,
  children,
  hitSlop,
  onPressIn,
  onPressOut,
  ...pressableProps
}: PressableSurfaceProps) {
  const reduceMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);
  const dips = pressScale != null && !reduceMotion;
  const press = (down: boolean) => {
    setPressed(down);
    if (!dips) return;
    Animated.timing(scale, {
      toValue: down ? pressScale : 1,
      duration: down ? 90 : 160,
      useNativeDriver: true,
    }).start();
  };
  const handlePressIn = (e: GestureResponderEvent) => {
    press(true);
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    press(false);
    onPressOut?.(e);
  };
  const dip = dips ? { transform: [{ scale }] } : null;
  const shape = (pressed: boolean) => (typeof style === 'function' ? style(pressed) : style);
  // The caller's content keeps React Native's default layout.
  const content = <LayoutConformance mode="compatibility">{children}</LayoutConformance>;

  if (isAndroid) {
    return (
      <LayoutConformance mode="strict">
        <Animated.View style={[shape(false), styles.clip, dip]} hitSlop={hitSlop}>
          <Pressable
            {...pressableProps}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            hitSlop={hitSlop}
            android_ripple={ripple(rippleColor, { alpha: rippleAlpha, foreground: rippleForeground })}
            pointerEvents="box-only"
            style={[styles.fill, contentStyle]}
          >
            {content}
          </Pressable>
        </Animated.View>
      </LayoutConformance>
    );
  }

  return (
    <LayoutConformance mode="strict">
      {/* Pressed is tracked here, not read from a style function, so the style can carry the animated scale. */}
      <AnimatedPressable
        {...pressableProps}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        hitSlop={hitSlop}
        style={[shape(pressed), pressedOpacity === null ? null : pressedStyle(pressed, pressedOpacity), dip]}
      >
        <View style={[styles.fill, contentStyle]}>{content}</View>
      </AnimatedPressable>
    </LayoutConformance>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  fill: { flexGrow: 1 },
});
