import React, { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useEventAccess } from '../hooks/useEventAccess';
import { useEventScanContexts } from '../hooks/useEventScanContexts';
import { computeEventStats, formatPercent } from '../services/eventStats';
import { liveActivityService } from '../services/liveActivity';
import { EventPass } from '../components/EventPass';
import { VersionFooter } from '../components/VersionFooter';
import { makeCardSurface } from '../components/ui';
import { useTheme, useThemedStyles, type Theme, type ThemeColors } from '../theme';
import type { Event, MainTabParamList } from '../types';

// The bar above the pass. Fixed, so the screen that opens this one knows
// where the pass will land before it has been laid out.
export const HOME_TOP_BAR = 52;
export const CONTENT_MAX_WIDTH = 620;

type NavigationProp = NativeStackNavigationProp<MainTabParamList, 'Events'>;
type IconName = keyof typeof Ionicons.glyphMap;

interface QuickAction {
  key: string;
  icon: IconName;
  label: string;
  detail: string;
  tint: string;
  onPress: () => void;
}

interface EventHomeProps {
  event: Event;
  // Hidden while the pass flying in from the stack is drawn in its place.
  hidePass?: boolean;
  topInset: number;
  bottomInset: number;
  // Absent beside the stack in a split view, where the events are already
  // on screen and there's nothing to go back to.
  onShowAllEvents?: () => void;
  // The roomier layout for the detail pane of a split view.
  wide?: boolean;
}

// The widest the wide layout's column grows, and the widths at which the pass
// and stats sit side by side and the quick actions go three across.
const WIDE_MAX_WIDTH = 1040;
const HERO_ROW_MIN_WIDTH = 720;
const THREE_ACROSS_MIN_WIDTH = 600;

/**
 * One event's homepage: its pass, how far through check-in it is, and a
 * shortcut to everything Attend does for it.
 */
