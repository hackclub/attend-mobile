import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useTheme, type TintName } from '../../theme';

export interface AvatarProps {
  /** Used for the initials, the default tint and the accessibility label. */
  name: string;
  /** Photo URI. Initials show while it loads and if it fails. */
  uri?: string | null;
  size?: number;
  /** Defaults to a stable tint picked from the name. */
  tint?: TintName;
  /** Hide from screen readers when the name is already read nearby. */
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TINTS: TintName[] = ['red', 'indigo', 'sky', 'teal', 'amber', 'purple', 'green'];

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

export function tintFor(name: string): TintName {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}

export function Avatar({ name, uri, size = 40, tint, decorative = false, style, testID }: AvatarProps) {
  const { tokens } = useTheme();
  const { bg, fg } = tokens.tint[tint ?? tintFor(name)];
  const round = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View
      style={[styles.avatar, round, { backgroundColor: bg }, style]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : name}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      testID={testID}
    >
      <Text
        style={[styles.initials, { color: fg, fontSize: Math.round(size * 0.34) }]}
        allowFontScaling={false}
      >
        {initialsFor(name)}
      </Text>
      {uri ? (
        <Image source={{ uri }} style={[StyleSheet.absoluteFill, round]} contentFit="cover" transition={120} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  initials: { fontWeight: '700' },
});
