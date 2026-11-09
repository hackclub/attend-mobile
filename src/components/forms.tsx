import React, { ReactNode, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  Badge as KitBadge,
  Button as KitButton,
  Container,
  Icon,
  KeyValue as KitKeyValue,
  StatusGlyph,
  StatusIndicator,
  TextField as KitTextField,
  Toggle,
  icons,
  pressedStyle,
  ripple,
  statusColor,
  type BadgeColor,
  type IconName,
  type StatusType,
} from './ui';
import { useTheme, useThemedStyles, type Theme, type ThemeColors } from '../theme';
import type { IncidentLevel, SelectOption } from '../types';

// Form and detail-page building blocks for the stack screens (incidents,
// messages, inbox, the report form), drawn with the console tokens and the
// UI kit so the same record reads the same on the web and on a phone.

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
    <Container
      title={title}
      description={description ?? undefined}
      actions={right}
      style={styles.section}
      bodyStyle={styles.sectionBody}
    >
      {children}
    </Container>
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
      {error ? (
        <Text style={styles.fieldError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A console input: 1px `input` border, radius 8, accent border while focused. */
export function TextField({ multiline, style, onFocus, onBlur, editable = true, ...props }: TextInputProps) {
  const { tokens, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      style={[
        styles.input,
        multiline && styles.inputMultiline,
        focused && styles.inputFocused,
        !editable && styles.inputDisabled,
        style,
      ]}
      placeholderTextColor={tokens.muted}
      selectionColor={tokens.accent}
      cursorColor={tokens.accent}
      keyboardAppearance={isDark ? 'dark' : 'light'}
      multiline={multiline}
      editable={editable}
      textAlignVertical={multiline ? 'top' : 'center'}
      onFocus={e => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={e => {
        setFocused(false);
        onBlur?.(e);
      }}
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
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.input, styles.selectButton, disabled && styles.inputDisabled, pressedStyle(pressed)]}
        android_ripple={ripple(tokens.pressed)}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${selected?.label ?? placeholder}`}
      >
        <Text style={[styles.selectText, !selected && styles.placeholderText]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={16} color={tokens.muted} />
      </Pressable>
      <PickerSheet visible={open} title={title} onClose={() => setOpen(false)}>
        <FlatList
          data={options}
          keyExtractor={o => o.value}
          renderItem={({ item }) => {
            const optionDisabled = isOptionDisabled?.(item) ?? false;
            const isSelected = item.value === value;
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.optionRow,
                  isSelected && styles.optionSelected,
                  optionDisabled && styles.optionDisabled,
                  pressedStyle(pressed),
                ]}
                android_ripple={ripple(tokens.pressed)}
                disabled={optionDisabled}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: optionDisabled }}
              >
                <View style={styles.flex}>
                  {renderOption ? renderOption(item) : <Text style={styles.optionLabel}>{item.label}</Text>}
                </View>
                {isSelected ? <Icon name="check" size={20} color={tokens.accent} /> : null}
              </Pressable>
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
  const { tokens } = useTheme();
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
      <Pressable
        style={({ pressed }) => [styles.input, styles.selectButton, pressedStyle(pressed)]}
        android_ripple={ripple(tokens.pressed)}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${selected.length} ${selected.length === 1 ? noun[0] : noun[1]} selected`}
      >
        <View style={styles.flex}>
          <Text style={[styles.selectText, !names.length && styles.placeholderText]} numberOfLines={2}>
            {names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '') : `No ${noun[1]} selected`}
          </Text>
        </View>
        {selected.length ? <KitBadge label={String(selected.length)} /> : null}
        <Icon name="chevron-right" size={16} color={tokens.muted} />
      </Pressable>
      <PickerSheet
        visible={open}
        title={title}
        onClose={() => setOpen(false)}
        right={
          <Pressable onPress={() => onChange([])} hitSlop={8} accessibilityRole="button">
            {({ pressed }) => <Text style={[styles.sheetAction, pressedStyle(pressed)]}>Clear all</Text>}
          </Pressable>
        }
      >
        <View style={styles.sheetSearch}>
          <KitTextField
            icon="search"
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            clearable
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
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
              <Pressable
                style={({ pressed }) => [styles.optionRow, pressedStyle(pressed)]}
                android_ripple={ripple(tokens.pressed)}
                onPress={() => toggle(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                <Checkbox checked={checked} />
                <View style={styles.flex}>
                  <Text style={styles.optionLabel} numberOfLines={1}>{item.title}</Text>
                  {item.subtitle ? <Text style={styles.optionSubtitle} numberOfLines={1}>{item.subtitle}</Text> : null}
                </View>
                {item.trailing}
              </Pressable>
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
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" style={styles.sheetSide}>
            {({ pressed }) => <Text style={[styles.sheetAction, pressedStyle(pressed)]}>Done</Text>}
          </Pressable>
          <Text style={styles.sheetTitle} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          <View style={[styles.sheetSide, styles.sheetRight]}>{right}</View>
        </View>
        {children}
      </SafeAreaView>
    </Modal>
  );
}

/** Console checkbox: a 16pt square, accent-filled with a tick when checked. */
function Checkbox({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      style={[
        styles.checkbox,
        checked
          ? { backgroundColor: disabled ? tokens.disabled : tokens.accent, borderColor: disabled ? tokens.disabled : tokens.accent }
          : { borderColor: disabled ? tokens.disabled : tokens.input },
      ]}
    >
      {checked ? <Icon name="check" size={14} strokeWidth={3} color={tokens.accentOn} /> : null}
    </View>
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
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={({ pressed }) => [styles.checkRow, disabled && styles.optionDisabled, pressedStyle(pressed)]}
      android_ripple={ripple(tokens.pressed)}
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
    >
      <Checkbox checked={checked} disabled={disabled} />
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
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.checkRow}>
      <View style={styles.flex}>
        <Text style={styles.optionLabel}>{label}</Text>
        {description ? <Text style={styles.optionSubtitle}>{description}</Text> : null}
      </View>
      <Toggle value={value} onValueChange={onChange} accessibilityLabel={label} />
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
  const { tokens, isDark } = useTheme();
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
          accentColor={tokens.accent}
          onValueChange={(_event, date) => onChange(date)}
        />
      ) : (
        <Pressable
          style={({ pressed }) => [styles.input, styles.selectButton, styles.flex, pressedStyle(pressed)]}
          android_ripple={ripple(tokens.pressed)}
          onPress={() => (Platform.OS === 'ios' ? onChange(new Date()) : openAndroid())}
          accessibilityRole="button"
        >
          <Text style={[styles.selectText, !value && styles.placeholderText]}>
            {value ? formatDateTime(value.toISOString()) : placeholder}
          </Text>
          <Icon name="calendar" size={16} color={tokens.muted} />
        </Pressable>
      )}
      {clearable && value ? (
        <Pressable onPress={() => onChange(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear date">
          {({ pressed }) => (
            <View style={pressedStyle(pressed)}>
              <Icon name="x-circle" size={20} color={tokens.muted} />
            </View>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'link';

// Ionicons names callers used before the kit; mapped onto the kit's glyphs.
const LEGACY_ICONS: Record<string, IconName> = {
  add: 'plus',
  'add-circle': 'plus',
  'ticket-outline': 'ticket',
  'images-outline': 'camera',
  'camera-outline': 'camera',
  'trash-outline': 'trash',
  'create-outline': 'pencil',
  'mail-outline': 'mail',
  refresh: 'refresh',
};

function kitIcon(name?: string): IconName | undefined {
  if (!name) return undefined;
  if (name in icons) return name as IconName;
  return LEGACY_ICONS[name];
}

/** The kit's pill Button, with this module's older variant names. */
export function Button({
  title,
  onPress,
  variant = 'secondary',
  disabled,
  loading,
  icon,
  fullWidth,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName | keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KitButton
      title={title}
      onPress={() => onPress()}
      variant={variant === 'primary' ? 'primary' : variant === 'link' ? 'link' : 'normal'}
      disabled={disabled}
      loading={loading}
      icon={kitIcon(icon)}
      fullWidth={fullWidth}
      style={style}
    />
  );
}

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'pending' | 'progress' | 'stopped';

export function statusType(tone: StatusTone): StatusType {
  return tone === 'progress' ? 'in-progress' : tone;
}

/** The console's status indicator: an icon and a label, never color alone. */
export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  return <StatusIndicator type={statusType(tone)} label={label} />;
}

/**
 * Small console badge (12/20, radius 4). With a `color` it carries a dot in
 * that colour on a quiet fill, so a category hue survives in both schemes
 * without putting coloured text on a coloured background.
 */
export function Badge({ label, color }: { label: string; color?: string | null }) {
  const { tokens, radii } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!color) return <KitBadge label={label} />;
  return (
    <View style={[styles.badge, { backgroundColor: tokens.shaded, borderRadius: radii.badge }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color: tokens.text }]} numberOfLines={1}>
        {label}
      </Text>
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

/** The kit badge colour for a level: red and amber stand out, the rest stay grey. */
export function levelBadgeColor(level?: IncidentLevel | null): BadgeColor {
  if (level?.color === 'red') return 'red';
  if (level?.color === 'amber') return 'yellow';
  return 'grey';
}

/**
 * S0–S3 badge, optionally followed by the level's name (`name`) or its name
 * and target (`full`).
 */
export function LevelBadge({
  level,
  code,
  full,
  name,
}: {
  level?: IncidentLevel | null;
  code: string;
  full?: boolean;
  name?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.levelRow}>
      <KitBadge label={level?.code ?? code.toUpperCase()} color={levelBadgeColor(level)} />
      {full && level ? (
        <Text style={styles.levelText}>
          {level.name} · {level.target}
        </Text>
      ) : name && level ? (
        <Text style={styles.levelText}>{level.name}</Text>
      ) : null}
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
          <KitBadge label={level.code} color={levelBadgeColor(level)} />
          <View style={styles.flex}>
            <Text style={styles.chartTitle}>
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

/** Console key-value pair; `row` (default) puts the label in a fixed column. */
export function KeyValue({
  label,
  children,
  layout = 'row',
}: {
  label: string;
  children: ReactNode;
  layout?: 'row' | 'stacked';
}) {
  return <KitKeyValue label={label} value={children} layout={layout} labelWidth={120} />;
}

/**
 * A soft inline alert: status glyph, tinted fill, body-coloured text. Takes
 * arbitrary children, unlike the kit's solid Flashbar.
 */
export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  children: ReactNode;
}) {
  const { tokens, radii } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const bg = {
    info: tokens.infoBg,
    success: tokens.successBg,
    error: tokens.errorBg,
    warning: tokens.shaded,
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: bg, borderRadius: radii.flash }]}>
      <View style={styles.noticeIcon}>
        <StatusGlyph type={tone} color={statusColor(tone, tokens)} />
      </View>
      <View style={styles.flex}>
        {typeof children === 'string' ? <Text style={styles.noticeText}>{children}</Text> : children}
      </View>
    </View>
  );
}

export function LoadingView() {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={tokens.accent} />
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

function makeStyles(_colors: ThemeColors, theme: Theme) {
  const { tokens: t, type, radii, spacing, hitTarget } = theme;
  return StyleSheet.create({
    flex: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl, backgroundColor: t.bg },
    section: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
    sectionBody: { gap: spacing.lg },
    field: { gap: spacing.xs + 2 },
    fieldLabel: { ...type.label, color: t.text },
    fieldOptional: { fontWeight: '400', color: t.muted },
    fieldDescription: { ...type.body, color: t.text2 },
    fieldError: { ...type.body, color: t.error },
    input: {
      ...type.body,
      minHeight: hitTarget,
      borderRadius: radii.input,
      borderWidth: 1,
      borderColor: t.input,
      backgroundColor: t.bg,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      color: t.text,
      overflow: 'hidden',
    },
    // Thicken the border without shifting the text, as the kit field does.
    inputFocused: { borderWidth: 2, borderColor: t.accent, paddingHorizontal: spacing.md - 1, paddingVertical: 9 },
    inputMultiline: { minHeight: 96 },
    inputDisabled: { backgroundColor: t.inputDisabled, color: t.disabled },
    selectButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    selectText: { ...type.body, flex: 1, color: t.text },
    placeholderText: { color: t.muted },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      minHeight: hitTarget + 8,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: t.div2,
    },
    optionSelected: { backgroundColor: t.selected },
    optionDisabled: { opacity: 0.45 },
    optionLabel: { ...type.body, fontSize: 16, lineHeight: 22, color: t.text },
    optionSubtitle: { ...type.body, color: t.text2 },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: hitTarget, paddingVertical: spacing.xs },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    sheet: { flex: 1, backgroundColor: t.bg },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      minHeight: 56,
      borderBottomWidth: 1,
      borderBottomColor: t.div2,
    },
    sheetSide: { minWidth: 72, minHeight: hitTarget, justifyContent: 'center' },
    sheetTitle: { ...type.h3, flex: 1, textAlign: 'center', color: t.textH },
    sheetRight: { alignItems: 'flex-end' },
    sheetAction: { ...type.label, fontSize: 16, color: t.accent },
    sheetSearch: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
    sheetCount: { ...type.body, color: t.text2, paddingBottom: spacing.sm },
    emptySheet: { ...type.body, textAlign: 'center', color: t.muted, padding: spacing.xxl },
    badge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm,
    },
    badgeDot: { width: 8, height: 8, borderRadius: 4 },
    badgeText: { fontSize: 12, lineHeight: 20 },
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm - 2, flexWrap: 'wrap' },
    levelText: { ...type.body, color: t.text2 },
    chart: { gap: 0 },
    chartRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm + 2, alignItems: 'flex-start' },
    chartDivider: { borderTopWidth: 1, borderTopColor: t.div2 },
    chartTitle: { ...type.label, color: t.textH },
    notice: {
      flexDirection: 'row',
      gap: 10,
      paddingVertical: spacing.md,
      paddingHorizontal: 14,
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
    },
    noticeIcon: { paddingTop: 2 },
    noticeText: { ...type.body, color: t.text },
    empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxxl },
    emptyTitle: { ...type.h3, color: t.textH, textAlign: 'center' },
    emptyText: { ...type.body, color: t.text2, textAlign: 'center' },
  });
}
