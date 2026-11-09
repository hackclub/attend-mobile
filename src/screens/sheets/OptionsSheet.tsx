import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Icon, ListRow, PressableSurface, Sheet, SHEET_INSET } from '../../components/ui';
import { optionsSheet } from '../../navigation/sheetData';
import { useTheme } from '../../theme';
import { useSheetData } from './useSheetData';

/**
 * A single-choice list: a form's longer select fields (the shorter ones are
 * native menus), or a list of actions such as which scan to undo.
 */
export function OptionsSheet() {
  const { tokens } = useTheme();
  const navigation = useNavigation();
  const data = useSheetData(optionsSheet);
  if (!data) return null;
  const { title, subtitle, options, selected, onSelect, renderOption } = data;

  const choose = (value: string) => {
    navigation.goBack();
    onSelect(value);
  };

  return (
    <Sheet title={title} subtitle={subtitle}>
      {options.map((option, index) => {
        const isSelected = selected != null && option.value === selected;
        const check = isSelected ? <Icon name="check" color={tokens.accent} /> : undefined;
        if (renderOption) {
          return (
            <PressableSurface
              key={option.value}
              onPress={() => choose(option.value)}
              disabled={option.disabled}
              rippleColor={tokens.text}
              contentStyle={[
                styles.customRow,
                index < options.length - 1 && { borderBottomColor: tokens.div2, borderBottomWidth: 1 },
                option.disabled && styles.disabled,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled: !!option.disabled }}
            >
              <View style={styles.fill}>{renderOption(option)}</View>
              {check}
            </PressableSurface>
          );
        }
        return (
          <ListRow
            key={option.value}
            title={option.label}
            subtitle={option.description}
            destructive={option.destructive}
            disabled={option.disabled}
            trailing={check}
            chevron={false}
            divider={index < options.length - 1}
            onPress={() => choose(option.value)}
          />
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: SHEET_INSET,
    paddingVertical: 12,
  },
  disabled: { opacity: 0.4 },
});
