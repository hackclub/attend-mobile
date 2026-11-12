import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { AccountButton } from '../components/AccountSheet';
import { EventBanner, eventBannerText, useSwitcherPull } from '../components/EventBanner';
import { RoleRestricted, roleRestrictedMessage } from '../components/RoleRestricted';
import {
  Avatar,
  Badge,
  Button,
  Container,
  FadeIn,
  Flashbar,
  Icon,
  ListRow,
  QuickActionTile,
  QUICK_ACTION_LOADING,
  SkeletonLine,
  Stat,
  PressableSurface,
  type IconName,
  type QuickActionTileProps,
  RefreshControl,
} from '../components/ui';
import { useApp } from '../context/AppContext';
import { useBannerStatusBar } from '../hooks/useBannerStatusBar';
import { useEventAccess } from '../hooks/useEventAccess';
import { useEventScanContexts } from '../hooks/useEventScanContexts';
import { useSwitcherEvents } from '../hooks/useSwitcherEvents';
import { useTabBarInset, useTopTabBarInset } from '../hooks/useTabBarInset';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useRemote, type Remote } from '../hooks/useRemote';
import { api } from '../services/api';
import { eventDays } from '../services/eventDates';
import { eventRoleLabel } from '../services/eventRoles';
import { computeEventStats, formatPercent } from '../services/eventStats';
import { liveActivityService } from '../services/liveActivity';
import {
  inboundSummary,
  isCheckInLive,
  needsAttention,
  nextArrivals,
  overviewSectionOrder,
  recentScans,
  registrationBreakdown,
  type ArrivalGroup,
  type OverviewSection,
} from '../services/overview';
import { radii, useTheme } from '../theme';
import { travelClock, travelWeekday } from '../services/travelTimes';
import type { Event, MainTabParamList, AppStackParamList, TravelCalendarEntry } from '../types';
import { SwitchEventList } from '../components/EventSwitcher';
import { resetRoot } from '../navigation/rootNavigation';
import type { PartialState } from '../navigation/routes';
import { bannerKey } from '../navigation/switcherOverlay';
import { ScrollView } from 'react-native-gesture-handler';

type Navigation = NavigationProp<AppStackParamList & MainTabParamList>;

