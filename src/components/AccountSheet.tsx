import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useApp } from '../context/AppContext';
import { biometricService } from '../services/biometric';
import { notificationService } from '../services/notifications';
import { useTheme, useThemePreference, type ThemePreference } from '../theme';
import { appVersionLabel } from './VersionFooter';
import { signOutConfirmation } from './signOutConfirmation';
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Container,
  Icon,
  ListRow,
  SegmentedControl,
  Toggle,
  pressedStyle,
  ripple,
  STATE_LAYER_ALPHA,
} from './ui';

export const PROFILE_URL = 'https://attend.hackclub.com/dashboard/profile';
export const PRIVACY_URL = 'https://hackclub.com/privacy-and-terms/';

const APPEARANCE_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

/** The signed-in user's avatar, which opens the Account sheet. */
export function AccountButton({
  onPress,
  size = 40,
  onBanner = false,
}: {
  onPress: () => void;
  size?: number;
  /** A white ring so it reads on a coloured banner or photo. */
  onBanner?: boolean;
}) {
  const { state } = useApp();
  const { tokens } = useTheme();
  const user = state.auth.user;
  const name = user?.name || user?.email || 'Account';
  // A borderless ripple draws on whatever is behind the avatar: white over a
  // banner photo, the text colour over the page so it shows in light mode.
  const rippleConfig = onBanner
    ? ripple('#ffffff', { alpha: 0.3, borderless: true, radius: size / 2 + 4 })
    : ripple(tokens.text, { alpha: STATE_LAYER_ALPHA, borderless: true, radius: size / 2 + 4 });
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      android_ripple={rippleConfig}
      style={({ pressed }) => [
        onBanner && styles.bannerRing,
        { borderRadius: size },
        pressedStyle(pressed, 0.7),
      ]}
      accessibilityRole="button"
      accessibilityLabel="Account"
    >
      <Avatar name={name} uri={user?.avatarUrl} size={size} tint="red" decorative />
    </Pressable>
  );
}

function minutesLeft(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000));
}

