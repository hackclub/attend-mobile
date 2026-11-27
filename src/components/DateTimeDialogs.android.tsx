import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { DatePickerDialog, TimePickerDialog } from '@expo/ui/jetpack-compose';
import type { DateTimeDialogsProps } from './DateTimeDialogs';
import { fromPickerDay, prefers24Hour, toPickerDay } from './pickerDays';
import { MaterialHost } from './ui/MaterialHost';

/**
 * Android: Material 3's date picker dialog, then its time picker dialog
 * (Jetpack Compose), in the app's theme. Cancelling either leaves the value
 * as it was.
 */
export function DateTimeDialogs({ value, minimumDate, onChange, onClose }: DateTimeDialogsProps) {
  const [day, setDay] = useState<Date | null>(null);
  return (
    <MaterialHost style={styles.host} pointerEvents="none">
      {day ? (
        <TimePickerDialog
          initialDate={day.toISOString()}
          is24Hour={prefers24Hour()}
          onDateSelected={(picked) => {
            onClose();
            onChange(picked);
          }}
          onDismissRequest={onClose}
        />
      ) : (
        <DatePickerDialog
          initialDate={toPickerDay(value).toISOString()}
          selectableDates={minimumDate ? { start: toPickerDay(minimumDate) } : undefined}
          onDateSelected={(picked) => setDay(fromPickerDay(picked, value))}
          onDismissRequest={onClose}
        />
      )}
    </MaterialHost>
  );
}

// The dialogs are windows of their own; the host only has to be mounted.
const styles = StyleSheet.create({
  host: { position: 'absolute', width: 1, height: 1 },
});