const CONTENT_MAX_WIDTH = 620;
const WIDE_MAX_WIDTH = 1040;
const TWO_COLUMN_MIN_WIDTH = 720;

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "9:30 AM" today, "Mon" this week, else "14 Nov". */
function lastSentLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (sameDay(date, now)) return clock(iso);
  if (now.getTime() - date.getTime() < 6 * 86_400_000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const MODE_LABEL: Record<TravelCalendarEntry['mode'], string> = {
  plane: 'Flight',
  train: 'Train',
  car: 'Car',
  bus: 'Bus',
  other: 'Travel',
};

/** The Overview tab: the current event at a glance. */
export function EventHome() {
  const { state, selectEvent } = useApp();
  // One load serves both the Overview and the embedded switcher below.
  const switcher = useSwitcherEvents();
  const { groups, canSwitch, refresh: refreshSwitcher } = switcher;
  const event = state.currentEvent;

  // Nothing to choose between: open the only event straight away.
  const onlyEvent = !event && groups.organising.length === 1 && groups.attending.length === 0
    ? groups.organising[0]
    : null;
  useEffect(() => {
    if (onlyEvent) void selectEvent(onlyEvent);
  }, [onlyEvent, selectEvent]);

  if (!event) return <SwitchEventList switcher={switcher} />;
  return <Overview event={event} canSwitch={canSwitch} onRefreshEvents={refreshSwitcher} />;
}

function Overview({
  event,
  canSwitch,
  onRefreshEvents,
}: {
  event: Event;
  canSwitch: boolean;
  onRefreshEvents: () => Promise<void>;
}) {
  const { tokens, type, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const topTabInset = useTopTabBarInset();
  const bannerStatusBar = useBannerStatusBar(tokens.bg);
  const tabBarInset = useTabBarInset();
  const { width } = useResponsiveLayout();
  const navigation = useNavigation<Navigation>();
  const { state, refreshParticipants, syncNow } = useApp();
  const access = useEventAccess();
  const { contexts } = useEventScanContexts(event.id);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const bannerSwitcher = useMemo(
    () => ({
      key: bannerKey.event(event),
      current: { eventId: event.id },
      enabled: canSwitch,
      switchTo: (home: PartialState, before?: () => void) => {
        before?.();
        resetRoot(navigation, home);
      },
    }),
    [canSwitch, event, navigation]
  );  // A pull on the banner opens the switcher; the page's scroll waits for it.
  const pull = useSwitcherPull(bannerSwitcher);


  const participants = state.participants;
  const stats = useMemo(() => computeEventStats(participants, contexts), [participants, contexts]);
  const live = useMemo(() => isCheckInLive(participants), [participants]);
  const registration = useMemo(() => registrationBreakdown(participants), [participants]);
  const attention = useMemo(() => needsAttention(participants), [participants]);
  const feed = useMemo(() => recentScans(participants), [participants]);

  const loadTravel = useMemo(
    () => (access.showTravel ? () => api.getTravelCalendar(event.id) : null),
    [access.showTravel, event.id]
  );
  const loadIncidents = useMemo(
    () => (access.canViewIncidents ? () => api.getIncidents(event.id) : null),
    [access.canViewIncidents, event.id]
  );
  const loadMessages = useMemo(() => () => api.getMessages(event.id), [event.id]);
  const [travel, reloadTravel] = useRemote(loadTravel, `${event.id}:${access.showTravel}`);
  const [incidents, reloadIncidents] = useRemote(loadIncidents, `${event.id}:${access.canViewIncidents}`);
  const [messages, reloadMessages] = useRemote(loadMessages, event.id);

  // The panels load when the tab gains focus (the first time included) and
  // again on every return, since counts go stale while staff work elsewhere.
  useFocusEffect(
    useCallback(() => {
      void reloadTravel();
      void reloadIncidents();
      void reloadMessages();
    }, [reloadIncidents, reloadMessages, reloadTravel])
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.allSettled([
      refreshParticipants(),
      reloadTravel(),
      reloadIncidents(),
      reloadMessages(),
      onRefreshEvents(),
    ]);
    setIsRefreshing(false);
  }, [onRefreshEvents, refreshParticipants, reloadIncidents, reloadMessages, reloadTravel]);

  const openPeople = () => navigation.navigate('Search');

  const twoColumns = width >= TWO_COLUMN_MIN_WIDTH;
  const days = eventDays(event);
  const running = !!days && days.untilStart <= 0 && days.untilEnd >= 0;
  const restricted = !access.canViewParticipantRecords;
  const pending = state.sync.pendingScans;

  const sections: Record<OverviewSection, ReactNode> = {
    checkIn: live || restricted ? (
      <Container title="Check-in" prominent>
        {restricted ? <RoleRestricted /> : (
          <View style={{ gap: spacing.lg }}>
            <View style={styles.statRow}>
              <Stat label="Participants" value={stats.total} style={styles.stat} />
              <Stat label="Checked in" value={stats.checkedIn} divider style={styles.stat} />
              <Stat label="Arrived" value={formatPercent(stats.checkedInFraction)} tone="accent" divider style={styles.stat} />
            </View>
            <Bar fraction={stats.checkedInFraction} color={tokens.success} />
            {stats.contexts.length > 0 ? (
              <>
                <Text style={[type.label, { color: tokens.text }]}>Scanned into</Text>
                {stats.contexts.map((context) => (
                  <View
                    key={context.id}
                    accessible
                    accessibilityLabel={`${context.name}: ${context.scanned} of ${context.total}`}
                  >
                    <View style={styles.contextRow}>
                      <Text style={[type.body, styles.flex, { color: tokens.text }]} numberOfLines={1}>{context.name}</Text>
                      <Text style={[type.body, { color: tokens.muted }]}>{context.scanned} of {context.total}</Text>
                    </View>
                    <Bar fraction={context.fraction} color={context.checksIn ? tokens.success : tokens.info} thin />
                  </View>
                ))}
              </>
            ) : null}
          </View>
        )}
      </Container>
    ) : (
      // Until check-in starts this card also stands in for "Arriving now".
      // It's only dashed (a prompt to set something up) with no scan contexts.
      <Placeholder
        icon="qrcode"
        title="Check-in hasn't started"
        detail={
          contexts.length === 0
            ? 'Set up a scan context to start.'
            : `${contexts.length} scan context${contexts.length === 1 ? '' : 's'} set up. Arrivals show here once people check in.`
        }
        dashed={contexts.length === 0}
        onPress={() => navigation.navigate('Scanner')}
      />
    ),

    attention: (
      <Container
        title="Needs attention"
        actions={restricted ? null : <Button variant="link" title="See all" onPress={openPeople} />}
      >
        {restricted ? <RoleRestricted /> : (
          <View style={{ gap: 10 }}>
            {attention.highSupport.length > 0 ? (
              <AttentionRow
                icon="exclamation"
                color={tokens.warning}
                title={`${attention.highSupport.length} high support`}
                detail={namesPreview(attention.highSupport.map((p) => p.display_name || p.full_name))}
              />
            ) : null}
            {attention.waiversPending > 0 ? (
              <AttentionRow
                icon="information-circle"
                color={tokens.info}
                title={`${attention.waiversPending} waiver${attention.waiversPending === 1 ? '' : 's'} pending`}
              />
            ) : null}
            {attention.highSupport.length === 0 && attention.waiversPending === 0 ? (
              <Text style={[type.body, { color: tokens.text2 }]}>
                No high support participants or pending waivers.
              </Text>
            ) : null}
          </View>
        )}
      </Container>
    ),

    arrivals: access.showTravel ? (
      <Container
        title="Next arrivals"
        actions={<Button variant="link" title="Travel" onPress={() => navigation.navigate('Travel')} />}
      >
        <Arrivals travel={travel} live={running} timeZone={event.timezone} />
      </Container>
    ) : null,

    actions: (
      <View style={styles.tiles}>
        {access.canViewIncidents ? (
          <QuickActionTile
            icon="exclamation"
            tint="amber"
            label="Incidents"
            subLabel={incidentsLabel(incidents)}
            onPress={() => navigation.navigate('IncidentList')}
          />
        ) : (
          // A role without the incident log still gets the confidential
          // report, so it is never left without a way to raise something.
          <QuickActionTile
            icon="exclamation"
            tint="amber"
            label="Report to HQ"
            subLabel="Confidential report"
            onPress={() => navigation.navigate('IncidentReport')}
          />
        )}
        <QuickActionTile
          icon="mail"
          tint="purple"
          label="Messages"
          subLabel={messagesLabel(messages, access.roleLabel)}
          disabled={messages.state === 'forbidden'}
          onPress={() => navigation.navigate('MessageList')}
        />
      </View>
    ),

    registration: (
      // The lead card until check-in starts, when that card takes over.
      <Container title="Registration" prominent={!live}>
        {restricted ? <RoleRestricted /> : (
          <View style={{ gap: spacing.md }}>
            <View>
              <Stat label="Total participants" value={registration.total} />
              <View style={[styles.legend, { gap: spacing.md }]}>
                <LegendItem color={tokens.success} label={`${registration.complete} complete`} />
                <LegendItem color={tokens.warningFill} label={`${registration.inProgress} in progress`} />
              </View>
            </View>
            <View style={[styles.segmented, { backgroundColor: tokens.div2 }]}>
              <View style={{ flex: registration.complete, backgroundColor: tokens.success }} />
              <View style={{ flex: registration.inProgress, backgroundColor: tokens.warningFill }} />
            </View>
            {registration.withdrawn > 0 ? (
              <Text style={[type.body, { color: tokens.muted }]}>{registration.withdrawn} withdrawn</Text>
            ) : null}
          </View>
        )}
      </Container>
    ),

    arrivingNow: live && !restricted ? (
      <Container
        title="Arriving now"
        flush
        actions={<Button variant="link" title="All participants" onPress={openPeople} />}
      >
        <View style={styles.feed}>
          {feed.map((item) => (
            <View
              key={item.participant.participant_event_id}
              style={styles.feedRow}
              accessible
              accessibilityLabel={`${item.participant.display_name}, ${item.contextName}, ${clock(item.scannedAt)}`}
            >
              <Avatar
                name={item.participant.display_name || item.participant.full_name}
                uri={item.participant.headshot_url}
                size={36}
                decorative
              />
              <View style={styles.flex}>
                <Text style={[type.label, { color: tokens.textH }]} numberOfLines={1}>
                  {item.participant.display_name || item.participant.full_name}
                </Text>
                <Text style={[type.body, { color: tokens.text2 }]} numberOfLines={1}>{item.contextName}</Text>
              </View>
              <Text style={[type.body, { color: tokens.muted }]}>{clock(item.scannedAt)}</Text>
            </View>
          ))}
        </View>
      </Container>
    ) : null,
  };

  const ordered = overviewSectionOrder(live)
    .map((key) => ({ key, node: sections[key] }))
    .filter((section) => section.node != null);
  const columns = twoColumns
    ? [ordered.filter((_, i) => i % 2 === 0), ordered.filter((_, i) => i % 2 === 1)]
    : [ordered];

  const banner = eventBannerText(event, eventRoleLabel(event.role));

  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <ScrollView
        requireToFail={pull}
        contentContainerStyle={{ paddingBottom: tabBarInset + spacing.xxl }}
        onScroll={bannerStatusBar.onScroll}
        scrollEventThrottle={32}
        refreshControl={
          <RefreshControl
            requireToFail={pull}
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            // The spinner shows on the page above the banner, not on the
            // banner, so white vanished in light mode.
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressBackgroundColor={tokens.bg}
            progressViewOffset={insets.top + topTabInset}
          />
        }
      >
        <EventBanner
          event={event}
          eyebrow={banner.eyebrow}
          eyebrowIcon={banner.eyebrowIcon}
          meta={banner.meta}
          topInset={insets.top + topTabInset}
          blendInto={tokens.bg}
          switcher={bannerSwitcher}
          pull={pull}
          accessory={<AccountButton onBanner />}
        />

        <View
          style={[
            styles.body,
            { maxWidth: twoColumns ? WIDE_MAX_WIDTH : CONTENT_MAX_WIDTH, gap: spacing.lg },
          ]}
        >
          {pending > 0 ? (
            <Flashbar
              type="warning"
              icon="refresh"
              title={`${pending} scan${pending === 1 ? '' : 's'} pending sync`}
              action={state.sync.isOnline ? { label: 'Sync now', onPress: () => void syncNow() } : undefined}
            />
          ) : null}

          <View style={[styles.columns, { gap: spacing.lg }]}>
            {columns.map((column, index) => (
              <View key={index} style={[styles.column, { gap: spacing.lg }]}>
                {column.map((section) => <React.Fragment key={section.key}>{section.node}</React.Fragment>)}
              </View>
            ))}
          </View>

          <LiveActivityRow key={event.id} />
        </View>
      </ScrollView>
      {bannerStatusBar.scrim}
    </View>
  );
}

