import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Checkbox } from '../../components/forms';
import { Button, PressableSurface, SheetHeader, SHEET_INSET, TextField } from '../../components/ui';
import { multiSelectSheet } from '../../navigation/sheetData';
import { useTheme } from '../../theme';
import { useSheetData } from './useSheetData';

/** A searchable checklist for picking participants or staff; every tick applies at once. */
export function MultiSelectSheet() {
  const { tokens, type, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const data = useSheetData(multiSelectSheet);
  const [query, setQuery] = useState('');
  const items = data?.items;

  const filtered = useMemo(() => {
    if (!items) return [];
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return items;
    return items.filter((item) => {
      const haystack = `${item.title} ${item.subtitle ?? ''}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [items, query]);

  if (!data) return null;
  const { title, selected, onChange, noun, searchPlaceholder = 'Search' } = data;
  const selectedSet = new Set(selected);
  const toggle = (id: string) =>
    onChange(selectedSet.has(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, SHEET_INSET) }}
      data={filtered}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      stickyHeaderIndices={[0]}
      ListHeaderComponent={(
        <View style={{ backgroundColor: tokens.bg }}>
          <SheetHeader
            title={title}
            action={
              selected.length ? <Button variant="link" title="Clear all" onPress={() => onChange([])} /> : undefined
            }
          />
          <View style={[styles.inset, { gap: spacing.sm, paddingBottom: spacing.sm }]}>
            <TextField
              icon="search"
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              clearable
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            <Text style={[type.body, { color: tokens.text2 }]} accessibilityLiveRegion="polite">
              {selected.length} {selected.length === 1 ? noun[0] : noun[1]} selected
            </Text>
          </View>
        </View>
      )}
      renderItem={({ item }) => {
        const checked = selectedSet.has(item.id);
        return (
          <PressableSurface
            onPress={() => toggle(item.id)}
            rippleColor={tokens.text}
            contentStyle={[styles.row, { borderBottomColor: tokens.div2 }]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
          >
            <Checkbox checked={checked} />
            <View style={styles.text}>
              <Text style={[type.body, { color: tokens.text }]} numberOfLines={1}>{item.title}</Text>
              {item.subtitle ? (
                <Text style={[type.small, { color: tokens.text2 }]} numberOfLines={1}>{item.subtitle}</Text>
              ) : null}
            </View>
            {item.trailing}
          </PressableSurface>
        );
      }}
      ListEmptyComponent={
        <Text style={[type.body, styles.empty, { color: tokens.muted }]}>No matches</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  inset: { paddingHorizontal: SHEET_INSET },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: SHEET_INSET,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, minWidth: 0 },
  empty: { textAlign: 'center', padding: 24 },
});
