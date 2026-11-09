import React, { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  experimental_LayoutConformance as LayoutConformance,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModalBottomSheet, RNHostView, type ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxHeight } from '@expo/ui/jetpack-compose/modifiers';
import { PresentedSheetContext, type PresentedSheet } from '../navigation/sheetPresenter';
import { composeSheetHeight } from '../navigation/sheets';
import { SHEETS } from '../navigation/sheetScreens';
import { sheetStack, type OpenSheet } from '../navigation/sheetStack';
import { useTheme } from '../theme';
import { MaterialHost } from './ui/MaterialHost';

// Material's drag handle: a 4dp bar with 22dp above and below.
const DRAG_HANDLE_HEIGHT = 48;
// Material's hide animation is well under this.
const HIDE_FALLBACK_MS = 700;

/**
 * Android's drawers: each open sheet (navigation/sheetStack) as a Material 3
 * ModalBottomSheet, with its drag handle, scrim, swipe-down, scrim-tap and
 * (predictive) back to dismiss. Mounted once, over the whole app; a sheet
 * opened from a sheet stacks over it.
 *
 * The sheet is a window of its own over the activity, so the screen under it
 * stays mounted and focused (useIsUnderSheet tells the scanner it's covered).
 */
export function SheetHost() {
  const sheets = useSyncExternalStore(sheetStack.subscribe, sheetStack.get, sheetStack.get);
  return (
    <>
      {sheets.map((sheet) => (
        <ComposeSheet key={sheet.id} sheet={sheet} />
      ))}
    </>
  );
}

function ComposeSheet({ sheet }: { sheet: OpenSheet }) {
  const { tokens } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ref = useRef<ModalBottomSheetRef>(null);
  const closing = useRef(false);
  const config = SHEETS[sheet.name];
  // Loaded on the sheet's first open, as the iOS routes are.
  const content = useMemo(() => React.createElement(config.getComponent()), [config]);
  const size = composeSheetHeight(config.detents);

  const presented = useMemo<PresentedSheet>(
    () => ({
      close: (then) => {
        if (closing.current) return;
        closing.current = true;
        // Removed (and `then` run) once, when the hide animation settles,
        // or after HIDE_FALLBACK_MS if it never does: a sheet left in the
        // stack keeps its window over the app, taking every touch.
        let done = false;
        const gone = () => {
          if (done) return;
          done = true;
          clearTimeout(fallback);
          sheetStack.remove(sheet.id);
          then?.();
        };
        const fallback = setTimeout(gone, HIDE_FALLBACK_MS);
        const hidden = ref.current?.hide();
        if (hidden) void hidden.finally(gone);
        else gone();
      },
    }),
    [sheet.id]
  );

  // Swipe-down, a scrim tap or back: Material has already animated it away.
  const onDismissRequest = useCallback(() => {
    closing.current = true;
    sheetStack.remove(sheet.id);
  }, [sheet.id]);

  const fit = size === 'fit';
  // A sheet that fits its content stops short of the status bar; past that
  // its content scrolls. The sheet keeps itself above the navigation bar and
  // the keyboard.
  const maxHeight = height - insets.top - insets.bottom - DRAG_HANDLE_HEIGHT;

  return (
    // Fills the screen but takes no touches: the sheet is its own window.
    <MaterialHost style={StyleSheet.absoluteFill} pointerEvents="none">
      <ModalBottomSheet
        ref={ref}
        onDismissRequest={onDismissRequest}
        skipPartiallyExpanded
        containerColor={tokens.bg}
        contentColor={tokens.text}
      >
        <RNHostView
          matchContents={fit ? { vertical: true } : false}
          modifiers={fit ? undefined : [fillMaxHeight(size)]}
        >
          {/* Fit: the content's own height, capped. The cap is laid out
              with strict (CSS) flexbox: under React Native's default Yoga
              errata (StretchFlexBasis) the Sheet's ScrollView, which grows
              by default, would stretch it to the cap, so every sheet opened
              almost full height. Otherwise flexGrow with a zero basis fills
              the height Compose gives it without taking a list's full
              content height, so the list scrolls to its end. */}
          <LayoutConformance mode={fit ? 'strict' : 'compatibility'}>
            <View style={fit ? { maxHeight } : styles.fill}>
              <LayoutConformance mode="compatibility">
                <PresentedSheetContext.Provider value={presented}>
                  {content}
                </PresentedSheetContext.Provider>
              </LayoutConformance>
            </View>
          </LayoutConformance>
        </RNHostView>
      </ModalBottomSheet>
    </MaterialHost>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1, height: 0 },
});
