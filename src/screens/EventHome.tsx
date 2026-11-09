import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { AccountButton, AccountSheet } from '../components/AccountSheet';
import { EventBanner } from '../components/EventBanner';
import { RoleRestricted, roleRestrictedMessage } from '../components/RoleRestricted';
import {
  Avatar,
  Badge,
  Button,
  Container,
  Flashbar,
  Icon,
  QuickActionTile,
  Stat,
  Toggle,
  pressedStyle,
  ripple,
  type IconName,
} from '../components/ui';
import { useApp } from '../context/AppContext';
import { useEventAccess } from '../hooks/useEventAccess';
import { useEventScanContexts } from '../hooks/useEventScanContexts';
import { useSwitcherEvents } from '../hooks/useSwitcherEvents';
import { useTabBarInset, useTopTabBarInset } from '../hooks/useTabBarInset';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { api, ApiError } from '../services/api';
import { eventDays, eventPhaseLabel, formatEventDateRange } from '../services/eventDates';
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
import { useTheme } from '../theme';
import type { Event, MainTabParamList, RootStackParamList, TravelCalendarEntry } from '../types';
import { SwitchEventScreen } from './SwitchEventScreen';

type Navigation = NavigationProp<RootStackParamList & MainTabParamList>;

const CONTENT_MAX_WIDTH = 620;
const WIDE_MAX_WIDTH = 1040;
const TWO_COLUMN_MIN_WIDTH = 720;

/** A remote panel: loading, loaded, refused for this role, or unreachable. */
type Remote<T> =
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  | { state: 'forbidden' }
  | { state: 'error' };

function useRemote<T>(load: (() => Promise<T>) | null, key: string) {
  // Tagged with the key it was loaded for, so a new event reads as loading
  // until its own answer arrives.
  const [entry, setEntry] = useState<{ key: string; value: Remote<T> } | null>(null);
  const run = useCallback(async () => {
    if (!load) return;
    try {
      const data = await load();
      setEntry({ key, value: { state: 'ready', data } });
    } catch (error) {
      setEntry({
        key,
        value: error instanceof ApiError && error.isForbidden ? { state: 'forbidden' } : { state: 'error' },
      });
    }
  }, [key, load]);
  useEffect(() => {
    void run();
  }, [run]);
  const value: Remote<T> = entry && entry.key === key ? entry.value : { state: 'loading' };
  return [value, run] as const;
}

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
  const { groups, canSwitch, refresh: refreshSwitcher } = useSwitcherEvents();
  const event = state.currentEvent;

  // Nothing to choose between: open the only event straight away.
  const onlyEvent = !event && groups.organising.length === 1 && groups.attending.length === 0
    ? groups.organising[0]
    : null;
  useEffect(() => {
    if (onlyEvent) void selectEvent(onlyEvent);
  }, [onlyEvent, selectEvent]);

  if (!event) return <SwitchEventScreen embedded />;
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
  const tabBarInset = useTabBarInset();
  const { width } = useResponsiveLayout();
  const navigation = useNavigation<Navigation>();
  const { state, refreshParticipants, syncNow } = useApp();
  const access = useEventAccess();
  const { contexts } = useEventScanContexts(event.id);
  const [accountOpen, setAccountOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Counts on the tiles go stale while staff work elsewhere; refresh on return.
  useFocusEffect(
    useCallback(() => {
      void reloadIncidents();
      void reloadMessages();
    }, [reloadIncidents, reloadMessages])
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
      <Container title="Check-in">
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
      <Placeholder
        icon="qrcode"
        title="Check-in hasn't started"
        detail={`${contexts.length} scan context${contexts.length === 1 ? '' : 's'} set up`}
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
        <Arrivals travel={travel} live={running} />
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
      <Container title="Registration">
        {restricted ? <RoleRestricted /> : (
          <View style={{ gap: spacing.md }}>
            <Stat
              label="Total participants"
              value={registration.total}
              sub={`${registration.complete} complete · ${registration.inProgress} in progress`}
            />
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
    ) : (
      <Placeholder
        title="Arriving now"
        detail={restricted ? roleRestrictedMessage(access.roleLabel) : 'Check-ins will show here as people arrive.'}
      />
    ),
  };

  const ordered = overviewSectionOrder(live)
    .map((key) => ({ key, node: sections[key] }))
    .filter((section) => section.node != null);
  const columns = twoColumns
    ? [ordered.filter((_, i) => i % 2 === 0), ordered.filter((_, i) => i % 2 === 1)]
    : [ordered];

  const meta = [formatEventDateRange(event), event.location_city, eventRoleLabel(event.role)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarInset + spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Platform.OS === 'ios' ? '#ffffff' : tokens.accent}
            progressViewOffset={insets.top + topTabInset}
          />
        }
      >
        <EventBanner
          event={event}
          eyebrow={eventPhaseLabel(event)}
          eyebrowIcon={running ? 'check-circle' : 'clock'}
          meta={meta}
          topInset={insets.top + topTabInset}
          onPress={canSwitch ? () => navigation.navigate('SwitchEvent') : undefined}
          accessory={<AccountButton onBanner onPress={() => setAccountOpen(true)} />}
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
      <AccountSheet visible={accountOpen} onClose={() => setAccountOpen(false)} />
    </View>
  );
}

