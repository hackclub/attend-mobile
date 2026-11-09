import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  Badge,
  Button,
  Container,
  StatusIndicator,
  TextField,
  PressableSurface,
} from '../components/ui';
import { EmptyState, ErrorView, LevelBadge, LevelChart, LoadingView, formatDateTime } from '../components/forms';
import { humanize } from '../services/statusDisplay';
import { useTheme, useThemedStyles, type Theme, type ThemeColors } from '../theme';
import type { IncidentLevel, IncidentStatus, IncidentSummary, RootStackParamList } from '../types';
import { useAndroidBottomInset, withBottomInset } from '../hooks/useAndroidBottomInset';

type Nav = NativeStackNavigationProp<RootStackParamList, 'IncidentList'>;

// Open work first; closed incidents fold away behind a link.
const STATUS_ORDER: IncidentStatus[] = ['open', 'in_review', 'closed'];

interface StatusSection {
  key: string;
  title: string;
  count: number;
  collapsed: boolean;
  data: IncidentSummary[];
}

function IncidentCard({
  incident,
  level,
  onPress,
}: {
  incident: IncidentSummary;
  level?: IncidentLevel;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const names = incident.participant_names;
  const meta = [
    names.length ? `${names[0]}${names.length > 1 ? ` (+${names.length - 1} more)` : ''}` : null,
    incident.location,
    formatDateTime(incident.occurred_at || incident.created_at),
    incident.reported_by?.name,
  ].filter(Boolean);

  return (
    <PressableSurface
      style={styles.card}
      contentStyle={styles.cardContent}
      rippleColor={tokens.text}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.badges}>
        <Badge label={humanize(incident.category)} />
        <LevelBadge level={level} code={incident.severity} name />
      </View>
      {incident.summary ? (
        <Text style={styles.summary} numberOfLines={2}>
          {incident.summary}
        </Text>
      ) : null}
      {meta.length ? (
        <Text style={styles.meta} numberOfLines={2}>
          {meta.join(' · ')}
        </Text>
      ) : null}
      {incident.hq_report ? (
        <StatusIndicator
          type="info"
          label={`Escalated to Hack Club HQ · ${humanize(incident.hq_report.status)}`}
        />
      ) : null}
    </PressableSurface>
  );
}

