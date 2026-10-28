import React, { ReactNode, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SearchField, makeCardSurface } from './ui';
import { useTheme, useThemedStyles, type Theme, type ThemeColors } from '../theme';
import type { IncidentLevel, SelectOption } from '../types';

// Form and detail-page building blocks for the paper-world stack screens
// (incidents, messages, inbox, the report form). They mirror the console's
// containers, fields and status pills so the same record reads the same on
// the web and on a phone.

export function Section({
  title,
  description,
  right,
  children,
}: {
  title?: string;
  description?: string | null;
  right?: ReactNode;
  children: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionHeader}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function Field({
  label,
  optional,
  description,
  error,
  children,
}: {
  label: string;
  optional?: boolean | string;
  description?: string | null;
  error?: string | null;
  children: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? (
          <Text style={styles.fieldOptional}>{typeof optional === 'string' ? ` - ${optional}` : ' - optional'}</Text>
        ) : null}
      </Text>
      {description ? <Text style={styles.fieldDescription}>{description}</Text> : null}
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function TextField({ multiline, style, ...props }: TextInputProps) {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline, style]}
      placeholderTextColor={colors.gray[400]}
      keyboardAppearance={isDark ? 'dark' : 'light'}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      {...props}
    />
  );
}

/** A tappable field that opens a native-feeling picker sheet. */
export function SelectField({
  value,
  options,
  onChange,
  placeholder = 'Select',
  title,
  disabled,
  isOptionDisabled,
  renderOption,
}: {
  value: string | null | undefined;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  title: string;
  disabled?: boolean;
  isOptionDisabled?: (option: SelectOption) => boolean;
  renderOption?: (option: SelectOption) => ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <>
      <TouchableOpacity
        style={[styles.input, styles.selectButton, disabled && styles.inputDisabled]}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${selected?.label ?? placeholder}`}
      >
        <Text style={[styles.selectText, !selected && styles.placeholderText]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.gray[500]} />
      </TouchableOpacity>
      <PickerSheet visible={open} title={title} onClose={() => setOpen(false)}>
        <FlatList
          data={options}
          keyExtractor={o => o.value}
          renderItem={({ item }) => {
            const optionDisabled = isOptionDisabled?.(item) ?? false;
            return (
              <TouchableOpacity
                style={[styles.optionRow, optionDisabled && styles.optionDisabled]}
                disabled={optionDisabled}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                accessibilityState={{ selected: item.value === value, disabled: optionDisabled }}
              >
                <View style={styles.flex}>
                  {renderOption ? renderOption(item) : <Text style={styles.optionLabel}>{item.label}</Text>}
                </View>
                {item.value === value ? <Ionicons name="checkmark" size={20} color={colors.text.accent} /> : null}
              </TouchableOpacity>
            );
          }}
        />
      </PickerSheet>
    </>
  );
}

export interface MultiSelectItem {
  id: string;
  title: string;
  subtitle?: string | null;
  trailing?: ReactNode;
}

/**
 * A searchable checklist in a sheet, for picking participants or staff. The
 * field itself shows the count and the first few names.
 */
export function MultiSelectField({
  title,
  items,
  selected,
  onChange,
  noun,
  searchPlaceholder = 'Search',
}: {
  title: string;
  items: MultiSelectItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  noun: [string, string];
  searchPlaceholder?: string;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const names = items.filter(i => selectedSet.has(i.id)).map(i => i.title);

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return items;
    return items.filter(item => {
      const haystack = `${item.title} ${item.subtitle ?? ''}`.toLowerCase();
      return terms.every(t => haystack.includes(t));
    });
  }, [items, query]);

  const toggle = (id: string) => {
    onChange(selectedSet.has(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };

  return (
    <>
      <TouchableOpacity style={[styles.input, styles.selectButton]} onPress={() => setOpen(true)} accessibilityRole="button">
        <View style={styles.flex}>
          <Text style={[styles.selectText, !names.length && styles.placeholderText]} numberOfLines={2}>
            {names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '') : `No ${noun[1]} selected`}
          </Text>
        </View>
        <Text style={styles.countText}>{selected.length}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.gray[500]} />
      </TouchableOpacity>
      <PickerSheet
        visible={open}
        title={title}
        onClose={() => setOpen(false)}
        right={
          <TouchableOpacity onPress={() => onChange([])} hitSlop={8}>
            <Text style={styles.sheetAction}>Clear all</Text>
          </TouchableOpacity>
        }
      >
        <View style={styles.sheetSearch}>
          <SearchField value={query} onChangeText={setQuery} placeholder={searchPlaceholder} />
          <Text style={styles.sheetCount}>
            {selected.length} {selected.length === 1 ? noun[0] : noun[1]} selected
          </Text>
        </View>
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const checked = selectedSet.has(item.id);
            return (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => toggle(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                <Ionicons
                  name={checked ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={checked ? colors.text.accent : colors.gray[400]}
                />
                <View style={styles.flex}>
                  <Text style={styles.optionLabel} numberOfLines={1}>{item.title}</Text>
                  {item.subtitle ? <Text style={styles.optionSubtitle} numberOfLines={1}>{item.subtitle}</Text> : null}
                </View>
                {item.trailing}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptySheet}>No matches</Text>}
        />
      </PickerSheet>
    </>
  );
}

export function PickerSheet({
  visible,
  title,
  onClose,
  right,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Text style={styles.sheetAction}>Done</Text>
          </TouchableOpacity>
          <Text style={styles.sheetTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.sheetRight}>{right}</View>
        </View>
        {children}
      </SafeAreaView>
    </Modal>
  );
}

export function CheckboxRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={[styles.checkRow, disabled && styles.optionDisabled]}
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
    >
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? colors.text.accent : colors.gray[400]}
      />
      <View style={styles.flex}>
        <Text style={styles.optionLabel}>{label}</Text>
        {description ? <Text style={styles.optionSubtitle}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

export function SwitchRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string | null;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.checkRow}>
      <View style={styles.flex}>
        <Text style={styles.optionLabel}>{label}</Text>
        {description ? <Text style={styles.optionSubtitle}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.gray[300], true: colors.blue }}
        thumbColor={colors.white}
      />
    </View>
  );
}

/**
 * A date and time, or none. iOS shows the compact inline picker; Android
 * opens its date dialog and then its time dialog.
 */
export function DateTimeField({
  value,
  onChange,
  minimumDate,
  clearable = true,
  placeholder = 'Not set',
}: {
  value: Date | null;
  onChange: (value: Date | null) => void;
  minimumDate?: Date;
  clearable?: boolean;
  placeholder?: string;
}) {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const openAndroid = () => {
    const start = value ?? new Date();
    DateTimePickerAndroid.open({
      value: start,
      mode: 'date',
      minimumDate,
      onValueChange: (_event, date) => {
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onValueChange: (_e, time) => onChange(time),
        });
      },
    });
  };

  return (
    <View style={styles.dateRow}>
      {Platform.OS === 'ios' && value ? (
        <DateTimePicker
          value={value}
          mode="datetime"
          display="compact"
          minimumDate={minimumDate}
          themeVariant={isDark ? 'dark' : 'light'}
          accentColor={colors.text.accent}
          onValueChange={(_event, date) => onChange(date)}
        />
      ) : (
        <TouchableOpacity
          style={[styles.input, styles.selectButton, styles.flex]}
          onPress={() => (Platform.OS === 'ios' ? onChange(new Date()) : openAndroid())}
          accessibilityRole="button"
        >
          <Text style={[styles.selectText, !value && styles.placeholderText]}>
            {value ? formatDateTime(value.toISOString()) : placeholder}
          </Text>
          <Ionicons name="calendar-outline" size={16} color={colors.gray[500]} />
        </TouchableOpacity>
      )}
      {clearable && value ? (
        <TouchableOpacity onPress={() => onChange(null)} hitSlop={8} accessibilityLabel="Clear date">
          <Ionicons name="close-circle" size={20} color={colors.gray[400]} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'link';

export function Button({
  title,
  onPress,
  variant = 'secondary',
  disabled,
  loading,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const textColor = variant === 'primary'
    ? colors.white
    : variant === 'destructive' || variant === 'link'
      ? colors.text.accent
      : colors.gray[800];

  return (
    <TouchableOpacity
      style={[
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'link' && styles.buttonLink,
        (disabled || loading) && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={16} color={textColor} /> : null}
          <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'pending' | 'progress' | 'stopped';

/** The console's status indicator: an icon and a label, never color alone. */
export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { icon, color } = statusAppearance(tone, colors);
  return (
    <View style={styles.status}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.statusText, { color }]}>{label}</Text>
    </View>
  );
}

function statusAppearance(tone: StatusTone, colors: ThemeColors): { icon: keyof typeof Ionicons.glyphMap; color: string } {
  switch (tone) {
    case 'success':
      return { icon: 'checkmark-circle', color: colors.status.success };
    case 'warning':
      return { icon: 'alert-circle', color: colors.status.warning };
    case 'error':
      return { icon: 'close-circle', color: colors.status.error };
    case 'progress':
      return { icon: 'sync-circle', color: colors.status.info };
    case 'pending':
      return { icon: 'time', color: colors.gray[500] };
    case 'stopped':
      return { icon: 'remove-circle', color: colors.gray[500] };
    default:
      return { icon: 'information-circle', color: colors.status.info };
  }
}

export function Badge({ label, color }: { label: string; color?: string | null }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tint = color ?? colors.gray[500];
  return (
    <View style={[styles.badge, { backgroundColor: `${tint}22`, borderColor: `${tint}55` }]}>
      <Text style={[styles.badgeText, { color: color ? tint : colors.gray[700] }]}>{label}</Text>
    </View>
  );
}

const LEVEL_COLORS: Record<string, string> = {
  red: '#EC3750',
  amber: '#FF8C37',
  green: '#33D6A6',
  blue: '#338EDA',
};

export function levelColor(level?: IncidentLevel | null): string | undefined {
  return level ? LEVEL_COLORS[level.color] : undefined;
}

/** S0–S3 badge, optionally followed by the level's name and target. */
export function LevelBadge({ level, code, full }: { level?: IncidentLevel | null; code: string; full?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.levelRow}>
      <Badge label={level?.code ?? code.toUpperCase()} color={levelColor(level)} />
      {full && level ? <Text style={styles.levelText}>{level.name} · {level.target}</Text> : null}
    </View>
  );
}

/** The S0–S3 triage chart, as the web form shows under "Which level?". */
export function LevelChart({ levels }: { levels: IncidentLevel[] }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.chart}>
      {levels.map((level, i) => (
        <View key={level.value} style={[styles.chartRow, i > 0 && styles.chartDivider]}>
          <Badge label={level.code} color={levelColor(level)} />
          <View style={styles.flex}>
            <Text style={styles.optionLabel}>
              {level.name}
              <Text style={styles.optionSubtitle}> · {level.target}</Text>
            </Text>
            <Text style={styles.optionSubtitle}>{level.examples.join(' · ')}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text style={styles.kvValue}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { icon, color } = statusAppearance(tone, colors);
  return (
    <View style={[styles.notice, { borderColor: `${color}66`, backgroundColor: `${color}14` }]}>
      <Ionicons name={icon} size={18} color={color} />
      <View style={styles.flex}>
        {typeof children === 'string' ? <Text style={styles.noticeText}>{children}</Text> : children}
      </View>
    </View>
  );
}

export function LoadingView() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.text.accent} />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>Couldn’t load this</Text>
      <Text style={styles.emptyText}>{message}</Text>
      {onRetry ? <Button title="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyText}>{message}</Text> : null}
      {action}
    </View>
  );
}

// "28 Oct 2026, 14:05" in the device's locale and zone.
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// "5 minutes ago", "3 days ago", or the date once it's more than a week off.
export function formatRelative(iso?: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return seconds < 0 ? 'in a moment' : 'just now';

  const steps: [number, string][] = [
    [3600, 'minute'],
    [86400, 'hour'],
    [7 * 86400, 'day'],
  ];
  const sizes: Record<string, number> = { minute: 60, hour: 3600, day: 86400 };
  const step = steps.find(([limit]) => abs < limit);
  if (!step) return formatDateTime(iso);

  const unit = step[1];
  const value = Math.max(1, Math.round(abs / sizes[unit]));
  const label = `${value} ${unit}${value === 1 ? '' : 's'}`;
  return seconds < 0 ? `in ${label}` : `${label} ago`;
}

function makeStyles(colors: ThemeColors, theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
    section: { ...makeCardSurface(colors, theme), marginHorizontal: 16, marginTop: 14 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.gray[900] },
    sectionDescription: { fontSize: 13, color: colors.gray[600], marginTop: 2 },
    sectionBody: { padding: 16, gap: 14 },
    field: { gap: 6 },
    fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.gray[800] },
    fieldOptional: { fontWeight: '400', color: colors.gray[500] },
    fieldDescription: { fontSize: 13, color: colors.gray[600] },
    fieldError: { fontSize: 13, color: colors.status.error },
    input: {
      minHeight: 44,
      borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.gray[300],
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.gray[900],
    },
    inputMultiline: { minHeight: 110 },
    inputDisabled: { opacity: 0.55 },
    selectButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    selectText: { flex: 1, fontSize: 16, color: colors.gray[900] },
    placeholderText: { color: colors.gray[400] },
    countText: { fontSize: 14, fontWeight: '700', color: colors.gray[600] },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.gray[200],
    },
    optionDisabled: { opacity: 0.45 },
    optionLabel: { fontSize: 16, color: colors.gray[900] },
    optionSubtitle: { fontSize: 13, color: colors.gray[600], marginTop: 2 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sheet: { flex: 1, backgroundColor: colors.background },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.gray[200],
    },
    sheetTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.gray[900] },
    sheetRight: { minWidth: 60, alignItems: 'flex-end' },
    sheetAction: { fontSize: 16, fontWeight: '600', color: colors.text.accent, minWidth: 60 },
    sheetSearch: { paddingTop: 12, gap: 8 },
    sheetCount: { fontSize: 13, color: colors.gray[600], paddingHorizontal: 16, paddingBottom: 6 },
    emptySheet: { textAlign: 'center', color: colors.gray[500], padding: 24 },
    button: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.gray[300],
    },
    buttonPrimary: { backgroundColor: colors.red, borderColor: colors.red },
    buttonLink: { backgroundColor: 'transparent', borderColor: 'transparent' },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { fontSize: 15, fontWeight: '700' },
    status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statusText: { fontSize: 13, fontWeight: '600' },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    badgeText: { fontSize: 12, fontWeight: '700' },
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    levelText: { fontSize: 13, color: colors.gray[600] },
    chart: { gap: 0 },
    chartRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' },
    chartDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
    kv: { gap: 3 },
    kvLabel: { fontSize: 12, fontWeight: '600', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.4 },
    kvValue: { fontSize: 15, color: colors.gray[900] },
    notice: {
      flexDirection: 'row',
      gap: 10,
      padding: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      marginHorizontal: 16,
      marginTop: 14,
    },
    noticeText: { fontSize: 14, color: colors.gray[800], lineHeight: 20 },
    empty: { alignItems: 'center', gap: 8, padding: 32 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.gray[900], textAlign: 'center' },
    emptyText: { fontSize: 14, color: colors.gray[600], textAlign: 'center' },
  });
}
