import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import * as DropdownMenu from 'zeego/dropdown-menu';
import { useTheme } from '../../theme';
import { Icon } from './Icon';

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
}

/**
 * A native drop-down menu (UIMenu on iOS, a Material popup menu on Android)
 * for a screen's ⋯ actions or a short picker.
 */
export function ActionMenu({ actions, accessibilityLabel, children, title }: ActionMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <View accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
          {children ?? <MoreGlyph />}
        </View>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {title ? <DropdownMenu.Label>{title}</DropdownMenu.Label> : null}
        {actions.map((action) =>
          action.checked !== undefined ? (
            <DropdownMenu.CheckboxItem
              key={action.key}
              value={action.checked}
              onValueChange={() => action.onSelect()}
              disabled={action.disabled}
              destructive={action.destructive}
            >
              <DropdownMenu.ItemIndicator />
              <DropdownMenu.ItemTitle>{action.title}</DropdownMenu.ItemTitle>
              {action.subtitle ? <DropdownMenu.ItemSubtitle>{action.subtitle}</DropdownMenu.ItemSubtitle> : null}
            </DropdownMenu.CheckboxItem>
          ) : (
            <DropdownMenu.Item
              key={action.key}
              onSelect={action.onSelect}
              disabled={action.disabled}
              destructive={action.destructive}
            >
              <DropdownMenu.ItemTitle>{action.title}</DropdownMenu.ItemTitle>
              {action.subtitle ? <DropdownMenu.ItemSubtitle>{action.subtitle}</DropdownMenu.ItemSubtitle> : null}
              {action.iosIcon ? (
                // The kit's icon names aren't SF Symbols, so the type is loosened here.
                <DropdownMenu.ItemIcon ios={{ name: action.iosIcon as never }} />
              ) : null}
            </DropdownMenu.Item>
          )
        )}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

/** The default trigger: a borderless 44pt ⋯. */
function MoreGlyph() {
  const { tokens, hitTarget } = useTheme();
  return (
    <View style={[styles.more, { width: hitTarget, height: hitTarget }]}>
      <Icon name="dots-horizontal" size={22} color={tokens.text2} />
    </View>
  );
}

const styles = StyleSheet.create({
  more: { alignItems: 'center', justifyContent: 'center' },
});