export function IncidentListScreen() {
  const bottomInset = useAndroidBottomInset();
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const { state } = useApp();
  const event = state.currentEvent;
  const [incidents, setIncidents] = useState<IncidentSummary[] | null>(null);
  const [levels, setLevels] = useState<IncidentLevel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [showChart, setShowChart] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    if (!event) return;
    try {
      const [list, options] = await Promise.all([
        api.getIncidents(event.id),
        api.getIncidentFormOptions(event.id).catch(() => null),
      ]);
      setIncidents(list);
      if (options) setLevels(options.levels);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, [event]);

  // Reload on focus so a new or edited incident shows on the way back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const levelsByKey = useMemo(() => Object.fromEntries(levels.map(l => [l.value, l])), [levels]);
  const trimmed = query.trim();

  // The web list filters on category, level, status, names and reporter.
  const visible = useMemo(() => {
    const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    if (!incidents || !terms.length) return incidents ?? [];
    return incidents.filter(incident => {
      const haystack = [
        humanize(incident.category),
        incident.severity,
        humanize(incident.status),
        ...incident.participant_names,
        incident.reported_by?.name,
        incident.summary,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every(t => haystack.includes(t));
    });
  }, [incidents, trimmed]);

  const sections = useMemo<StatusSection[]>(() => {
    const byStatus = new Map<string, IncidentSummary[]>();
    for (const incident of visible) {
      const bucket = byStatus.get(incident.status) ?? [];
      bucket.push(incident);
      byStatus.set(incident.status, bucket);
    }
    const keys = [
      ...STATUS_ORDER.filter(s => byStatus.has(s)),
      ...[...byStatus.keys()].filter(s => !STATUS_ORDER.includes(s as IncidentStatus)),
    ];
    return keys.map(key => {
      const items = byStatus.get(key) ?? [];
      // A search shows every match, closed or not.
      const collapsed = key === 'closed' && !showClosed && !trimmed;
      return { key, title: humanize(key), count: items.length, collapsed, data: collapsed ? [] : items };
    });
  }, [visible, showClosed, trimmed]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const newIncident = () => navigation.navigate('IncidentForm', {});

  if (!event) return <EmptyState title="No event selected" message="Pick an event on the Overview tab first." />;
  if (error && !incidents) return <ErrorView message={error} onRetry={load} />;
  if (!incidents) return <LoadingView />;

  const header = (
    <View style={styles.header}>
      <View style={styles.actionsRow}>
        <Button title="New incident" variant="primary" icon="plus" onPress={newIncident} />
      </View>
      <Text style={styles.description}>
        Private to your event team. Turn on “Escalate to Hack Club HQ” on a new incident, or escalate an
        existing one from its page, to involve HQ’s safeguarding team.
      </Text>
      {levels.length ? (
        <Button
          title={showChart ? 'Hide the triage chart' : 'Which level? The triage chart'}
          variant="link"
          icon={showChart ? 'chevron-up' : 'chevron-down'}
          iconPosition="end"
          onPress={() => setShowChart(v => !v)}
          style={styles.chartToggle}
        />
      ) : null}
      {showChart ? (
        <Container>
          <LevelChart levels={levels} />
        </Container>
      ) : null}
      {incidents.length ? (
        <TextField
          icon="search"
          value={query}
          onChangeText={setQuery}
          placeholder="Find incidents"
          clearable
          autoCorrect={false}
          returnKeyType="search"
        />
      ) : null}
    </View>
  );

  return (
    <SectionList
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      sections={sections}
      keyExtractor={item => item.id}
      ListHeaderComponent={header}
      contentContainerStyle={withBottomInset(styles.list, bottomInset)}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressBackgroundColor={tokens.bg}
        />
      }
      renderSectionHeader={({ section }) =>
        section.collapsed ? (
          <Button
            title={`${section.title} (${section.count})`}
            variant="link"
            icon="chevron-down"
            iconPosition="end"
            onPress={() => setShowClosed(true)}
            style={styles.collapsedToggle}
          />
        ) : (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {section.title} · {section.count}
            </Text>
            {section.key === 'closed' && showClosed && !trimmed ? (
              <Button title="Hide" variant="link" onPress={() => setShowClosed(false)} />
            ) : null}
          </View>
        )
      }
      renderItem={({ item }) => (
        <IncidentCard
          incident={item}
          level={levelsByKey[item.severity]}
          onPress={() => navigation.navigate('IncidentDetail', { incidentId: item.id })}
        />
      )}
      ListEmptyComponent={
        incidents.length ? (
          <EmptyState title={`No incidents match “${trimmed}”`} />
        ) : (
          <EmptyState title="No incidents" message="No incidents reported for this event." />
        )
      }
    />
  );
}

const makeStyles = (_colors: ThemeColors, theme: Theme) => {
  const { tokens: t, type, spacing, radii } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
    header: { paddingTop: spacing.md, gap: spacing.md },
    actionsRow: { flexDirection: 'row' },
    description: { ...type.body, color: t.text2 },
    chartToggle: { alignSelf: 'flex-start', paddingHorizontal: 0 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      marginTop: spacing.sm,
    },
    sectionTitle: { ...type.label, color: t.text },
    collapsedToggle: { alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: spacing.sm },
    card: {
      borderWidth: 1,
      borderColor: t.box,
      borderRadius: radii.container,
      backgroundColor: t.bg,
      marginBottom: spacing.md,
    },
    cardContent: { gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
    badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    summary: { ...type.h3, lineHeight: 22, color: t.textH },
    meta: { ...type.body, color: t.muted },
  });
};
