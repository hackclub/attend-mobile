import React, { ReactNode, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  ActionMenu,
  Badge as KitBadge,
  Button as KitButton,
  Container,
  Icon,
  KeyValue as KitKeyValue,
  StatusGlyph,
  StatusIndicator,
  Toggle,
  pressedStyle,
  PressableSurface,
  ripple,
  ROW_STATE_LAYER_ALPHA,
  statusColor,
  type BadgeColor,
  type IconName,
  type StatusType,
} from './ui';
import { CHROME_MAX_FONT_SCALE } from './ui/fontScale';
import { hackClubColors, useTheme, useThemedStyles, type Theme } from '../theme';
import type { AppStackParamList, IncidentLevel, SelectOption } from '../types';
import { multiSelectSheet, optionsSheet, type MultiSelectSheetItem } from '../navigation/sheetData';

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

/** Up to this many options show as a native menu; more open a sheet. */
const MENU_MAX_OPTIONS = 6;

/**
 * A tappable field for one choice: a native menu for a short list, the
 * options sheet for a longer one or one with custom rows.
 */
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
  const { tokens, radii } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const selected = options.find(o => o.value === value);
  const label = selected?.label ?? placeholder;
  const claimSheet = optionsSheet.useOpener({
    title,
    options: options.map(option => ({ ...option, disabled: isOptionDisabled?.(option) ?? false })),
    selected: value,
    onSelect: onChange,
    renderOption,
  });

  const face = (
    <>
      <Text style={[styles.selectText, !selected && styles.placeholderText]} numberOfLines={1}>
        {label}
      </Text>
      <Icon name="chevron-down" size={16} color={tokens.muted} />
    </>
  );

  if (!renderOption && !disabled && options.length <= MENU_MAX_OPTIONS) {
    return (
      <ActionMenu
        accessibilityLabel={`${title}: ${label}`}
        feedbackRadius={radii.input}
        actions={options.map(option => ({
          key: option.value,
          title: option.label,
          checked: option.value === value,
          disabled: isOptionDisabled?.(option) ?? false,
          onSelect: () => onChange(option.value),
        }))}
      >
        <View style={[styles.selectShape, styles.selectButton]}>{face}</View>
      </ActionMenu>
    );
  }

  return (
    <PressableSurface
      style={[styles.selectShape, disabled && styles.inputDisabled]}
      contentStyle={styles.selectButton}
      rippleColor={tokens.text}
      onPress={() => {
        claimSheet();
        navigation.navigate('OptionsSheet');
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${label}`}
    >
      {face}
    </PressableSurface>
  );
}

export type MultiSelectItem = MultiSelectSheetItem;

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
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const names = items.filter(i => selectedSet.has(i.id)).map(i => i.title);
  const claimSheet = multiSelectSheet.useOpener({ title, items, selected, onChange, noun, searchPlaceholder });

  return (
    <PressableSurface
      style={styles.selectShape}
      contentStyle={styles.selectButton}
      rippleColor={tokens.text}
      onPress={() => {
        claimSheet();
        navigation.navigate('MultiSelectSheet');
      }}
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
    </PressableSurface>
  );
}

/** Console checkbox: a 16pt square, accent-filled with a tick when checked. */
export function Checkbox({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
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
      android_ripple={ripple(tokens.text, { alpha: ROW_STATE_LAYER_ALPHA })}
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
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // The whole row flips the switch.
  return (
    <Pressable
      style={({ pressed }) => [styles.checkRow, pressedStyle(pressed)]}
      android_ripple={ripple(tokens.text, { alpha: ROW_STATE_LAYER_ALPHA })}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={[label, description].filter(Boolean).join(', ')}
      accessibilityState={{ checked: value }}
    >
      <View style={styles.flex}>
        <Text style={styles.optionLabel}>{label}</Text>
        {description ? <Text style={styles.optionSubtitle}>{description}</Text> : null}
      </View>
      <Toggle value={value} onValueChange={onChange} accessibilityLabel={label} decorative />
    </Pressable>
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
        <PressableSurface
          style={[styles.selectShape, styles.flex]}
          contentStyle={styles.selectButton}
          rippleColor={tokens.text}
          onPress={() => (Platform.OS === 'ios' ? onChange(new Date()) : openAndroid())}
          accessibilityRole="button"
        >
          <Text style={[styles.selectText, !value && styles.placeholderText]}>
            {value ? formatDateTime(value.toISOString()) : placeholder}
          </Text>
          <Icon name="calendar" size={16} color={tokens.muted} />
        </PressableSurface>
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
  icon?: IconName;
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
      icon={icon}
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
      <Text style={[styles.badgeText, { color: tokens.text }]} numberOfLines={1} maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}>
        {label}
      </Text>
    </View>
  );
}

const LEVEL_COLORS: Record<string, string> = {
  red: hackClubColors.red,
  amber: hackClubColors.orange,
  green: hackClubColors.green,
  blue: hackClubColors.blue,
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

function makeStyles(theme: Theme) {
  const { tokens: t, type, radii, spacing, hitTarget } = theme;
  return StyleSheet.create({
    flex: { flex: 1 },
    section: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
    sectionBody: { gap: spacing.lg },
    field: { gap: spacing.xs + 2 },
    fieldLabel: { ...type.label, color: t.text },
    fieldOptional: { fontWeight: type.body.fontWeight, color: t.muted },
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
    // A pressable field: the shape clips the ripple, the content lays out inside.
    selectShape: {
      borderRadius: radii.input,
      borderWidth: 1,
      borderColor: t.input,
      backgroundColor: t.bg,
    },
    selectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      // hitTarget including the 1px border.
      minHeight: hitTarget - 2,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    selectText: { ...type.body, flex: 1, color: t.text },
    placeholderText: { color: t.muted },
    optionDisabled: { opacity: 0.45 },
    optionLabel: { ...type.body, fontSize: type.h3.fontSize, lineHeight: type.h2.lineHeight, color: t.text },
    optionSubtitle: { ...type.body, color: t.text2 },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: radii.badge,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: hitTarget, paddingVertical: spacing.xs },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    badge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm,
    },
    badgeDot: { width: 8, height: 8, borderRadius: radii.pill },
    badgeText: { ...type.small, lineHeight: type.body.lineHeight },
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
  });
}
