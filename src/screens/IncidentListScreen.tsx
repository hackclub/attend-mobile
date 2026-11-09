import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  ActionMenu,
  Badge,
  Button,
  Container,
  EmptyState,
  ErrorView,
  GroupToggle,
  LoadingView,
  PressableSurface,
  Screen,
  StatusIndicator,
  TextField,
} from '../components/ui';
import { LevelBadge, LevelChart, formatDateTime } from '../components/forms';
import { collapsibleGroup } from '../services/collapsibleGroup';
import { humanize } from '../services/statusDisplay';
import { useTheme, useThemedStyles, type Theme } from '../theme';
import type { IncidentLevel, IncidentStatus, IncidentSummary, AppStackParamList } from '../types';
import { useScreenInsets } from '../hooks/useScreenInsets';

type Nav = NativeStackNavigationProp<AppStackParamList, 'IncidentList'>;

// Open work first; closed incidents fold away under their label.
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
  const insets = useScreenInsets();
  const { tokens, spacing } = useTheme();
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
      const collapsed = key === 'closed' && !collapsibleGroup(showClosed, !!trimmed).expanded;
      return { key, title: humanize(key), count: items.length, collapsed, data: collapsed ? [] : items };
    });
  }, [visible, showClosed, trimmed]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const newIncident = () => navigation.navigate('IncidentForm', {});

  if (!event) {
    return (
      <Screen title="Incidents">
        <EmptyState title="No event selected" message="Pick an event on the Overview tab first." />
      </Screen>
    );
  }
  if (error && !incidents) {
    return (
      <Screen title="Incidents" scroll={false}>
        <ErrorView message={error} onRetry={load} />
      </Screen>
    );
  }
  if (!incidents) {
    return (
      <Screen title="Incidents" scroll={false}>
        <LoadingView />
      </Screen>
    );
  }

  // Search sits pinned under the title; the triage chart, when shown,
  // scrolls with the list.
  const search = incidents.length ? (
    <View style={styles.search}>
      <TextField
        icon="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Find incidents"
        accessibilityLabel="Find incidents"
        clearable
        autoCorrect={false}
        returnKeyType="search"
      />
    </View>
  ) : null;
  const header = showChart && levels.length ? (
    <Container title="Which level? The triage chart" style={styles.chart}>
      <LevelChart levels={levels} />
    </Container>
  ) : undefined;

  return (
    <Screen
      title="Incidents"
      scroll={false}
      action={
        <View style={styles.headerActions}>
          <Button title="New incident" variant="primary" icon="plus" onPress={newIncident} />
          {levels.length ? (
            <ActionMenu
              accessibilityLabel="More"
              actions={[{
                key: 'chart',
                title: 'Triage chart',
                checked: showChart,
                onSelect: () => setShowChart(shown => !shown),
              }]}
            />
          ) : null}
        </View>
      }
    >
      {search}
      <SectionList
        style={styles.container}
        sections={sections}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
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
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            {section.key === 'closed' && !trimmed ? (
              // Closed incidents fold away; a search shows every match.
              <GroupToggle
                label={section.title}
                count={section.count}
                open={!section.collapsed}
                onToggle={() => setShowClosed(shown => !shown)}
              />
            ) : (
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {section.title} · {section.count}
              </Text>
            )}
          </View>
        )}
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
    </Screen>
  );
}

const makeStyles = (theme: Theme) => {
  const { tokens: t, type, spacing, radii } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    list: { paddingHorizontal: spacing.lg, width: '100%', maxWidth: 620, alignSelf: 'center' },
    search: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, width: '100%', maxWidth: 620, alignSelf: 'center' },
    chart: { marginBottom: spacing.sm },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      marginTop: spacing.sm,
    },
    sectionTitle: { ...type.label, color: t.text },
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
