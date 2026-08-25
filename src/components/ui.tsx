import React, { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// Shared light-surface primitives for the paper-world tab screens (Events,
// Participants, Travel). The scanner and kiosk keep their own dark camera
// treatment per DESIGN.md — do not use these there.

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
}) {
  return (
    <View style={ui.header}>
      <View style={ui.headerText}>
        <Text style={ui.headerTitle}>{title}</Text>
        {subtitle ? (
          <Text style={ui.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  onClear,
  ...inputProps
}: TextInputProps & { value: string; onChangeText: (text: string) => void; onClear?: () => void }) {
  return (
    <View style={ui.searchField}>
      <Ionicons name="search" size={17} color={colors.gray[400]} />
      <TextInput
        style={ui.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.gray[400]}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        {...inputProps}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => (onClear ? onClear() : onChangeText(''))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function FilterChip({
  label,
  active,
  icon,
  badge,
  onPress,
}: {
  label: string;
  active?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  badge?: string | number | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[ui.chip, active && ui.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      {icon ? (
        <Ionicons name={icon} size={14} color={active ? colors.white : colors.gray[600]} />
      ) : null}
      <Text style={[ui.chipText, active && ui.chipTextActive]}>{label}</Text>
      {badge != null && badge !== '' ? (
        <View style={[ui.chipBadge, active && ui.chipBadgeActive]}>
          <Text style={[ui.chipBadgeText, active && ui.chipBadgeTextActive]}>{badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// The paper world's card material: white, hairline border, soft low shadow.
export const cardSurface = {
  backgroundColor: colors.white,
  borderRadius: 16,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: colors.gray[200],
  shadowColor: colors.black,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
} as const;

export const ui = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerText: { flex: 1, gap: 2 },
  headerTitle: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.gray[900],
  },
  headerSubtitle: { fontSize: 14, color: colors.gray[600] },
  headerAction: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  headerActionText: { fontSize: 14, fontWeight: '600', color: colors.gray[700] },
  headerActionTextDestructive: { color: colors.red },
  searchField: {
    marginHorizontal: 16,
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.gray[900], paddingVertical: 10 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[300],
  },
  chipActive: { backgroundColor: colors.gray[900], borderColor: colors.gray[900] },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.gray[600] },
  chipTextActive: { color: colors.white },
  chipBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: colors.gray[100],
  },
  chipBadgeActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipBadgeText: { fontSize: 12, fontWeight: '700', color: colors.gray[600] },
  chipBadgeTextActive: { color: colors.white },
});
