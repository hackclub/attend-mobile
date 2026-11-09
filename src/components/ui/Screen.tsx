import React, { type ReactNode } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTheme } from '../../theme';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { backLabelFor, previousRoute } from '../../navigation/backLabels';
import { Button } from './Button';
import { Icon } from './Icon';
import { PressableSurface } from './PressableSurface';

/** Pushed screens' content column on a tablet. */
const CONTENT_MAX_WIDTH = 620;

export interface ScreenHeadingProps {
  /** Large page title (type.h1). Leave it out when the content leads with its own heading. */
  title?: string;
  /**
   * The back link's label. By default it names the screen below this one
   * ("‹ Overview"), and it only shows when there is somewhere to go back to.
   * `false` hides it.
   */
  back?: string | false;
  /** Replaces going back, e.g. to confirm discarding a draft first. */
  onBack?: () => void;
  /** Inline action: beside the title, or on the back link's row without one. */
  action?: ReactNode;
  /**
   * A modal form's bar in place of the back link: Cancel on the left (going
   * back, which a discard guard can stop) and `confirm`, e.g. Save, on the
   * right.
   */
  modalBar?: { confirm?: ReactNode; cancelLabel?: string; onCancel?: () => void };
  /**
   * A modal without a form: a plain "x" after the action, in place of the
   * back link, as on a sheet. `true` goes back; a function replaces that.
   */
  close?: boolean | (() => void);
}

/** The back link's label, or null when this screen is the bottom of every stack. */
function useBackLabel(back: ScreenHeadingProps['back']): string | null {
  const navigation = useNavigation();
  const previous = useNavigationState((state) => previousRoute(state));
  if (back === false || !navigation.canGoBack()) return null;
  return back ?? backLabelFor(previous);
}

/** The scaffold's top: an accent "‹ Label" back link, the title, and an action. */
export function ScreenHeading({ title, back, onBack, action: extraAction, modalBar, close }: ScreenHeadingProps) {
  const { tokens, type, hitTarget } = useTheme();
  const navigation = useNavigation();
  const backLabel = useBackLabel(modalBar || close ? false : back);
  const action = close ? (
    <>
      {extraAction}
      <Button
        variant="plain-icon"
        icon="x"
        title="Close"
        onPress={typeof close === 'function' ? close : () => navigation.goBack()}
        style={styles.close}
      />
    </>
  ) : (
    extraAction
  );

  if (modalBar) {
    return (
      <View style={styles.heading}>
        <View style={styles.row}>
          <Button
            variant="link"
            title={modalBar.cancelLabel ?? 'Cancel'}
            onPress={modalBar.onCancel ?? (() => navigation.goBack())}
            style={styles.cancel}
          />
          <View style={styles.fill} />
          {modalBar.confirm}
        </View>
        {title ? (
          <View style={styles.row}>
            <Text style={[type.h1, styles.fill, { color: tokens.textH }]} accessibilityRole="header">
              {title}
            </Text>
            {action}
          </View>
        ) : null}
      </View>
    );
  }

  const backLink = backLabel ? (
    <PressableSurface
      onPress={onBack ?? (() => navigation.goBack())}
      rippleColor={tokens.accent}
      style={styles.back}
      contentStyle={[styles.backContent, { minHeight: hitTarget }]}
      hitSlop={{ left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${backLabel}`}
    >
      <Icon name="back" size={18} color={tokens.accent} />
      <Text style={[type.label, { color: tokens.accent }]} numberOfLines={1}>
        {backLabel}
      </Text>
    </PressableSurface>
  ) : null;

  if (!title) {
    if (!backLink && !action) return null;
    return (
      <View style={styles.row}>
        {backLink}
        <View style={styles.fill} />
        {action}
      </View>
    );
  }

  return (
    <View style={styles.heading}>
      {backLink}
      <View style={styles.row}>
        <Text style={[type.h1, styles.fill, { color: tokens.textH }]} accessibilityRole="header">
          {title}
        </Text>
        {action}
      </View>
    </View>
  );
}

export interface ScreenProps extends ScreenHeadingProps {
  children?: ReactNode;
  /**
   * `true` (default) scrolls the heading with the content. `false` pins the
   * heading and gives the rest of the screen to `children`, e.g. a FlatList
   * (which then pads its own bottom with `useScreenInsets().bottom`).
   */
  scroll?: boolean;
  /** Pull to refresh. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Extra styles for the scrolling content (or the pinned body). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Passed to the ScrollView, e.g. keyboardShouldPersistTaps. */
  scrollViewProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'refreshControl' | 'children'>;
  /** Background: the page (default) or the shaded variant. */
  shaded?: boolean;
  /** Scroll the focused field clear of the keyboard (forms). */
  keyboardAware?: boolean;
  /**
   * Presented modally: iOS draws it as a page sheet below the status bar, so
   * it needs no top inset there.
   */
  modal?: boolean;
}

/**
 * The scaffold every pushed screen sits in, in place of a native header: the
 * back link, a large title with an optional action, and scrolling content
 * with pull to refresh, clear of the status bar and the tab bar.
 *
 * Its screens are registered with `headerShown: false`.
 */
export function Screen({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  contentContainerStyle,
  scrollViewProps,
  shaded = false,
  keyboardAware = false,
  modal = false,
  ...heading
}: ScreenProps) {
  const { tokens, spacing } = useTheme();
  const screenInsets = useScreenInsets();
  const insets = modal && Platform.OS === 'ios' ? { ...screenInsets, top: spacing.md } : screenInsets;
  const background = { backgroundColor: shaded ? tokens.shaded : tokens.bg };

  if (!scroll) {
    return (
      <View style={[styles.screen, background]}>
        <View style={[styles.column, styles.pinned, { paddingTop: insets.top, paddingBottom: spacing.md }]}>
          <ScreenHeading {...heading} />
        </View>
        <View style={[styles.screen, contentContainerStyle]}>{children}</View>
      </View>
    );
  }

  const Scroller = keyboardAware ? KeyboardAwareScrollView : ScrollView;
  // The status bar is transparent, so the scroller starts below it: content
  // scrolling up then disappears under a strip of the screen's background
  // instead of showing through the status bar.
  return (
    <View style={[styles.screen, background, { paddingTop: insets.top }]}>
      <Scroller
        bottomOffset={keyboardAware ? spacing.xxl : undefined}
        style={styles.screen}
        contentInsetAdjustmentBehavior="never"
        {...scrollViewProps}
        contentContainerStyle={[
          styles.column,
          { paddingBottom: insets.bottom + spacing.xxl, gap: spacing.lg },
          contentContainerStyle,
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={tokens.accent}
              colors={[tokens.accent]}
              progressBackgroundColor={tokens.bg}
            />
          ) : undefined
        }
      >
        <ScreenHeading {...heading} />
        {children}
      </Scroller>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { paddingHorizontal: 16, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  pinned: { gap: 16 },
  heading: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fill: { flex: 1 },
  back: { alignSelf: 'flex-start', borderRadius: 8, marginLeft: -4 },
  cancel: { marginLeft: -12 },
  // The glyph's edge, not its 44pt target, lines up with the content.
  close: { marginRight: -12 },
  backContent: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: 8, paddingLeft: 2 },
});
