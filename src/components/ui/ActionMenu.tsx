import React, { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { useTheme } from '../../theme';
import { Icon } from './Icon';
import { IOS_PRESSED_OPACITY } from './pressFeedback';

export interface MenuAction {
  key: string;
  title: string;
  /** A second line (iOS shows it under the title; Android drops it). */
  subtitle?: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Shows a tick: the action is an on/off setting, or the current choice. */
  checked?: boolean;
  /** SF Symbol for iOS. */
  iosIcon?: string;
}

export interface ActionMenuProps {
  actions: MenuAction[];
  /** The menu's spoken name, e.g. "More actions". */
  accessibilityLabel: string;
  /**
   * What opens the menu, drawn as a plain View: the native menu takes the
   * tap itself, so no Pressable inside. Defaults to a 44pt ⋯ button.
   */
  children?: ReactNode;
  /** An optional header inside the menu. */
  title?: string;
  /**
   * The trigger's state layer while the menu is open (Android): the colour
   * of the content it sits under, e.g. overlayTokens.on over the camera.
   * Defaults to the text colour.
   */
  feedbackColor?: string;
  /** The trigger's corner radius, for that state layer. Defaults to round. */
  feedbackRadius?: number;
  /**
   * The trigger takes the width it's given rather than its content's, e.g. a
   * select field (Android, where the menu is hosted in Compose).
   */
  stretch?: boolean;
}

/**
 * A native drop-down menu for a screen's ⋯ actions or a short picker: UIMenu
 * on iOS via @react-native-menu/menu (a Material 3 Compose menu on Android:
 * ActionMenu.android.tsx).
 */
export function ActionMenu({ actions, accessibilityLabel, children, title }: ActionMenuProps) {
  const { scheme } = useTheme();
  // The native menu takes the touch itself, so a Pressable inside never sees
  // a press. The trigger dims while its menu is open instead.
  const [open, setOpen] = useState(false);
  const byKey = new Map(actions.map((action) => [action.key, action]));
  return (
    <MenuView
      title={title}
      themeVariant={scheme}
      actions={actions.map((action) => ({
        id: action.key,
        title: action.title,
        subtitle: action.subtitle,
        image: action.iosIcon,
        state: action.checked === undefined ? undefined : action.checked ? 'on' : 'off',
        attributes: { destructive: action.destructive, disabled: action.disabled },
      }))}
      onPressAction={({ nativeEvent }) => byKey.get(nativeEvent.event)?.onSelect()}
      onOpenMenu={() => setOpen(true)}
      onCloseMenu={() => setOpen(false)}
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        style={open ? styles.highlighted : undefined}
      >
        {children ?? <MoreGlyph />}
      </View>
    </MenuView>
  );
}

/** The default trigger: a borderless 44pt ⋯. */
function MoreGlyph() {
  const { tokens, hitTarget } = useTheme();
  return (
    <View style={[styles.more, { width: hitTarget, height: hitTarget }]}>
      <Icon name="overflow" size={22} color={tokens.text2} />
    </View>
  );
}

const styles = StyleSheet.create({
  more: { alignItems: 'center', justifyContent: 'center' },
  highlighted: { opacity: IOS_PRESSED_OPACITY },
});
