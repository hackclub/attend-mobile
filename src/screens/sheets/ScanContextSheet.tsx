import React from 'react';
import { useCloseSheet } from '../../navigation/sheetPresenter';
import { Icon, ListRow, Sheet } from '../../components/ui';
import { scanContextSheet } from '../../navigation/sheetData';
import { haptics } from '../../services/haptics';
import { useTheme } from '../../theme';
import { useSheetData } from './useSheetData';

/**
 * The one scan-context picker: the scanner's context pill and kiosk setup
 * both open it. The event can't be changed here; that's the switcher's job.
 */
export function ScanContextSheet() {
  const { tokens } = useTheme();
  const close = useCloseSheet();
  const data = useSheetData(scanContextSheet);
  if (!data) return null;
  const { title, eventName, contexts, selectedId, onSelect } = data;

  return (
    <Sheet title={title} subtitle={eventName}>
      {contexts.map((context, index) => {
        const selected = context.id === selectedId;
        return (
          <ListRow
            key={context.id}
            title={context.name}
            subtitle={context.is_airport ? 'Airport' : context.checks_in ? 'Checks in' : undefined}
            trailing={selected ? <Icon name="check" color={tokens.accent} /> : undefined}
            chevron={false}
            divider={index < contexts.length - 1}
            onPress={() => {
              haptics.selection();
              close();
              onSelect(context);
            }}
          />
        );
      })}
    </Sheet>
  );
}
