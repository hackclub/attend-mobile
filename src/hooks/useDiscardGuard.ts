import { useCallback, useRef, useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import { useNavigation, usePreventRemove } from '@react-navigation/native';

/**
 * Asks "Discard changes?" before a form with unsaved edits is left by any
 * route: Cancel, the back link, a swipe or Android's back button.
 *
 * `snapshot` is the form's values serialised, or null until they've loaded;
 * the first one becomes the baseline, and the form is dirty once it differs.
 * Call `allowLeave()` just before navigating away after a save, or
 * `markClean()` after saving while staying (the saved values become the
 * new baseline).
 */
export function useDiscardGuard(snapshot: string | null) {
  const navigation = useNavigation();
  const [baseline, setBaseline] = useState<string | null>(null);
  // The loaded values become the baseline (state adjusted while rendering).
  if (snapshot !== null && baseline === null) setBaseline(snapshot);
  const leavingRef = useRef(false);
  const dirty = baseline !== null && snapshot !== null && snapshot !== baseline;

  usePreventRemove(dirty, ({ data }) => {
    if (leavingRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Keyboard.dismiss();
    Alert.alert('Discard changes?', "Your changes haven't been saved.", [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const allowLeave = useCallback(() => {
    leavingRef.current = true;
  }, []);

  const markClean = useCallback(() => setBaseline(null), []);

  return { dirty, allowLeave, markClean };
}
