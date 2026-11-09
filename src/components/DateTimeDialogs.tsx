export interface DateTimeDialogsProps {
  /** Where the pickers start. */
  value: Date;
  minimumDate?: Date;
  /** The picked date and time, once both dialogs are confirmed. */
  onChange: (value: Date) => void;
  /** After a pick, or a cancel. */
  onClose: () => void;
}

/**
 * Android's date-then-time dialogs (DateTimeDialogs.android.tsx). iOS edits
 * the date inline, so there's nothing here.
 */
export function DateTimeDialogs(_props: DateTimeDialogsProps): null {
  return null;
}
