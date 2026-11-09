import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { SheetChannel } from '../../navigation/sheetChannel';

/**
 * A sheet route's data. Without any (the screen that opened it has gone, or
 * the app was restored onto the sheet) the sheet closes itself.
 */
export function useSheetData<T>(channel: SheetChannel<T>): T | undefined {
  const data = channel.useData();
  const navigation = useNavigation();
  const missing = data === undefined;
  useEffect(() => {
    if (missing && navigation.canGoBack()) navigation.goBack();
  }, [missing, navigation]);
  return data;
}
