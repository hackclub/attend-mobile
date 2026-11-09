import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';

export interface ContainerProps {
  title?: string;
  description?: string;
  /** Trailing header content: a link Button, a Badge, a count. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Drop the body padding, for edge-to-edge lists of ListRows. */
  flush?: boolean;
  /** Rule under the header (console .cs-container-header-divided). */
  headerDivided?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Console container (.cs-container): bordered card, radius 16. */
export function Container({
  title,
  description,
  actions,
  footer,
  flush = false,
  headerDivided = false,
  children,
  style,
  bodyStyle,
  testID,
}: ContainerProps) {
  const { tokens, type, radii } = useTheme();
  const hasHeader = Boolean(title || description || actions);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: tokens.bg, borderColor: tokens.box, borderRadius: radii.container },
        style,
      ]}
      testID={testID}
    >
      {hasHeader && (
        <View
          style={[
            styles.header,
            headerDivided && { borderBottomWidth: 1, borderBottomColor: tokens.div2, paddingBottom: 12 },
          ]}
        >
          <View style={styles.headerText}>
            {title ? (
              <Text style={[type.h2, { color: tokens.textH }]} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {description ? (
              <Text style={[type.body, styles.description, { color: tokens.muted }]}>{description}</Text>
            ) : null}
          </View>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      )}
      {children != null && (
        <View
          style={[
            flush ? null : styles.body,
            !flush && hasHeader && !headerDivided && styles.bodyAfterHeader,
            bodyStyle,
          ]}
        >
          {children}
        </View>
      )}
      {footer ? (
        <View style={[styles.footer, { borderTopColor: tokens.div2 }]}>
          {typeof footer === 'string' ? (
            <Text style={[type.body, { color: tokens.text2 }]}>{footer}</Text>
          ) : (
            footer
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerText: { flex: 1, minWidth: 0 },
  description: { marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  bodyAfterHeader: { paddingTop: 8 },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingVertical: 12 },
});
