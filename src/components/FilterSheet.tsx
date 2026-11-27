import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { BackHandler, View, Text, StyleSheet, TextInput } from 'react-native';
import { useTheme } from '../theme';
import {
  Button,
  Divider,
  Icon,
  ListRow,
  SegmentedControl,
  Sheet,
  TextField,
  PressableSurface,
  type IconName,
} from './ui';
import {
  BASIC_STATES,
  BASIC_TOGGLES,
  basicFilterCount,
  DEFAULT_SORT,
  FILTER_FIELDS,
  SORT_FIELDS,
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  getField,
  operatorNeedsValue,
  newRuleId,
  ruleIsComplete,
  type SortRule,
  type FilterRule,
  type FilterOperator,
  type FieldOption,
} from '../services/participantFilters';
import { filterSheet, type FilterSheetData } from '../navigation/sheetData';
import { useCloseSheet } from '../navigation/sheetPresenter';
import { useSheetData } from '../screens/sheets/useSheetData';
import { SelectField } from './forms';
import type { SelectOption } from '../types';
import { PARTICIPANT_STATE_LABELS, type ParticipantState } from '../services/participantStatus';


type PickerTarget =
  | { kind: 'field'; ruleId: string }
  | { kind: 'operator'; ruleId: string }
  | { kind: 'value'; ruleId: string };

const SORT_OPTIONS: SelectOption[] = SORT_FIELDS.map(f => ({ value: f.key, label: f.label }));

// What each direction means for each field, in words.
const DIRECTION_LABELS: Record<string, { asc: string; desc: string }> = {
  name: { asc: 'A to Z', desc: 'Z to A' },
  checked_in_at: { asc: 'Earliest first', desc: 'Latest first' },
  status: { asc: 'Here first', desc: 'Invited first' },
  email: { asc: 'A to Z', desc: 'Z to A' },
};

// The direction a field starts in when picked: latest check-ins first.
const FIRST_DIRECTION: Record<string, SortRule['direction']> = { checked_in_at: 'desc' };

/** Name A to Z is the list's own order, kept as no sort at all. */
function normaliseSort(sort: SortRule): SortRule | null {
  return sort.field === DEFAULT_SORT.field && sort.direction === DEFAULT_SORT.direction ? null : sort;
}