function namesPreview(names: string[], max = 3): string {
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
}

type QuickActionSubLabel = QuickActionTileProps['subLabel'];

function incidentsLabel(incidents: Remote<{ status: string }[]>): QuickActionSubLabel {
  if (incidents.state === 'loading') return QUICK_ACTION_LOADING;
  if (incidents.state !== 'ready') return undefined;
  const open = incidents.data.filter((incident) => incident.status !== 'closed').length;
  return open === 0 ? 'None open' : `${open} open`;
}

function messagesLabel(
  messages: Remote<{ sent_at?: string | null }[]>,
  roleLabel: string | null
): QuickActionSubLabel {
  if (messages.state === 'forbidden') return roleRestrictedMessage(roleLabel);
  if (messages.state === 'loading') return QUICK_ACTION_LOADING;
  if (messages.state !== 'ready') return undefined;
  const last = messages.data
    .map((message) => message.sent_at)
    .filter((sent): sent is string => !!sent)
    .sort()
    .pop();
  return last ? `Last sent ${lastSentLabel(last)}` : 'None sent';
}

function Bar({ fraction, color, thin }: { fraction: number; color: string; thin?: boolean }) {
  const { tokens } = useTheme();
  const height = thin ? 4 : 8;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: tokens.div2, marginTop: thin ? 6 : 0 }]}>
      <View style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, height: '100%', backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

