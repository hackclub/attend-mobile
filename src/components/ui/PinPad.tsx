import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { haptics } from '../../services/haptics';
import { useTheme } from '../../theme';
import { Icon, type IconName } from './Icon';
import { PressableSurface } from './PressableSurface';

export interface PinPadProps {
  /** The digits entered so far. */
  value: string;
  onChange: (value: string) => void;
  length: number;
  /** Shows the dots in the error colour, e.g. after a wrong PIN. */
  error?: boolean;
  /** Ignores key presses, e.g. while locked out. */
  disabled?: boolean;
  /** The key left of 0, e.g. biometrics. Blank without one. */
  extraKey?: { icon: IconName; accessibilityLabel: string; onPress: () => void };
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

/**
 * PIN dots over an on-screen number pad, for kiosk mode. It never opens the
 * system keyboard, so nothing resizes the window under a sheet, and the keys
 * stay in the same place on every device.
 */
export function PinPad({ value, onChange, length, error = false, disabled = false, extraKey }: PinPadProps) {
  const { tokens, type, radii } = useTheme();

  const press = (digit: string) => {
    if (disabled || value.length >= length) return;
    haptics.impact('light');
    onChange(value + digit);
  };
  const backspace = () => {
    if (disabled || value.length === 0) return;
    haptics.impact('light');
    onChange(value.slice(0, -1));
  };

  const key = (digit: string) => (
    <PressableSurface
      key={digit}
      onPress={() => press(digit)}
      disabled={disabled}
      rippleColor={tokens.textH}
      style={[styles.key, { backgroundColor: tokens.shaded, borderRadius: radii.pill }, disabled && styles.disabled]}
      contentStyle={styles.keyContent}
      accessibilityRole="button"
      accessibilityLabel={digit}
    >
      <Text style={[type.h1, styles.digit, { color: tokens.textH }]} maxFontSizeMultiplier={1.3}>
        {digit}
      </Text>
    </PressableSurface>
  );

  const dotColor = error ? tokens.error : tokens.accent;

  return (
    <View style={styles.root}>
      <View
        style={styles.dots}
        accessible
        accessibilityLabel={`PIN, ${value.length} of ${length} digits entered`}
        accessibilityLiveRegion="polite"
      >
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                { borderRadius: radii.pill, borderColor: error ? tokens.error : filled ? dotColor : tokens.input },
                filled && { backgroundColor: dotColor },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.pad}>
        {ROWS.map((row) => (
          <View key={row[0]} style={styles.row}>
            {row.map(key)}
          </View>
        ))}
        <View style={styles.row}>
          {extraKey ? (
            <PressableSurface
              onPress={extraKey.onPress}
              disabled={disabled}
              rippleColor={tokens.textH}
              style={[styles.key, { borderRadius: radii.pill }, disabled && styles.disabled]}
              contentStyle={styles.keyContent}
              accessibilityRole="button"
              accessibilityLabel={extraKey.accessibilityLabel}
            >
              <Icon name={extraKey.icon} size={28} color={tokens.accent} />
            </PressableSurface>
          ) : (
            <View style={styles.key} />
          )}
          {key('0')}
          <PressableSurface
            onPress={backspace}
            onLongPress={() => !disabled && onChange('')}
            disabled={disabled || value.length === 0}
            rippleColor={tokens.textH}
            style={[styles.key, { borderRadius: radii.pill }, value.length === 0 && styles.hidden]}
            contentStyle={styles.keyContent}
            accessibilityRole="button"
            accessibilityLabel="Delete"
          >
            <Icon name="backspace" size={28} color={tokens.text2} />
          </PressableSurface>
        </View>
      </View>
    </View>
  );
}

const KEY_SIZE = 72;

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 28 },
  dots: { flexDirection: 'row', gap: 18, paddingVertical: 4 },
  dot: { width: 16, height: 16, borderWidth: 2 },
  pad: { gap: 14 },
  row: { flexDirection: 'row', gap: 24 },
  key: { width: KEY_SIZE, height: KEY_SIZE },
  keyContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  digit: { fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.4 },
  hidden: { opacity: 0 },
});
