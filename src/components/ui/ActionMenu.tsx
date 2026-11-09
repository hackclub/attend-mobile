import React, { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import * as DropdownMenu from 'zeego/dropdown-menu';
import { useTheme, withAlpha } from '../../theme';
import { Icon } from './Icon';
import { IOS_PRESSED_OPACITY, isAndroid, STATE_LAYER_ALPHA } from './pressFeedback';

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
}

/**
 * A native drop-down menu (UIMenu on iOS, a Material popup menu on Android)
 * for a screen's ⋯ actions or a short picker.
 */
export function ActionMenu({
  actions,
  accessibilityLabel,
  children,
  title,
  feedbackColor,
  feedbackRadius,
}: ActionMenuProps) {
  const { tokens, radii } = useTheme();
  // The native menu takes the touch itself (Android's MenuView intercepts
  // every touch; iOS's menu button tracks it), so a Pressable inside never
  // sees a press. The trigger shows it's pressed while its menu opens and
  // stays open instead: a state layer on Android, the dimmed highlight on iOS.
  const [open, setOpen] = useState(false);
  // iOS reports the menu about to open, before its animation; zeego's
  // dropdown Root type leaves the prop out, though its iOS menu reads it.
  const willChange = { onOpenWillChange: setOpen } as object;
  return (
    <DropdownMenu.Root onOpenChange={setOpen} {...willChange}>
      <DropdownMenu.Trigger>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ expanded: open }}
          style={open && !isAndroid ? styles.highlighted : undefined}
        >
          {children ?? <MoreGlyph />}
          {open && isAndroid ? (
            <View
              pointerEvents="none"
              style={[
                styles.stateLayer,
                {
                  backgroundColor: withAlpha(feedbackColor ?? tokens.text, STATE_LAYER_ALPHA),
                  borderRadius: feedbackRadius ?? radii.pill,
                },
              ]}
            />
          ) : null}
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
      <Icon name="overflow" size={22} color={tokens.text2} />
    </View>
  );
}

const styles = StyleSheet.create({
  more: { alignItems: 'center', justifyContent: 'center' },
  highlighted: { opacity: IOS_PRESSED_OPACITY },
  stateLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
