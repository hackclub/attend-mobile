import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
  FILTER_FIELDS,
  SORT_FIELDS,
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  getField,
  getSortField,
  operatorNeedsValue,
  applyFilters,
  newRuleId,
  type FilterRule,
  type FilterOperator,
  type FieldOption,
} from '../services/participantFilters';
import { filterSheet, type FilterSheetData } from '../navigation/sheetData';
import { useSheetData } from '../screens/sheets/useSheetData';


type PickerTarget =
  | { kind: 'field'; ruleId: string }
  | { kind: 'operator'; ruleId: string }
  | { kind: 'value'; ruleId: string }
  | { kind: 'sort-field' };

const PICKER_TITLES: Record<PickerTarget['kind'], string> = {
  field: 'Select field',
  operator: 'Select condition',
  value: 'Select value',
  'sort-field': 'Sort by',
};

/** People's filter & sort, a form-sheet route opened through `filterSheet`. */
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
  savedViews,
  onSaveView,
  onDeleteView,
  filterContext,
}: FilterSheetData) {
  const { tokens, type, radii } = useTheme();
  const navigation = useNavigation();
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [viewName, setViewName] = useState('');
  const [isNamingView, setIsNamingView] = useState(false);

  const matchCount = useMemo(
    () => applyFilters(filterContext.participants, rules, conjunction, filterContext).length,
    [filterContext, rules, conjunction],
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
    if (picker.kind === 'sort-field') {
      return SORT_FIELDS.map(f => ({ value: f.key, label: f.label }));
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
    if (picker.kind === 'sort-field') return sort?.field;
    const rule = rules.find(r => r.id === picker.ruleId);
    if (!rule) return undefined;
    if (picker.kind === 'field') return rule.field;
    if (picker.kind === 'operator') return rule.operator;
    return rule.value;
  }, [picker, rules, sort]);

  const handlePickOption = useCallback(
    (value: string) => {
      if (!picker) return;
      if (picker.kind === 'sort-field') {
        onSortChange({ field: value, direction: sort?.direction ?? 'asc' });
      } else if (picker.kind === 'field') {
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
    [picker, sort, onSortChange, updateRule],
  );

  const handleSaveView = useCallback(() => {
    if (viewName.trim()) {
      onSaveView(viewName);
      setViewName('');
      setIsNamingView(false);
    }
  }, [viewName, onSaveView]);

  const handleClose = useCallback(() => navigation.goBack(), [navigation]);

  const sortField = sort ? getSortField(sort.field) : undefined;
  const canSaveView = rules.length > 0 || sort !== null;

  const pickerContent = picker ? (
    <Sheet
      title={PICKER_TITLES[picker.kind]}
      action={<Button variant="link" title="Back" icon="chevron-left" onPress={() => setPicker(null)} />}
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
      contentContainerStyle={styles.content}
      footer={(
        <>
          <Text style={[type.body, styles.matchCount, { color: tokens.text2 }]} accessibilityLiveRegion="polite">
            {matchCount} of {filterContext.participants.length} participants match
          </Text>
          <Button variant="primary" title="Done" onPress={handleClose} />
        </>
      )}
    >
        <Text style={[type.h3, styles.sectionTitle, { color: tokens.textH }]} accessibilityRole="header">
          Filters
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
            No filters. Showing all participants.
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
              style={[styles.ruleRow, { borderColor: tokens.box, borderRadius: radii.item }]}
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
                variant="icon"
                icon="x"
                title="Remove filter"
                onPress={() => removeRule(rule.id)}
                style={styles.iconButton}
              />
            </View>
          );
        })}

        <Button variant="link" icon="plus" title="Add filter" onPress={addRule} style={styles.linkButton} />

        <Divider style={styles.divider} />

        <Text style={[type.h3, styles.sectionTitle, { color: tokens.textH }]} accessibilityRole="header">
          Sort
        </Text>
        <View style={[styles.ruleRow, { borderColor: tokens.box, borderRadius: radii.item }]}>
          <View style={styles.rulePills}>
            <SelectPill
              label={sortField?.label ?? 'Default order'}
              placeholder={!sortField}
              onPress={() => setPicker({ kind: 'sort-field' })}
            />

            {sort && (
              <SelectPill
                icon={sort.direction === 'asc' ? 'chevron-up' : 'chevron-down'}
                label={sort.direction === 'asc' ? 'Ascending' : 'Descending'}
                onPress={() =>
                  onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })
                }
              />
            )}
          </View>

          {sort && (
            <Button
              variant="icon"
              icon="x"
              title="Clear sort"
              onPress={() => onSortChange(null)}
              style={styles.iconButton}
            />
          )}
        </View>

        <Divider style={styles.divider} />

        <Text style={[type.h3, styles.sectionTitle, { color: tokens.textH }]} accessibilityRole="header">
          Saved Views
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
                variant="icon"
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
              variant="icon"
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
    </Sheet>
  );

  // Choosing an option replaces the sheet's content rather than stacking a
  // second sheet on top of it; Back returns to the filters.
  return picker ? pickerContent : mainContent;
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
  conjunctionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  conjunctionControl: {
    width: 120,
  },
  emptyText: {
    marginBottom: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 4,
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
    // 36 including the 1px border.
    minHeight: 34,
    paddingHorizontal: 10,
    gap: 4,
  },
  pillText: {
    flexShrink: 1,
  },
  valueInput: {
    flexGrow: 1,
    minWidth: 100,
    minHeight: 36,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  iconButton: {
    borderWidth: 0,
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
  matchCount: {
    flex: 1,
  },
  pickerList: {
    paddingBottom: 8,
  },
});
