import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Host, Menu, Rectangle, Section, Toggle } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as accessibilityLabel_,
  disabled,
  foregroundStyle,
} from '@expo/ui/swift-ui/modifiers';
import { useTheme, withAlpha } from '../../theme';
import { Icon } from './Icon';

export interface MenuAction {
  key: string;
  title: string;
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
 * A native drop-down menu for a screen's ⋯ actions or a short picker: a
 * SwiftUI Menu (UIMenu) on iOS, via @expo/ui (a Material 3 Compose menu on
 * Android: ActionMenu.android.tsx).
 */
export function ActionMenu({
  actions,
  accessibilityLabel,
  children,
  title,
}: ActionMenuProps) {
  const { tokens } = useTheme();
  const items = actions.map(menuItem);
  return (
    <View>
      {/* React Native draws the trigger; VoiceOver reads the menu button instead. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {children ?? <MoreGlyph />}
      </View>
      {/*
        The menu button lies over the trigger, the same size, and takes the
        tap. A trigger hosted inside the SwiftUI label would get the touch
        itself, and the menu would never open.
      */}
      <Host style={StyleSheet.absoluteFill}>
        <Menu
          label={<Rectangle modifiers={[foregroundStyle(withAlpha(tokens.text, HIT_AREA_ALPHA))]} />}
          modifiers={[accessibilityLabel_(accessibilityLabel)]}
        >
          {title ? <Section title={title}>{items}</Section> : items}
        </Menu>
      </Host>
    </View>
  );
}

/**
 * The menu button's fill. SwiftUI only hit-tests what it draws, so the area
 * can't be fully clear; this is invisible over any trigger.
 */
const HIT_AREA_ALPHA = 0.011;

function menuItem(action: MenuAction) {
  const modifiers = action.disabled ? [disabled(true)] : undefined;
  if (action.checked !== undefined) {
    return (
      <Toggle
        key={action.key}
        isOn={action.checked}
        onIsOnChange={() => action.onSelect()}
        label={action.title}
        modifiers={modifiers}
      />
    );
  }
  return (
    <Button
      key={action.key}
      onPress={action.onSelect}
      role={action.destructive ? 'destructive' : undefined}
      label={action.title}
      // The kit's icon names aren't typed as SF Symbols, so the type is loosened here.
      systemImage={action.iosIcon as never}
      modifiers={modifiers}
    />
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
});