function namesPreview(names: string[], max = 3): string {
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
}

function incidentsLabel(incidents: Remote<{ status: string }[]>): string | undefined {
  if (incidents.state !== 'ready') return undefined;
  const open = incidents.data.filter((incident) => incident.status !== 'closed').length;
  return open === 0 ? 'None open' : `${open} open`;
}

function messagesLabel(
  messages: Remote<{ sent_at?: string | null }[]>,
  roleLabel: string | null
): string | undefined {
  if (messages.state === 'forbidden') return roleRestrictedMessage(roleLabel);
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
function Placeholder({ icon, title, detail, onPress }: { icon?: IconName; title: string; detail: string; onPress?: () => void }) {
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
  const frame = [styles.placeholder, { borderColor: tokens.box, borderRadius: radii.container }];
  if (!onPress) return <View style={frame} accessible>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={ripple(tokens.pressed, { foreground: true })}
      style={({ pressed }) => [frame, pressedStyle(pressed)]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
    >
      {body}
    </Pressable>
  );
}

function Arrivals({ travel, live }: { travel: Remote<{ entries: TravelCalendarEntry[] }>; live: boolean }) {
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
  if (travel.state === 'loading') return <Text style={[type.body, { color: tokens.text2 }]}>Loading travel…</Text>;
  if (travel.state === 'error') {
    return <Text style={[type.body, { color: tokens.text2 }]}>Travel is unavailable offline.</Text>;
  }

  return (
    <View style={{ gap: 12 }}>
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
      ) : groups.map((group) => <ArrivalRow key={group.key} group={group} />)}
    </View>
  );
}

function ArrivalRow({ group }: { group: ArrivalGroup }) {
  const { tokens, type } = useTheme();
  const at = new Date(group.at);
  const today = sameDay(at, new Date());
  const service = group.reference || MODE_LABEL[group.mode];
  const who = group.people.length === 1 ? group.people[0] : `${group.people.length} people`;
  return (
    <View style={styles.arrivalRow} accessible accessibilityLabel={[clock(group.at), service, who, group.route].filter(Boolean).join(', ')}>
      <Text style={[type.label, styles.arrivalTime, { color: tokens.textH }]}>
        {today ? clock(group.at) : `${at.toLocaleDateString([], { weekday: 'short' })}\n${clock(group.at)}`}
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
  const { tokens, type } = useTheme();
  const { startLiveActivity, stopLiveActivity } = useApp();
  const supported = Platform.OS === 'ios' && liveActivityService.isSupported();
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
      <View style={styles.settingRow}>
        <View style={styles.flex}>
          <Text style={[type.label, { color: tokens.textH }]}>Live Activity</Text>
          <Text style={[type.body, { color: tokens.text2 }]}>Check-in progress on the Lock Screen</Text>
        </View>
        <Toggle value={running} onValueChange={(next) => void toggle(next)} accessibilityLabel="Live Activity" />
      </View>
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
  segmented: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  tiles: { flexDirection: 'row', gap: 12 },
  feed: { paddingTop: 4, paddingBottom: 8 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 20 },
  attentionRow: { flexDirection: 'row', gap: 8 },
  attentionIcon: { marginTop: 2 },
  placeholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  placeholderIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  arrivalRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  arrivalTime: { width: 64 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
});
