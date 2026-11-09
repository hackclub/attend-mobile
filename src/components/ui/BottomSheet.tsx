import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';

export interface BottomSheetProps {
  visible: boolean;
  /** Called on scrim tap, swipe down and the Android back button. */
  onClose: () => void;
  title?: string;
  /** Trailing header slot, e.g. a close icon Button. */
  headerActions?: ReactNode;
  children?: ReactNode;
  /** Fraction of the window the sheet may cover. */
  maxHeightRatio?: number;
  /** Disallow scrim tap / swipe dismissal (e.g. while saving). */
  dismissible?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 0.8;

/**
 * A plain modal sheet with a drag handle, built on RN Modal + Animated +
 * PanResponder (no gesture or reanimated dependency). The handle area drags;
 * the content scrolls normally.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  headerActions,
  children,
  maxHeightRatio = 0.9,
  dismissible = true,
  contentStyle,
  testID,
}: BottomSheetProps) {
  const { tokens, type, radii } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [translateY] = useState(() => new Animated.Value(windowHeight));
  const [scrim] = useState(() => new Animated.Value(0));
  // Mount as soon as the sheet is asked for; unmount after the exit animation.
  if (visible && !mounted) setMounted(true);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  }, [onClose, dismissible]);

  useEffect(() => {
    if (visible) {
      translateY.setValue(windowHeight);
      Animated.parallel([
        Animated.timing(scrim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scrim, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, {
          toValue: windowHeight,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, windowHeight, scrim, translateY]);

  // The handlers only read the refs when a gesture fires, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => dismissibleRef.current && g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          onCloseRef.current();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  );

  if (!mounted) return null;

  const requestClose = () => {
    if (dismissible) onClose();
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      testID={testID}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: tokens.overlay, opacity: scrim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={requestClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          importantForAccessibility={dismissible ? 'yes' : 'no-hide-descendants'}
        />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.anchor}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              maxHeight: windowHeight * maxHeightRatio,
              backgroundColor: tokens.bg,
              borderColor: tokens.box,
              borderTopLeftRadius: radii.container,
              borderTopRightRadius: radii.container,
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateY }],
            },
          ]}
        >
          <View {...pan.panHandlers} style={styles.grabArea}>
            <View
              style={[styles.handle, { backgroundColor: tokens.div }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            {title || headerActions ? (
              <View style={styles.header}>
                {title ? (
                  <Text style={[type.h1, styles.title, { color: tokens.textH }]} accessibilityRole="header">
                    {title}
                  </Text>
                ) : (
                  <View style={styles.title} />
                )}
                {headerActions}
              </View>
            ) : null}
          </View>
          <View style={[styles.content, contentStyle]}>{children}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderWidth: 1, borderBottomWidth: 0, overflow: 'hidden' },
  grabArea: { paddingTop: 8, paddingHorizontal: 16 },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 999, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8, minHeight: 44 },
  title: { flex: 1 },
  content: { paddingHorizontal: 16, flexShrink: 1 },
});
