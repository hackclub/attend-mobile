import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { SearchField, makeCardSurface } from '../components/ui';
import {
  Badge,
  Button,
  EmptyState,
  ErrorView,
  LevelBadge,
  LevelChart,
  LoadingView,
  StatusPill,
  formatDateTime,
} from '../components/forms';
import { INCIDENT_CATEGORY_COLORS, INCIDENT_STATUS_TONES, humanize } from '../services/statusDisplay';
import { useTheme, useThemedStyles, type Theme, type ThemeColors } from '../theme';
import type { IncidentLevel, IncidentSummary, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'IncidentList'>;

export function IncidentListScreen() {
  const { colors } = useTheme();
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('IncidentForm', {})}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="New incident"
        >
          <Ionicons name="add-circle" size={28} color={colors.text.accent} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors]);

  const levelsByKey = useMemo(() => Object.fromEntries(levels.map(l => [l.value, l])), [levels]);

  // The web list filters on category, level, status, names and reporter.
  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
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
  }, [incidents, query]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!event) return <EmptyState title="No event selected" message="Pick an event on the Events tab first." />;
  if (error && !incidents) return <ErrorView message={error} onRetry={load} />;
  if (!incidents) return <LoadingView />;

  const header = (
    <View style={styles.header}>
      <Text style={styles.description}>
        Private to your event team. Turn on “Escalate to Hack Club HQ” on a new incident, or escalate an
        existing one from its page, to involve HQ’s safeguarding team.
      </Text>
      {levels.length ? (
        <TouchableOpacity onPress={() => setShowChart(v => !v)} style={styles.chartToggle}>
          <Text style={styles.link}>{showChart ? 'Hide the triage chart' : 'Which level? The triage chart'}</Text>
          <Ionicons name={showChart ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.accent} />
        </TouchableOpacity>
      ) : null}
      {showChart ? (
        <View style={styles.chartCard}>
          <LevelChart levels={levels} />
        </View>
      ) : null}
      {incidents.length ? (
        <View style={styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Find incidents" />
        </View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      data={visible}
      keyExtractor={item => item.id}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.text.accent} />}
      renderItem={({ item }) => {
        const names = item.participant_names;
        return (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.75}
            onPress={() => navigation.navigate('IncidentDetail', { incidentId: item.id })}
          >
            <View style={styles.row}>
              <Badge label={humanize(item.category)} color={INCIDENT_CATEGORY_COLORS[item.category]} />
              <LevelBadge level={levelsByKey[item.severity]} code={item.severity} />
              <View style={styles.flex} />
              <StatusPill tone={INCIDENT_STATUS_TONES[item.status] ?? 'info'} label={humanize(item.status)} />
            </View>
            {item.summary ? <Text style={styles.summary} numberOfLines={2}>{item.summary}</Text> : null}
            <Text style={styles.meta}>
              {formatDateTime(item.occurred_at || item.created_at)}
              {item.reported_by ? ` · ${item.reported_by.name}` : ''}
            </Text>
            {names.length ? (
              <Text style={styles.meta} numberOfLines={1}>
                {names[0]}
                {names.length > 1 ? ` (+${names.length - 1} more)` : ''}
              </Text>
            ) : null}
            {item.hq_report ? (
              <View style={styles.hqRow}>
                <Text style={styles.metaStrong}>HQ</Text>
                <StatusPill
                  tone={INCIDENT_STATUS_TONES[item.hq_report.status] ?? 'info'}
                  label={humanize(item.hq_report.status)}
                />
              </View>
            ) : null}
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        incidents.length ? (
          <EmptyState title={`No incidents match “${query.trim()}”`} />
        ) : (
          <EmptyState
            title="No incidents"
            message="No incidents reported for this event."
            action={<Button title="New incident" onPress={() => navigation.navigate('IncidentForm', {})} />}
          />
        )
      }
    />
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: 32 },
  flex: { flex: 1 },
  header: { paddingTop: 8, gap: 10 },
  description: { fontSize: 14, color: colors.gray[600], paddingHorizontal: 16, lineHeight: 20 },
  chartToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16 },
  link: { fontSize: 14, fontWeight: '600', color: colors.text.accent },
  chartCard: { ...makeCardSurface(colors, theme), marginHorizontal: 16, padding: 12 },
  search: { marginBottom: 4 },
  card: { ...makeCardSurface(colors, theme), marginHorizontal: 16, marginTop: 10, padding: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summary: { fontSize: 15, fontWeight: '600', color: colors.gray[900] },
  meta: { fontSize: 13, color: colors.gray[600] },
  metaStrong: { fontSize: 13, fontWeight: '700', color: colors.gray[700] },
  hqRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
