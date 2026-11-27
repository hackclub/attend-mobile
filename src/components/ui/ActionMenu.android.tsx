import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  DropdownMenu,
  DropdownMenuItem,
  Icon as ComposeIcon,
  RNHostView,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { toggleable } from '@expo/ui/jetpack-compose/modifiers';
import { useTheme, withAlpha } from '../../theme';
import type { ActionMenuProps, MenuAction } from './ActionMenu';
import { Icon } from './Icon';
import { MaterialHost } from './MaterialHost';
import { STATE_LAYER_ALPHA } from './pressFeedback';

const CHECK_ICON = require('../../../assets/material/check.xml');

/**
 * Android: a Material 3 drop-down menu (Jetpack Compose) anchored to the
 * trigger, in the app's theme. Destructive actions are in the error colour;
 * an on/off action or the current choice is a checkbox item with a tick.
 * See ActionMenu.tsx for iOS.
 */
export function ActionMenu({
  actions,
  accessibilityLabel,
  children,
  title,
  feedbackColor,
  feedbackRadius,
  stretch = false,
}: ActionMenuProps) {
  const { tokens, radii } = useTheme();
  const [open, setOpen] = useState(false);
  const choose = (action: MenuAction) => {
    setOpen(false);
    action.onSelect();
  };

  return (
    <MaterialHost matchContents={stretch ? { vertical: true } : true}>
      <DropdownMenu
        expanded={open}
        onDismissRequest={() => setOpen(false)}
        // A clipped popup loses the status bar offset edge to edge, so a menu
        // near the bottom would come away from its trigger.
        properties={{ clippingEnabled: false }}
      >
        <DropdownMenu.Trigger>
          <RNHostView matchContents={stretch ? { vertical: true } : true}>
            <Pressable
              onPress={() => setOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              accessibilityState={{ expanded: open }}
            >
              {children ?? <MoreGlyph />}
              {/* The trigger keeps a state layer while its menu is open. */}
              {open ? (
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
            </Pressable>
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {title ? (
            <DropdownMenuItem enabled={false}>
              <DropdownMenuItem.Text>
                <ComposeText color={tokens.text2} style={{ typography: 'labelMedium' }}>
                  {title}
                </ComposeText>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ) : null}
          {actions.map((action) => {
            const color = action.destructive ? tokens.error : undefined;
            return (
              <DropdownMenuItem
                key={action.key}
                enabled={!action.disabled}
                onClick={() => choose(action)}
                elementColors={color ? { textColor: color, trailingIconColor: color } : undefined}
                // A checkable action reads as a checkbox with its state.
                modifiers={action.checked !== undefined
                  ? [toggleable(action.checked, () => choose(action), {
                    role: 'checkbox',
                    enabled: !action.disabled,
                  })]
                  : undefined}
              >
                <DropdownMenuItem.Text>
                  <ComposeText>{action.title}</ComposeText>
                </DropdownMenuItem.Text>
                {action.checked ? (
                  <DropdownMenuItem.TrailingIcon>
                    <ComposeIcon source={CHECK_ICON} size={24} tint={tokens.accent} />
                  </DropdownMenuItem.TrailingIcon>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenu.Items>
      </DropdownMenu>
    </MaterialHost>
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
  stateLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