export const EventHome = forwardRef<React.ComponentRef<typeof View>, EventHomeProps>(function EventHome(
  { event, hidePass, topInset, bottomInset, onShowAllEvents, wide },
  passRef
) {
  const [columnWidth, setColumnWidth] = useState(0);
  const heroRow = !!wide && columnWidth >= HERO_ROW_MIN_WIDTH;
  const threeAcross = !!wide && columnWidth >= THREE_ACROSS_MIN_WIDTH;
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NavigationProp>();
  const { state, refreshParticipants, startLiveActivity, stopLiveActivity } = useApp();
  const {
    roleLabel,
    roleSummary,
    canViewParticipantRecords,
    canViewParticipantPii,
    canViewIncidents,
    showTravel,
  } = useEventAccess();
  const { contexts } = useEventScanContexts(event.id);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveActivityRunning, setLiveActivityRunning] = useState(false);
  const liveActivitySupported = Platform.OS === 'ios' && liveActivityService.isSupported();

  // Say once, in one place, why this event shows less than usual — otherwise
  // a missing birthday or a missing tab reads as a bug.
  const showRoleNotice = !!roleLabel
    && !!roleSummary
    && (!canViewParticipantRecords || !canViewParticipantPii);

  const stats = useMemo(
    () => computeEventStats(state.participants, contexts),
    [state.participants, contexts]
  );

  useEffect(() => {
    setLiveActivityRunning(liveActivityService.isRunning());
  }, [event.id]);

  const handleToggleLiveActivity = async () => {
    if (liveActivityRunning) {
      await stopLiveActivity();
      setLiveActivityRunning(false);
    } else {
      await startLiveActivity();
      setLiveActivityRunning(liveActivityService.isRunning());
    }
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshParticipants();
    } catch {
      // The cached roster stays on screen; the sync banner covers offline.
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshParticipants]);

  const openStack = (screen: string, params?: object) =>
    navigation.getParent()?.navigate(screen, params);

  // Kiosk runs one scan context, as from the scanner; from here that is the
  // event's check-in context, or its first one if none checks in.
  const kioskContext = stats.contexts.find((context) => context.checksIn) ?? stats.contexts[0];

  const actions: QuickAction[] = [
    {
      key: 'scan',
      icon: 'qr-code-outline',
      label: 'Scan',
      detail: 'QR and NFC check-in',
      tint: colors.red,
      onPress: () => navigation.navigate('Scanner'),
    },
    ...(canViewParticipantRecords
      ? [{
          key: 'search',
          icon: 'search' as IconName,
          label: 'Participants',
          detail: 'Search and look up',
          tint: colors.blue,
          onPress: () => navigation.navigate('Search'),
        }]
      : []),
    ...(showTravel
      ? [{
          key: 'travel',
          icon: 'airplane-outline' as IconName,
          label: 'Travel',
          detail: 'Arrivals and pickups',
          tint: colors.teal,
          onPress: () => navigation.navigate('Travel'),
        }]
      : []),
    // The incident log is where a report reaches HQ from; a role that can't
    // open the log still gets the confidential report, so it is never left
    // without a way to raise something.
    canViewIncidents
      ? {
          key: 'incidents',
          icon: 'shield-checkmark-outline',
          label: 'Incidents',
          detail: 'Log and escalate to HQ',
          tint: colors.orange,
          onPress: () => openStack('IncidentList'),
        }
      : {
          key: 'report',
          icon: 'shield-checkmark-outline',
          label: 'Report to HQ',
          detail: 'Confidential report',
          tint: colors.orange,
          onPress: () => openStack('IncidentReport'),
        },
    {
      key: 'messages',
      icon: 'megaphone-outline',
      label: 'Messages',
      detail: 'Email, SMS, Slack, push',
      tint: colors.purple,
      onPress: () => openStack('MessageList'),
    },
    {
      key: 'kiosk',
      icon: 'tablet-portrait-outline',
      label: 'Kiosk',
      detail: 'Self-serve check-in',
      tint: colors.gray[700],
      onPress: () => openStack('KioskSetup', {
        scanContextId: kioskContext?.id,
        scanContextName: kioskContext?.name,
      }),
    },
  ];

  const passView = (
    <Pressable
      onPress={onShowAllEvents}
      disabled={!onShowAllEvents}
      accessibilityRole={onShowAllEvents ? 'button' : undefined}
      accessibilityLabel={onShowAllEvents ? `${event.name}. Show all events` : event.name}
    >
      <EventPass
        ref={passRef}
        event={event}
        style={hidePass && styles.hidden}
      />
    </Pressable>
  );

  const statsCard = canViewParticipantRecords ? (
    <View style={[styles.card, heroRow && styles.heroCard]}>
      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Participants</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{stats.checkedIn}</Text>
          <Text style={styles.statLabel}>Checked in</Text>
        </View>
        <View style={[styles.stat, styles.statRight]}>
          <Text style={[styles.statValue, styles.statAccent]}>
            {formatPercent(stats.checkedInFraction)}
          </Text>
          <Text style={styles.statLabel}>Arrived</Text>
        </View>
      </View>
      <ProgressBar fraction={stats.checkedInFraction} color={colors.green} />
      {stats.total === 0 ? (
        <Text style={styles.emptyStat}>
          {state.sync.isSyncing ? 'Loading participants…' : 'No participants yet.'}
        </Text>
      ) : null}

      {stats.contexts.length > 0 ? (
        <View style={styles.contexts}>
          <Text style={styles.sectionLabel}>Scanned into</Text>
          {stats.contexts.map((context) => (
            <View
              key={context.id}
              style={styles.context}
              accessible
              accessibilityLabel={`${context.name}: ${context.scanned} of ${context.total}, ${formatPercent(context.fraction)}`}
            >
              <View style={styles.contextHeader}>
                <Text style={styles.contextName} numberOfLines={1}>{context.name}</Text>
                <Text style={styles.contextCount}>
                  {context.scanned} of {context.total}
                  <Text style={styles.contextPercent}>  {formatPercent(context.fraction)}</Text>
                </Text>
              </View>
              <ProgressBar
                fraction={context.fraction}
                color={context.checksIn ? colors.green : colors.blue}
                thin
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  ) : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topInset, paddingBottom: bottomInset + 24 },
      ]}
      refreshControl={
        canViewParticipantRecords ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.text.accent}
            progressViewOffset={topInset}
          />
        ) : undefined
      }
    >
      <View
        style={[styles.column, wide && styles.columnWide]}
        onLayout={(e) => setColumnWidth(e.nativeEvent.layout.width)}
      >
        {onShowAllEvents ? (
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={onShowAllEvents}
              style={styles.backButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="All events"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text.accent} />
              <Text style={styles.backText}>Events</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.topSpace} />
        )}

        {heroRow ? (
          <View style={styles.hero}>
            <View style={styles.heroItem}>{passView}</View>
            {statsCard ? <View style={styles.heroItem}>{statsCard}</View> : null}
          </View>
        ) : (
          passView
        )}

        {state.sync.pendingScans > 0 && (
          <View style={styles.syncBanner}>
            <Ionicons name="cloud-upload-outline" size={18} color={colors.white} />
            <Text style={styles.syncText}>
              {state.sync.pendingScans} scan{state.sync.pendingScans !== 1 ? 's' : ''} waiting to sync
            </Text>
          </View>
        )}

        {showRoleNotice && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={20} color={colors.gray[600]} />
            <View style={styles.noticeText}>
              <Text style={styles.noticeTitle}>{roleLabel} on this event</Text>
              <Text style={styles.noticeBody}>
                {roleSummary}
                {canViewParticipantRecords
                  ? ''
                  : ' Participant records are not available for this role.'}
              </Text>
            </View>
          </View>
        )}

        {heroRow ? null : statsCard}

        <Text style={styles.sectionHeading}>Quick actions</Text>
        <View style={styles.grid}>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[styles.tile, threeAcross && styles.tileThird]}
              onPress={action.onPress}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityHint={action.detail}
            >
              <View style={[styles.tileIcon, { backgroundColor: `${action.tint}1F` }]}>
                <Ionicons name={action.icon} size={22} color={action.tint} />
              </View>
              <Text style={styles.tileLabel} numberOfLines={1}>{action.label}</Text>
              <Text style={styles.tileDetail} numberOfLines={1}>{action.detail}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {liveActivitySupported && (
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="pulse" size={22} color={colors.text.accent} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Live Activity</Text>
                <Text style={styles.rowSubtitle}>Check-in progress on the Lock Screen</Text>
              </View>
              <TouchableOpacity
                style={[styles.pillButton, liveActivityRunning && styles.pillButtonActive]}
                onPress={handleToggleLiveActivity}
                accessibilityRole="button"
                accessibilityLabel={liveActivityRunning ? 'Stop Live Activity' : 'Start Live Activity'}
              >
                <Text style={[styles.pillButtonText, liveActivityRunning && styles.pillButtonTextActive]}>
                  {liveActivityRunning ? 'Stop' : 'Start'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <VersionFooter />
      </View>
    </ScrollView>
  );
});

