import React, { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme';
import { Icon, type IconName } from './Icon';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Leading glyph, e.g. `search`. */
  icon?: IconName;
  /** Helper line under the field. */
  hint?: string;
  /** Error line under the field; also turns the border red. */
  error?: string | null;
  /** Show a clear button while there is text. */
  clearable?: boolean;
  /** Grow with content instead of a single 44pt line. */
  multiline?: boolean;
  style?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
}

/** Console input: 1px `input` border, radius 8, 44pt tall. */
export const TextField = forwardRef<React.ComponentRef<typeof TextInput>, TextFieldProps>(function TextField(
  { label, icon, hint, error, clearable = false, multiline = false, style, inputStyle, editable = true, ...input },
  ref,
) {
  const { tokens, type, radii, isDark, hitTarget } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? tokens.error : focused ? tokens.accent : tokens.input;
  const showClear = clearable && Boolean(input.value) && editable;

  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={[type.label, { color: tokens.text }]}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          {
            minHeight: hitTarget,
            borderColor,
            borderRadius: radii.input,
            backgroundColor: editable ? tokens.bg : tokens.inputDisabled,
          },
          focused && !error && styles.focused,
          multiline && styles.multiline,
        ]}
      >
        {icon ? <Icon name={icon} size={16} color={tokens.muted} /> : null}
        <TextInput
          ref={ref}
          {...input}
          editable={editable}
          multiline={multiline}
          accessibilityLabel={input.accessibilityLabel ?? label ?? input.placeholder}
          accessibilityHint={error ?? hint ?? input.accessibilityHint}
          placeholderTextColor={tokens.muted}
          selectionColor={tokens.accent}
          cursorColor={tokens.accent}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[type.body, styles.input, { color: editable ? tokens.text : tokens.disabled }, inputStyle]}
        />
        {showClear ? (
          <Pressable
            onPress={() => input.onChangeText?.('')}
            accessibilityRole="button"
            accessibilityLabel="Clear"
            hitSlop={12}
          >
            <Icon name="x-circle" size={16} color={tokens.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[type.body, { color: tokens.error }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={[type.body, { color: tokens.text2 }]}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  // Thicken the border without shifting the text.
  focused: { borderWidth: 2, paddingHorizontal: 11 },
  multiline: { alignItems: 'flex-start', paddingVertical: 10 },
  input: { flex: 1, paddingVertical: 0, minHeight: 20 },
});
