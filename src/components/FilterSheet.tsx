import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
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
  type Conjunction,
  type SortRule,
  type SavedView,
  type FilterContext,
  type FieldOption,
} from '../services/participantFilters';

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  rules: FilterRule[];
  onRulesChange: (rules: FilterRule[]) => void;
  conjunction: Conjunction;
  onConjunctionChange: (c: Conjunction) => void;
  sort: SortRule | null;
  onSortChange: (sort: SortRule | null) => void;
  savedViews: SavedView[];
  onSaveView: (name: string) => void;
  onDeleteView: (viewId: string) => void;
  filterContext: FilterContext;
}

type PickerTarget =
  | { kind: 'field'; ruleId: string }
  | { kind: 'operator'; ruleId: string }
  | { kind: 'value'; ruleId: string }
  | { kind: 'sort-field' };

export function FilterSheet({
  visible,
  onClose,
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
}: FilterSheetProps) {
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

  const sortField = sort ? getSortField(sort.field) : undefined;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Filter & Sort</Text>
          <TouchableOpacity onPress={onClose} style={styles.doneButton}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Filters</Text>

          {rules.length > 1 && (
            <View style={styles.conjunctionRow}>
              <Text style={styles.conjunctionLabel}>Match</Text>
              <View style={styles.segmented}>
                <TouchableOpacity
                  style={[styles.segment, conjunction === 'and' && styles.segmentActive]}
                  onPress={() => onConjunctionChange('and')}
                >
                  <Text style={[styles.segmentText, conjunction === 'and' && styles.segmentTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segment, conjunction === 'or' && styles.segmentActive]}
                  onPress={() => onConjunctionChange('or')}
                >
                  <Text style={[styles.segmentText, conjunction === 'or' && styles.segmentTextActive]}>
                    Any
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.conjunctionLabel}>of the following</Text>
            </View>
          )}

          {rules.length === 0 && (
            <Text style={styles.emptyText}>No filters. Showing all participants.</Text>
          )}

          {rules.map(rule => {
            const field = getField(rule.field);
            const needsValue = !!field && operatorNeedsValue(rule.operator);
            const isTextValue = !!field && field.type === 'text' && needsValue;
            const valueLabel =
              field?.getOptions?.(filterContext).find(o => o.value === rule.value)?.label ??
              rule.value;

            return (
              <View key={rule.id} style={styles.ruleRow}>
                <View style={styles.rulePills}>
                  <TouchableOpacity
                    style={[styles.pill, !field && styles.pillPlaceholder]}
                    onPress={() => setPicker({ kind: 'field', ruleId: rule.id })}
                  >
                    <Text
                      style={[styles.pillText, !field && styles.pillPlaceholderText]}
                      numberOfLines={1}
                    >
                      {field?.label ?? 'Select field...'}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={colors.text.muted} />
                  </TouchableOpacity>

                  {field && (
                    <TouchableOpacity
                      style={styles.pill}
                      onPress={() => setPicker({ kind: 'operator', ruleId: rule.id })}
                    >
                      <Text style={styles.pillText} numberOfLines={1}>
                        {OPERATOR_LABELS[rule.operator]}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={colors.text.muted} />
                    </TouchableOpacity>
                  )}

                  {needsValue && !isTextValue && (
                    <TouchableOpacity
                      style={[styles.pill, !rule.value && styles.pillPlaceholder]}
                      onPress={() => setPicker({ kind: 'value', ruleId: rule.id })}
                    >
                      <Text
                        style={[styles.pillText, !rule.value && styles.pillPlaceholderText]}
                        numberOfLines={1}
                      >
                        {valueLabel || 'Select...'}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={colors.text.muted} />
                    </TouchableOpacity>
                  )}

                  {isTextValue && (
                    <TextInput
                      style={styles.valueInput}
                      placeholder="Value..."
                      placeholderTextColor={colors.text.muted}
                      value={rule.value ?? ''}
                      onChangeText={text => updateRule(rule.id, { value: text })}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  )}
                </View>

                <TouchableOpacity onPress={() => removeRule(rule.id)} style={styles.removeButton}>
                  <Ionicons name="close-circle" size={22} color={colors.text.muted} />
                </TouchableOpacity>
              </View>
            );
          })}

          <TouchableOpacity style={styles.addButton} onPress={addRule}>
            <Ionicons name="add" size={18} color={colors.red} />
            <Text style={styles.addButtonText}>Add filter</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Sort</Text>
          <View style={styles.ruleRow}>
            <View style={styles.rulePills}>
              <TouchableOpacity
                style={[styles.pill, !sortField && styles.pillPlaceholder]}
                onPress={() => setPicker({ kind: 'sort-field' })}
              >
                <Text
                  style={[styles.pillText, !sortField && styles.pillPlaceholderText]}
                  numberOfLines={1}
                >
                  {sortField?.label ?? 'Default order'}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.text.muted} />
              </TouchableOpacity>

              {sort && (
                <TouchableOpacity
                  style={styles.pill}
                  onPress={() =>
                    onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })
                  }
                >
                  <Ionicons
                    name={sort.direction === 'asc' ? 'arrow-up' : 'arrow-down'}
                    size={14}
                    color={colors.text.secondary}
                  />
                  <Text style={styles.pillText}>
                    {sort.direction === 'asc' ? 'Ascending' : 'Descending'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {sort && (
              <TouchableOpacity onPress={() => onSortChange(null)} style={styles.removeButton}>
                <Ionicons name="close-circle" size={22} color={colors.text.muted} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.sectionTitle}>Saved Views</Text>
          {savedViews.length === 0 && !isNamingView && (
            <Text style={styles.emptyText}>
              Save the current filters as a view to reuse them later.
            </Text>
          )}
          {savedViews.map(view => (
            <View key={view.id} style={styles.savedViewRow}>
              <Ionicons name="bookmark" size={16} color={colors.red} />
              <Text style={styles.savedViewName} numberOfLines={1}>{view.name}</Text>
              <Text style={styles.savedViewMeta}>
                {view.rules.length} filter{view.rules.length === 1 ? '' : 's'}
              </Text>
              <TouchableOpacity onPress={() => onDeleteView(view.id)} style={styles.removeButton}>
                <Ionicons name="trash-outline" size={18} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
          ))}

          {isNamingView ? (
            <View style={styles.saveViewRow}>
              <TextInput
                style={styles.viewNameInput}
                placeholder="View name..."
                placeholderTextColor={colors.text.muted}
                value={viewName}
                onChangeText={setViewName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveView}
              />
              <TouchableOpacity
                style={[styles.saveViewButton, !viewName.trim() && styles.saveViewButtonDisabled]}
                onPress={handleSaveView}
                disabled={!viewName.trim()}
              >
                <Text style={styles.saveViewButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setIsNamingView(false);
                  setViewName('');
                }}
                style={styles.removeButton}
              >
                <Ionicons name="close-circle" size={22} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.addButton, rules.length === 0 && !sort && styles.addButtonDisabled]}
              onPress={() => setIsNamingView(true)}
              disabled={rules.length === 0 && !sort}
            >
              <Ionicons
                name="bookmark-outline"
                size={16}
                color={rules.length === 0 && !sort ? colors.text.muted : colors.red}
              />
              <Text
                style={[
                  styles.addButtonText,
                  rules.length === 0 && !sort && styles.addButtonTextDisabled,
                ]}
              >
                Save current as view
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {matchCount} of {filterContext.participants.length} participants match
          </Text>
        </View>

        {/* Option picker overlay */}
        <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
          <TouchableOpacity style={styles.pickerBackdrop} activeOpacity={1} onPress={() => setPicker(null)}>
            <View style={styles.pickerCard}>
              <FlatList
                data={pickerOptions}
                keyExtractor={item => item.value}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.pickerOption} onPress={() => handlePickOption(item.value)}>
                    <Text style={styles.pickerOptionText}>{item.label}</Text>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.pickerSeparator} />}
                ListEmptyComponent={
                  <Text style={styles.pickerEmpty}>No options available</Text>
                }
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.primary,
  },
  doneButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.red,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  conjunctionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  conjunctionLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    padding: 2,
  },
  segment: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  segmentActive: {
    backgroundColor: colors.white,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  segmentTextActive: {
    color: colors.text.primary,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 10,
    marginBottom: 8,
  },
  rulePills: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 4,
    maxWidth: 200,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
  },
  pillPlaceholder: {
    borderWidth: 1,
    borderColor: colors.red + '60',
    borderStyle: 'dashed',
    backgroundColor: colors.white,
  },
  pillPlaceholderText: {
    color: colors.text.muted,
  },
  valueInput: {
    flexGrow: 1,
    minWidth: 100,
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    fontSize: 14,
    color: colors.text.primary,
  },
  removeButton: {
    padding: 4,
    marginLeft: 6,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.red,
  },
  addButtonTextDisabled: {
    color: colors.text.muted,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  savedViewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  savedViewName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.primary,
  },
  savedViewMeta: {
    fontSize: 13,
    color: colors.text.muted,
  },
  saveViewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  viewNameInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text.primary,
  },
  saveViewButton: {
    backgroundColor: colors.red,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  saveViewButtonDisabled: {
    opacity: 0.4,
  },
  saveViewButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  footer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    padding: 32,
  },
  pickerCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    maxHeight: 420,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
  },
  pickerOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  pickerOptionText: {
    fontSize: 16,
    color: colors.text.primary,
  },
  pickerSeparator: {
    height: 1,
    backgroundColor: colors.gray[100],
  },
  pickerEmpty: {
    padding: 16,
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
  },
});
