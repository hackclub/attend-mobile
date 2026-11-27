import { useEffect } from 'react';
import type { SheetChannel } from '../../navigation/sheetChannel';
import { useCloseSheet } from '../../navigation/sheetPresenter';

/**
 * A sheet's data. Without any (the screen that opened it has gone, or the
 * app was restored onto the sheet) the sheet closes itself.
 */
export function useSheetData<T>(channel: SheetChannel<T>): T | undefined {
  const data = channel.useData();
  const close = useCloseSheet();
  const missing = data === undefined;
  useEffect(() => {
    if (missing) close();
  }, [missing, close]);
  return data;
}