function AttentionRow({ icon, color, title, detail }: { icon: IconName; color: string; title: string; detail?: string }) {
  const { tokens, type } = useTheme();
  return (
    <View style={styles.attentionRow} accessible accessibilityLabel={[title, detail].filter(Boolean).join('. ')}>
      <View style={styles.attentionIcon}><Icon name={icon} size={16} color={color} /></View>
      <View style={styles.flex}>
        <Text style={[type.label, { color: tokens.textH }]}>{title}</Text>
        {detail ? <Text style={[type.body, { color: tokens.text2 }]}>{detail}</Text> : null}
      </View>
    </View>
  );
}

/** A section that has nothing to show yet: one dashed line. */
/** A coloured dot and its count, keying a segment of a bar. */
function LegendItem({ color, label }: { color: string; label: string }) {
  const { tokens, type } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[type.body, { color: tokens.text2 }]}>{label}</Text>
    </View>
  );
}

function Placeholder({
  icon,
  title,
  detail,
  dashed = false,
  onPress,
}: {
  icon?: IconName;
  title: string;
  detail: string;
  /** For a prompt to set something up; otherwise it's a plain card. */
  dashed?: boolean;
  onPress?: () => void;
}) {
  const { tokens, type, radii } = useTheme();
  const body = (
    <>
      {icon ? (
        <View style={[styles.placeholderIcon, { backgroundColor: tokens.tint.grey.bg }]}>
          <Icon name={icon} size={20} color={tokens.tint.grey.fg} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <Text style={[icon ? type.h3 : type.h2, { color: tokens.textH }]}>{title}</Text>
        <Text style={[type.body, { color: tokens.text2, marginTop: icon ? 0 : 8 }]}>{detail}</Text>
      </View>
      {onPress ? <Icon name="chevron-right" size={20} color={tokens.muted} /> : null}
    </>
  );
  const frame = [
    styles.placeholder,
    dashed
      ? { borderColor: tokens.box, borderStyle: 'dashed' as const }
      : { borderColor: tokens.cardBorder, backgroundColor: tokens.card },
    { borderRadius: radii.container },
  ];
  if (!onPress) return <View style={[frame, styles.placeholderContent]} accessible>{body}</View>;
  return (
    <PressableSurface
      onPress={onPress}
      rippleColor={tokens.text}
      pressScale={0.98}
      style={frame}
      contentStyle={styles.placeholderContent}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
    >
      {body}
    </PressableSurface>
  );
}

function Arrivals({
  travel,
  live,
  timeZone,
}: {
  travel: Remote<{ entries: TravelCalendarEntry[]; eventTimezone?: string | null }>;
  live: boolean;
  timeZone?: string | null;
}) {
  const { tokens, type } = useTheme();
  const groups = useMemo(
    () => (travel.state === 'ready' ? nextArrivals(travel.data.entries) : []),
    [travel]
  );
  const summary = useMemo(
    () => (travel.state === 'ready' ? inboundSummary(travel.data.entries) : null),
    [travel]
  );

  if (travel.state === 'forbidden') return <RoleRestricted />;
  if (travel.state === 'loading') {
    return (
      <View accessible accessibilityLabel="Loading travel">
        <SkeletonLine width="70%" />
        <SkeletonLine width="45%" />
      </View>
    );
  }
  if (travel.state === 'error') {
    return <Text style={[type.body, { color: tokens.text2 }]}>Travel is unavailable offline.</Text>;
  }

  return (
    <FadeIn style={{ gap: 12 }}>
      {!live && summary && summary.travelling > 0 ? (
        <Text style={[type.body, { color: tokens.text2 }]}>
          {[
            `${summary.travelling} travelling in`,
            summary.flying > 0 ? `${summary.flying} flying` : null,
            summary.unaccompanied > 0 ? `${summary.unaccompanied} unaccompanied` : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {groups.length === 0 ? (
        <Text style={[type.body, { color: tokens.text2 }]}>No upcoming arrivals.</Text>
      ) : groups.map((group) => (
        <ArrivalRow
          key={group.key}
          group={group}
          timeZone={(travel.state === 'ready' ? travel.data.eventTimezone : null) ?? timeZone}
        />
      ))}
    </FadeIn>
  );
}

// Times read as the Travel tab's do: "2:15 PM" in the event's timezone, the
// period muted, and the weekday above for a later day.
function ArrivalRow({ group, timeZone }: { group: ArrivalGroup; timeZone?: string | null }) {
  const { tokens, type } = useTheme();
  const today = sameDay(new Date(group.at), new Date());
  const time = travelClock(group.at, timeZone);
  const weekday = today ? null : travelWeekday(group.at, timeZone);
  const spoken = time ? [weekday, time.time, time.period].filter(Boolean).join(' ') : null;
  const service = group.reference || MODE_LABEL[group.mode];
  const who = group.people.length === 1 ? group.people[0] : `${group.people.length} people`;
  return (
    <View style={styles.arrivalRow} accessible accessibilityLabel={[spoken, service, who, group.route].filter(Boolean).join(', ')}>
      <Text style={[type.label, styles.arrivalTime, { color: tokens.textH }]}>
        {weekday ? `${weekday}\n` : null}
        {time ? (
          <>
            <Text style={styles.tabular}>{time.time}</Text>
            <Text style={[type.body, { color: tokens.muted }]}> {time.period}</Text>
          </>
        ) : '—:—'}
      </Text>
      <View style={styles.flex}>
        <Text style={[type.body, { color: tokens.text }]}>
          <Text style={[type.label, { color: tokens.textH }]}>{service}</Text> · {who}
        </Text>
        {group.route ? <Text style={[type.body, { color: tokens.text2 }]}>{group.route}</Text> : null}
      </View>
      {group.unaccompaniedMinor ? <Badge label="UM" color="yellow" /> : null}
    </View>
  );
}

function LiveActivityRow() {
  const { startLiveActivity, stopLiveActivity } = useApp();
  const supported = liveActivityService.isSupported();
  // Keyed by event where it's rendered, so this re-reads on a switch.
  const [running, setRunning] = useState(() => liveActivityService.isRunning());

  if (!supported) return null;

  const toggle = async (next: boolean) => {
    if (next) await startLiveActivity();
    else await stopLiveActivity();
    setRunning(liveActivityService.isRunning());
  };

  return (
    <Container flush>
      <ListRow
        title="Live Activity"
        subtitle="Check-in progress on the Lock Screen"
        divider={false}
        toggle={{ value: running, onValueChange: (next) => void toggle(next) }}
      />
    </Container>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { width: '100%', alignSelf: 'center', padding: 16 },
  columns: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0 },
  flex: { flex: 1, minWidth: 0 },
  statRow: { flexDirection: 'row' },
  stat: { flex: 1 },
  contextRow: { flexDirection: 'row', gap: 8 },
  track: { overflow: 'hidden' },
  segmented: { flexDirection: 'row', height: 8, borderRadius: radii.badge, overflow: 'hidden', gap: 2 },
  tiles: { flexDirection: 'row', gap: 12 },
  feed: { paddingTop: 4, paddingBottom: 8 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 20 },
  attentionRow: { flexDirection: 'row', gap: 8 },
  attentionIcon: { marginTop: 2 },
  placeholder: { borderWidth: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  placeholderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  placeholderIcon: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  arrivalRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  arrivalTime: { width: 72 },
  tabular: { fontVariant: ['tabular-nums'] },
});
