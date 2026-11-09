import React, { type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { Button } from './Button';

/** Everything in a sheet lines up 20 from its edges. */
export const SHEET_INSET = 20;

export interface SheetHeaderProps {
  title: string;
  /** A muted line under the title, e.g. the event a context list belongs to. */
  subtitle?: string;
  /** Defaults to going back, which dismisses the sheet route. */
  onClose?: () => void;
  /** Shown before the close button, e.g. "Clear all". */
  action?: ReactNode;
  /** Hides the close button, e.g. while a sheet is saving. */
  closable?: boolean;
}

/** A sheet's top: an h2 title, an optional subtitle, and a plain close button. */
export function SheetHeader({ title, subtitle, onClose, action, closable = true }: SheetHeaderProps) {
  const { tokens, type } = useTheme();
  const navigation = useNavigation();
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={[type.h2, { color: tokens.textH }]} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.body, { color: tokens.text2 }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
      {closable ? (
        <Button
          variant="plain-icon"
          icon="x"
          title="Close"
          onPress={onClose ?? (() => navigation.goBack())}
        />
      ) : null}
    </View>
  );
}

export interface SheetProps extends SheetHeaderProps {
  children?: ReactNode;
  /** After the content, e.g. a Done button. */
  footer?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'children'>;
}

/**
 * The body of a form-sheet route (see navigation/sheets): a ScrollView as the
 * screen's direct child, which the native sheet needs to hand drags between
 * scrolling and resizing, holding the header and `children`.
 *
 * Children span the sheet's width; pad text with SHEET_INSET.
 */
export function Sheet({
  children,
  footer,
  contentContainerStyle,
  scrollViewProps,
  ...header
}: SheetProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, SHEET_INSET);

  // The footer is the ScrollView's last child rather than a sibling in a
  // wrapper, so the ScrollView stays the sheet's direct child.
  return (
    <ScrollView
      // No flex: a 'fitToContents' sheet sizes itself from this content.
      style={{ backgroundColor: tokens.bg }}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      {...scrollViewProps}
      contentContainerStyle={[{ paddingBottom: bottom }, contentContainerStyle]}
    >
      <SheetHeader {...header} />
      {children}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: SHEET_INSET,
    // The close glyph's edge, not its 44pt target, sits on the inset.
    paddingRight: SHEET_INSET - 12,
    paddingTop: SHEET_INSET,
    paddingBottom: 12,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2, paddingTop: 11 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SHEET_INSET,
    paddingTop: SHEET_INSET,
  },
});