function ProgressBar({ fraction, color, thin }: { fraction: number; color: string; thin?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%` as const;
  return (
    <View style={[styles.track, thin && styles.trackThin]}>
      <View style={[styles.fill, { width, backgroundColor: color }]} />
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) => StyleSheet.create({
  // See-through: the Events tab paints the page, and while a pass travels
  // between the stack and this screen the stack shows beneath it.
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
  },
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  columnWide: {
    maxWidth: WIDE_MAX_WIDTH,
  },
  topBar: {
    height: HOME_TOP_BAR,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topSpace: {
    height: 16,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  heroItem: {
    flex: 1,
  },
  heroCard: {
    marginTop: 0,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    marginLeft: -6,
  },
  backText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.accent,
  },
  hidden: {
    opacity: 0,
  },
  card: {
    ...makeCardSurface(colors, theme),
    marginTop: 12,
    padding: 16,
  },
  syncBanner: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.orange,
  },
  syncText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  notice: {
    ...makeCardSurface(colors, theme),
    marginTop: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noticeText: {
    flex: 1,
    gap: 2,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  noticeBody: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  stat: {
    flex: 1,
  },
  statRight: {
    alignItems: 'flex-end',
  },
  statValue: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  statAccent: {
    color: colors.status.success,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginTop: 2,
  },
  emptyStat: {
    marginTop: 10,
    fontSize: 13,
    color: colors.text.secondary,
  },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.gray[100],
    overflow: 'hidden',
  },
  trackThin: {
    height: 6,
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  contexts: {
    marginTop: 18,
    gap: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  context: {
    gap: 6,
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  contextName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  contextCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  contextPercent: {
    fontWeight: '800',
    color: colors.text.primary,
  },
  sectionHeading: {
    marginTop: 22,
    marginBottom: 2,
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  tile: {
    ...makeCardSurface(colors, theme),
    flexBasis: '45%',
    flexGrow: 1,
    margin: 6,
    padding: 14,
    minHeight: 112,
  },
  tileThird: {
    flexBasis: '30%',
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  tileLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  tileDetail: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    marginLeft: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  rowSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  pillButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.red,
  },
  pillButtonActive: {
    backgroundColor: colors.gray[200],
  },
  pillButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  pillButtonTextActive: {
    color: colors.text.primary,
  },
});