type TriState = 'any' | 'yes' | 'no';
const TRI_STATE_OPTIONS: { value: TriState; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const PICKER_TITLES: Record<PickerTarget['kind'], string> = {
  field: 'Select field',
  operator: 'Select condition',
  value: 'Select value',
};

/** People's filter & sort, a drawer opened through `filterSheet`. */
export function FilterSheet() {
  const data = useSheetData(filterSheet);
  return data ? <FilterSheetBody {...data} /> : null;
}

function FilterSheetBody({
  rules,
  onRulesChange,
  conjunction,
  onConjunctionChange,
  sort,
  onSortChange,
  basic,
  onBasicChange,
  onClearAll,
  resultCount,
  savedViews,
  onSaveView,
  onDeleteView,
  filterContext,
}: FilterSheetData) {
  const { tokens, type, radii } = useTheme();
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [viewName, setViewName] = useState('');
  const [isNamingView, setIsNamingView] = useState(false);

  const toggleState = useCallback(
    (state: ParticipantState) => {
      const states = basic.states.includes(state)
        ? basic.states.filter(s => s !== state)
        : [...basic.states, state];
      onBasicChange({ ...basic, states });
    },
    [basic, onBasicChange],
  );

  const addRule = useCallback(() => {
    // Field starts unset so the incomplete rule doesn't apply until the user picks one
    onRulesChange([...rules, { id: newRuleId(), field: '', operator: 'is' }]);
  }, [rules, onRulesChange]);

  const updateRule = useCallback(
    (ruleId: string, patch: Partial<FilterRule>) => {
      onRulesChange(rules.map(r => (r.id === ruleId ? { ...r, ...patch } : r)));
    },
    [rules, onRulesChange],
  );

  const removeRule = useCallback(
    (ruleId: string) => {
      onRulesChange(rules.filter(r => r.id !== ruleId));
    },
    [rules, onRulesChange],
  );

  const pickerOptions = useMemo((): FieldOption[] => {
    if (!picker) return [];
    if (picker.kind === 'field') {
      return FILTER_FIELDS.map(f => ({ value: f.key, label: f.label }));
    }
    const rule = rules.find(r => r.id === picker.ruleId);
    const field = rule ? getField(rule.field) : undefined;
    if (!rule || !field) return [];
    if (picker.kind === 'operator') {
      return OPERATORS_BY_TYPE[field.type].map(op => ({ value: op, label: OPERATOR_LABELS[op] }));
    }
    return field.getOptions?.(filterContext) ?? [];
  }, [picker, rules, filterContext]);

  const pickerSelected = useMemo((): string | undefined => {
    if (!picker) return undefined;
    const rule = rules.find(r => r.id === picker.ruleId);
    if (!rule) return undefined;
    if (picker.kind === 'field') return rule.field;
    if (picker.kind === 'operator') return rule.operator;
    return rule.value;
  }, [picker, rules]);

  const handlePickOption = useCallback(
    (value: string) => {
      if (!picker) return;
      if (picker.kind === 'field') {
        const field = getField(value);
        if (field) {
          // Changing field resets operator + value to valid defaults
          updateRule(picker.ruleId, {
            field: value,
            operator: OPERATORS_BY_TYPE[field.type][0],
            value: undefined,
          });
        }
      } else if (picker.kind === 'operator') {
        const operator = value as FilterOperator;
        updateRule(picker.ruleId, {
          operator,
          ...(operatorNeedsValue(operator) ? {} : { value: undefined }),
        });
      } else {
        updateRule(picker.ruleId, { value });
      }
      setPicker(null);
    },
    [picker, updateRule],
  );

  const handleSaveView = useCallback(() => {
    if (viewName.trim()) {
      onSaveView(viewName);
      setViewName('');
      setIsNamingView(false);
    }
  }, [viewName, onSaveView]);

  const handleClose = useCloseSheet();

  // The back button leaves an option list for the filters, as the list's
  // Back button does, rather than dismissing the whole sheet. This listener
  // is newer than the navigator's, so it runs first. (Android's Material
  // bottom sheet is a window of its own that takes back itself, so there
  // back dismisses the sheet and this doesn't run.)
  useEffect(() => {
    if (!picker) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPicker(null);
      return true;
    });
    return () => sub.remove();
  }, [picker]);

  const effectiveSort = sort ?? DEFAULT_SORT;
  const directionLabels = DIRECTION_LABELS[effectiveSort.field] ?? { asc: 'Ascending', desc: 'Descending' };
  const filterCount = rules.filter(ruleIsComplete).length + basicFilterCount(basic);
  const canSaveView = filterCount > 0 || sort !== null;
  const canClear = rules.length > 0 || basicFilterCount(basic) > 0 || sort !== null;

  const pickerContent = picker ? (
    <Sheet
      title={PICKER_TITLES[picker.kind]}
      action={<Button variant="link" title="Back" icon="back" onPress={() => setPicker(null)} />}
      contentContainerStyle={styles.pickerList}
    >
      {pickerOptions.length === 0 ? (
        <Text style={[type.body, styles.emptyText, { color: tokens.text2 }]}>No options available</Text>
      ) : (
        pickerOptions.map((option, index) => (
          <ListRow
            key={option.value}
            title={option.label}
            onPress={() => handlePickOption(option.value)}
            chevron={false}
            trailing={
              option.value === pickerSelected ? <Icon name="check" size={18} color={tokens.accent} /> : undefined
            }
            divider={index < pickerOptions.length - 1}
          />
        ))
      )}
    </Sheet>
  ) : null;

  const mainContent = (
    <Sheet
      title="Filter and sort"
      footer={(
        <>
          <Text style={[type.body, styles.matchCount, { color: tokens.text2 }]} accessibilityLiveRegion="polite">
            {resultCount} {resultCount === 1 ? 'participant' : 'participants'} shown
          </Text>
          <Button variant="link" title="Clear all" onPress={onClearAll} disabled={!canClear} />
          <Button variant="primary" title="Done" onPress={handleClose} />
        </>
      )}
    >
      <View style={styles.content}>
        <Text style={[type.h3, styles.sectionTitle, { color: tokens.textH }]} accessibilityRole="header">
          Status
        </Text>
        <View style={styles.stateChips}>
          {BASIC_STATES.map(state => (
            <OptionChip
              key={state}
              label={PARTICIPANT_STATE_LABELS[state]}
              selected={basic.states.includes(state)}
              onPress={() => toggleState(state)}
            />
          ))}
        </View>

        {BASIC_TOGGLES.map(toggle => {
          const value = basic[toggle.key];
          return (
            <View key={toggle.key} style={styles.toggleRow}>
              <Text style={[type.body, styles.toggleLabel, { color: tokens.text }]}>{toggle.label}</Text>
              <SegmentedControl
                options={TRI_STATE_OPTIONS}
                value={value === undefined ? 'any' : value ? 'yes' : 'no'}
                onChange={(next: TriState) =>
                  onBasicChange({ ...basic, [toggle.key]: next === 'any' ? undefined : next === 'yes' })
                }
                accessibilityLabel={toggle.label}
                style={styles.toggleControl}
              />
            </View>
          );
        })}

        <Divider style={styles.divider} />

        <Text style={[type.h3, styles.sectionTitle, { color: tokens.textH }]} accessibilityRole="header">
          Sort
        </Text>
        <View style={styles.sortRow}>
          <SelectField
            title="Sort by"
            value={effectiveSort.field}
            options={SORT_OPTIONS}
            onChange={(field) =>
              onSortChange(normaliseSort({ field, direction: FIRST_DIRECTION[field] ?? 'asc' }))
            }
          />
          <SegmentedControl
            options={[
              { value: 'asc', label: directionLabels.asc },
              { value: 'desc', label: directionLabels.desc },
            ]}
            value={effectiveSort.direction}
            onChange={(direction) => onSortChange(normaliseSort({ ...effectiveSort, direction }))}
            accessibilityLabel="Sort direction"
          />
        </View>

        <Divider style={styles.divider} />

        <Text style={[type.h3, styles.sectionTitle, { color: tokens.textH }]} accessibilityRole="header">
          Advanced filters
        </Text>

        {rules.length > 1 && (
          <View style={styles.conjunctionRow}>
            <Text style={[type.body, { color: tokens.text2 }]}>Match</Text>
            <SegmentedControl
              options={[
                { value: 'and', label: 'All' },
                { value: 'or', label: 'Any' },
              ]}
              value={conjunction}
              onChange={onConjunctionChange}
              accessibilityLabel="Match"
              style={styles.conjunctionControl}
            />
            <Text style={[type.body, { color: tokens.text2 }]}>of the following</Text>
          </View>
        )}

        {rules.length === 0 && (
          <Text style={[type.body, styles.emptyText, { color: tokens.text2 }]}>
            Build your own: any field, with All or Any matching.
          </Text>
        )}

        {rules.map(rule => {
          const field = getField(rule.field);
          const needsValue = !!field && operatorNeedsValue(rule.operator);
          const isTextValue = !!field && field.type === 'text' && needsValue;
          const valueLabel =
            field?.getOptions?.(filterContext).find(o => o.value === rule.value)?.label ??
            rule.value;

          return (
            <View
              key={rule.id}
              style={[styles.ruleRow, { borderColor: tokens.box, borderRadius: radii.container }]}
            >
              <View style={styles.rulePills}>
                <SelectPill
                  label={field?.label ?? 'Select field...'}
                  placeholder={!field}
                  onPress={() => setPicker({ kind: 'field', ruleId: rule.id })}
                />

                {field && (
                  <SelectPill
                    label={OPERATOR_LABELS[rule.operator]}
                    onPress={() => setPicker({ kind: 'operator', ruleId: rule.id })}
                  />
                )}

                {needsValue && !isTextValue && (
                  <SelectPill
                    label={valueLabel || 'Select...'}
                    placeholder={!rule.value}
                    onPress={() => setPicker({ kind: 'value', ruleId: rule.id })}
                  />
                )}

                {isTextValue && (
                  <TextInput
                    style={[
                      type.body,
                      styles.valueInput,
                      { borderColor: tokens.input, borderRadius: radii.input, color: tokens.text },
                    ]}
                    placeholder="Value..."
                    placeholderTextColor={tokens.muted}
                    selectionColor={tokens.accent}
                    cursorColor={tokens.accent}
                    value={rule.value ?? ''}
                    onChangeText={text => updateRule(rule.id, { value: text })}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={`${field?.label ?? 'Filter'} value`}
                  />
                )}
              </View>

              <Button
                variant="plain-icon"
                icon="x"
                title="Remove filter"
                onPress={() => removeRule(rule.id)}
              />
            </View>
          );
        })}

        <Button variant="link" icon="plus" title="Add filter" onPress={addRule} style={styles.linkButton} />

        <Divider style={styles.divider} />

        <Text style={[type.h3, styles.sectionTitle, { color: tokens.textH }]} accessibilityRole="header">
          Saved views
        </Text>
        {savedViews.length === 0 && !isNamingView && (
          <Text style={[type.body, styles.emptyText, { color: tokens.text2 }]}>
            Save the current filters as a view to reuse them later.
          </Text>
        )}
        {savedViews.map((view, index) => (
          <ListRow
            key={view.id}
            icon="clipboard-list"
            title={view.name}
            value={`${view.rules.length} filter${view.rules.length === 1 ? '' : 's'}`}
            trailing={
              <Button
                variant="plain-icon"
                icon="trash"
                title={`Delete ${view.name}`}
                onPress={() => onDeleteView(view.id)}
              />
            }
            divider={index < savedViews.length - 1}
            style={styles.savedViewRow}
          />
        ))}

        {isNamingView ? (
          <View style={styles.saveViewRow}>
            <TextField
              placeholder="View name..."
              value={viewName}
              onChangeText={setViewName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveView}
              accessibilityLabel="View name"
              style={styles.viewNameField}
            />
            <Button
              variant="primary"
              title="Save"
              onPress={handleSaveView}
              disabled={!viewName.trim()}
            />
            <Button
              variant="plain-icon"
              icon="x"
              title="Cancel"
              onPress={() => {
                setIsNamingView(false);
                setViewName('');
              }}
            />
          </View>
        ) : (
          <Button
            variant="link"
            icon="plus"
            title="Save current as view"
            onPress={() => setIsNamingView(true)}
            disabled={!canSaveView}
            style={styles.linkButton}
          />
        )}
      </View>
    </Sheet>
  );

  // Choosing an option replaces the sheet's content rather than stacking a
  // second sheet on top of it; Back returns to the filters.
  return picker ? pickerContent : mainContent;
}