function useBiometricRemaining(active: boolean) {
  const [remaining, setRemaining] = useState(() => biometricService.sessionRemainingMs());
  useEffect(() => {
    if (!active) return;
    const tick = () => setRemaining(biometricService.sessionRemainingMs());
    tick();
    const timer = setInterval(tick, 10_000);
    const unsubscribe = biometricService.onLock(tick);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [active]);
  return [remaining, setRemaining] as const;
}

/**
 * Account and app settings: who is signed in, appearance, notifications, the
 * biometric lock, and sign out. Profile edits happen on the web; the API's
 * /me is read-only.
 */
export function AccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens, type, spacing } = useTheme();
  const { state, logout, flushBeforeSignOut } = useApp();
  const [signingOut, setSigningOut] = useState(false);
  const { preference, setPreference } = useThemePreference();
  const user = state.auth.user;
  const name = user?.name || user?.email || 'Signed in';
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [remaining, setRemaining] = useBiometricRemaining(visible);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void notificationService.isPushEnabled().then((enabled) => {
      if (!cancelled) setPushEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const togglePush = useCallback(async (next: boolean) => {
    setPushBusy(true);
    setPushEnabled(next);
    try {
      const ok = await notificationService.setPushEnabled(next);
      if (!ok) {
        setPushEnabled(false);
        Alert.alert(
          'Notifications are off',
          'Allow notifications for Attend in Settings to get messages on this device.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ]
        );
      }
    } finally {
      setPushBusy(false);
    }
  }, []);

  const lockNow = useCallback(() => {
    biometricService.clearSession();
    setRemaining(0);
  }, [setRemaining]);

  // Unsent scans are deleted with the session, so try to send them first and
  // make discarding whatever is left an explicit choice.
  const signOut = useCallback(async () => {
    if (signingOut) return;
    let unsent = 0;
    if (state.sync.pendingScans > 0) {
      setSigningOut(true);
      try {
        unsent = await flushBeforeSignOut();
      } finally {
        setSigningOut(false);
      }
    }
    const { title, message, confirmLabel } = signOutConfirmation(unsent);
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: () => {
          onClose();
          void logout();
        },
      },
    ]);
  }, [flushBeforeSignOut, logout, onClose, signingOut, state.sync.pendingScans]);

  const roles = [
    user?.global_admin ? 'Global Admin' : null,
    user?.is_organizer || user?.global_admin ? 'Organizer' : null,
    user?.is_participant ? 'Attendee' : null,
  ].filter((role): role is string => !!role);

  const unlocked = remaining > 0;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Account"
      maxHeightRatio={0.92}
      headerActions={<Button variant="icon" icon="x" title="Close" onPress={onClose} />}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { gap: spacing.lg, paddingBottom: spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Container bodyStyle={{ gap: 14 }}>
          <View style={styles.identity}>
            <Avatar name={name} uri={user?.avatarUrl} size={56} tint="red" decorative />
            <View style={styles.identityText}>
              <Text style={[type.h2, { color: tokens.textH }]}>{name}</Text>
              {user?.email && user.email !== name ? (
                <Text style={[type.body, { color: tokens.text2 }]} selectable>{user.email}</Text>
              ) : null}
              {roles.length > 0 ? (
                <View style={styles.badges}>
                  {roles.map((role) => <Badge key={role} label={role} />)}
                </View>
              ) : null}
            </View>
          </View>
          <Button
            title="Edit profile on attend.hackclub.com"
            icon="external-link"
            iconPosition="end"
            fullWidth
            onPress={() => void Linking.openURL(PROFILE_URL)}
            accessibilityHint="Opens in your browser"
          />
        </Container>

        <Container title="Appearance">
          <SegmentedControl<ThemePreference>
            options={APPEARANCE_OPTIONS}
            value={preference}
            onChange={setPreference}
            accessibilityLabel="Theme"
            role="radio"
          />
        </Container>

        <Container flush>
          <View style={[styles.settingRow, { borderBottomColor: tokens.div2, borderBottomWidth: 1 }]}>
            <View style={styles.settingText}>
              <Text style={[type.label, { color: tokens.textH }]}>Notifications</Text>
              <Text style={[type.body, { color: tokens.text2 }]}>Messages and updates on this device</Text>
            </View>
            <Toggle
              value={!!pushEnabled}
              onValueChange={(next) => void togglePush(next)}
              disabled={pushEnabled === null || pushBusy}
              accessibilityLabel="Notifications"
            />
          </View>
          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={[type.label, { color: tokens.textH }]}>Biometric lock</Text>
              <View style={styles.lockStatus}>
                <Icon
                  name={unlocked ? 'check-circle' : 'lock-closed'}
                  size={16}
                  color={unlocked ? tokens.success : tokens.text2}
                />
                <Text style={[type.body, { color: unlocked ? tokens.success : tokens.text2 }]}>
                  {unlocked
                    ? `Unlocked for ${minutesLeft(remaining)} more minute${minutesLeft(remaining) === 1 ? '' : 's'}`
                    : 'Locked'}
                </Text>
              </View>
            </View>
            {unlocked ? <Button title="Lock now" onPress={lockNow} /> : null}
          </View>
        </Container>

        <Container flush>
          <ListRow
            title="Privacy policy"
            external
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}
          />
          <ListRow title="Version" value={appVersionLabel()} divider={false} />
        </Container>

        <View style={{ gap: spacing.sm }}>
          <Button title="Sign out" fullWidth loading={signingOut} onPress={() => void signOut()} />
          <Text style={[type.small, styles.center, { color: tokens.muted }]}>
            Signs you out of Attend on this device and stops its notifications.
          </Text>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bannerRing: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)' },
  content: { paddingTop: 4 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityText: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  settingText: { flex: 1, minWidth: 0 },
  lockStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  center: { textAlign: 'center' },
});
