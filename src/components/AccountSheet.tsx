import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { haptics } from '../services/haptics';
import { useOpenLink } from '../hooks/useOpenLink';
import { accountSheetPreview } from '../navigation/sheetData';
import { useLeaveSheet, useOpenSheet } from '../navigation/sheetPresenter';
import { biometricService } from '../services/biometric';
import { notificationService } from '../services/notifications';
import { overlayTokens, useTheme, useThemePreference, withAlpha, type ThemePreference } from '../theme';
import { appVersionLabel } from './VersionFooter';
import { signOutConfirmation } from './signOutConfirmation';
import {
  Avatar,
  Badge,
  Button,
  Container,
  Divider,
  Icon,
  ListRow,
  SegmentedControl,
  Sheet,
  SHEET_INSET,
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

/**
 * The signed-in user's avatar. Wherever it is (an event's banner, the
 * switcher drawer, the tickets list, a pass home) it opens the Account
 * drawer, stacked over any drawer it's in; never a screen.
 */
export function AccountButton({
  size = 40,
  onBanner = false,
}: {
  size?: number;
  /** A white ring so it reads on a coloured banner or photo. */
  onBanner?: boolean;
}) {
  const { state } = useApp();
  const { tokens } = useTheme();
  const openSheet = useOpenSheet();
  const user = state.auth.user;
  const name = user?.name || user?.email || 'Account';
  // A borderless ripple draws on whatever is behind the avatar: white over a
  // banner photo, the text colour over the page so it shows in light mode.
  const rippleConfig = onBanner
    ? ripple(overlayTokens.on, { alpha: 0.3, borderless: true, radius: size / 2 + 4 })
    : ripple(tokens.text, { alpha: STATE_LAYER_ALPHA, borderless: true, radius: size / 2 + 4 });
  return (
    <Pressable
      onPress={() => openSheet('AccountSheet')}
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

function useBiometricRemaining() {
  const [remaining, setRemaining] = useState(() => biometricService.sessionRemainingMs());
  useEffect(() => {
    const tick = () => setRemaining(biometricService.sessionRemainingMs());
    tick();
    const timer = setInterval(tick, 10_000);
    const unsubscribe = biometricService.onLock(tick);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, []);
  return [remaining, setRemaining] as const;
}

/**
 * Account and app settings: who is signed in, appearance, notifications, the
 * biometric lock, and sign out. Profile edits happen on the web; the API's
 * /me is read-only. A drawer (AccountSheet).
 */
export function AccountSheet() {
  const { tokens, type, spacing } = useTheme();
  const openLink = useOpenLink();
  const leave = useLeaveSheet();
  const { state, logout, flushBeforeSignOut } = useApp();
  const [signingOut, setSigningOut] = useState(false);
  const { preference, setPreference } = useThemePreference();
  const preview = accountSheetPreview.useData();
  const previewing = !state.auth.isAuthenticated && !!preview;
  const user = previewing ? preview.user : state.auth.user;
  const name = user?.name || user?.email || 'Signed in';
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [remaining, setRemaining] = useBiometricRemaining();

  useEffect(() => {
    let cancelled = false;
    void notificationService.isPushEnabled().then((enabled) => {
      if (!cancelled) setPushEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
            { text: 'Open settings', onPress: () => void Linking.openSettings() },
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
    // A destructive confirm: the warning tick says it matters.
    haptics.warning();
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: confirmLabel,
        style: 'destructive',
        // Signs out once the drawer has gone, not under it.
        onPress: () => leave(() => (previewing ? preview.onSignOut() : void logout())),
      },
    ]);
  }, [flushBeforeSignOut, leave, logout, preview, previewing, signingOut, state.sync.pendingScans]);

  const roles = [
    user?.global_admin ? 'Global Admin' : null,
    user?.is_organizer || user?.global_admin ? 'Organizer' : null,
    user?.is_participant ? 'Attendee' : null,
  ].filter((role): role is string => !!role);

  const unlocked = remaining > 0;

  return (
    <Sheet
      title="Account"
      contentContainerStyle={{ gap: spacing.lg, paddingHorizontal: SHEET_INSET - spacing.xs }}
    >
        <Container flush>
          <View style={styles.identity}>
            <Avatar name={name} uri={user?.avatarUrl} size={56} tint="red" decorative />
            <View style={styles.identityText}>
              <Text style={[type.h2, { color: tokens.textH }]}>{name}</Text>
              {user?.email && user.email !== name ? (
                <Text style={[type.body, { color: tokens.text2 }]}>{user.email}</Text>
              ) : null}
              {roles.length > 0 ? (
                <View style={styles.badges}>
                  {roles.map((role) => <Badge key={role} label={role} />)}
                </View>
              ) : null}
            </View>
          </View>
          <Divider />
          <ListRow
            title="Edit profile"
            subtitle="attend.hackclub.com"
            external
            divider={false}
            onPress={() => openLink(PROFILE_URL)}
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
          <ListRow
            title="Notifications"
            subtitle="Messages and updates on this device"
            disabled={pushEnabled === null || pushBusy}
            toggle={{ value: !!pushEnabled, onValueChange: (next) => void togglePush(next) }}
          />
          <ListRow
            title="Biometric lock"
            subtitle={unlocked
              ? `Unlocked for ${minutesLeft(remaining)} more minute${minutesLeft(remaining) === 1 ? '' : 's'}`
              : 'Locked'}
            leading={(
              <Icon
                name={unlocked ? 'check-circle' : 'lock-closed'}
                size={20}
                color={unlocked ? tokens.success : tokens.text2}
              />
            )}
            trailing={unlocked ? <Button title="Lock now" onPress={lockNow} /> : undefined}
            divider={false}
          />
        </Container>

        <Container flush>
          <ListRow
            title="Privacy policy"
            external
            onPress={() => openLink(PRIVACY_URL)}
          />
          <ListRow title="Version" value={appVersionLabel()} divider={false} />
        </Container>

        <Button title="Sign out" fullWidth loading={signingOut} onPress={() => void signOut()} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bannerRing: { borderWidth: 2, borderColor: withAlpha(overlayTokens.on, 0.45) },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
  identityText: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
});