/** A multi-select chip: ticked and tinted when selected. */
function OptionChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { tokens, type, radii } = useTheme();
  const color = selected ? tokens.accent : tokens.text;
  return (
    <PressableSurface
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      rippleColor={color}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[
        styles.optionChip,
        {
          borderRadius: radii.item,
          borderColor: selected ? tokens.accent : tokens.input,
          backgroundColor: selected ? tokens.selected : tokens.bg,
        },
      ]}
      contentStyle={styles.optionChipContent}
    >
      {selected ? <Icon name="check" size={14} color={color} /> : null}
      <Text style={[type.label, { color }]} numberOfLines={1}>{label}</Text>
    </PressableSurface>
  );
}

function SelectPill({
  label,
  icon,
  placeholder = false,
  onPress,
}: {
  label: string;
  icon?: IconName;
  placeholder?: boolean;
  onPress: () => void;
}) {
  const { tokens, type, radii } = useTheme();
  return (
    <PressableSurface
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      rippleColor={tokens.text}
      style={[
        styles.pill,
        {
          borderRadius: radii.input,
          borderColor: placeholder ? tokens.accent : tokens.input,
          borderStyle: placeholder ? 'dashed' : 'solid',
          backgroundColor: tokens.bg,
        },
      ]}
      contentStyle={styles.pillContent}
    >
      {icon ? <Icon name={icon} size={14} color={tokens.text2} /> : null}
      <Text
        style={[type.body, styles.pillText, { color: placeholder ? tokens.muted : tokens.text }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Icon name="chevron-down" size={14} color={tokens.muted} />
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 8,
  },
  conjunctionControl: {
    flex: 1,
    maxWidth: 200,
  },
  conjunctionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  emptyText: {
    marginBottom: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 0,
    marginBottom: 8,
    gap: 4,
  },
  rulePills: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  pill: { borderWidth: 1, maxWidth: 200 },
  pillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    // 44 including the 1px border.
    minHeight: 42,
    paddingHorizontal: 10,
    gap: 4,
  },
  pillText: {
    flexShrink: 1,
  },
  valueInput: {
    flexGrow: 1,
    minWidth: 100,
    minHeight: 44,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  linkButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 0,
  },
  divider: {
    marginVertical: 12,
  },
  savedViewRow: {
    paddingHorizontal: 0,
  },
  saveViewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  viewNameField: {
    flex: 1,
  },
  sortRow: {
    gap: 12,
  },
  stateChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  optionChip: { borderWidth: 1 },
  optionChipContent: {
    // 36 including the 1px border; hitSlop makes the target 44.
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  toggleLabel: {
    flex: 1,
  },
  toggleControl: {
    width: 180,
  },
  matchCount: {
    flex: 1,
  },
  pickerList: {
    paddingBottom: 8,
  },
});
