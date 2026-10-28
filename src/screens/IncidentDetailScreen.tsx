import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  Badge,
  Button,
  CheckboxRow,
  ErrorView,
  Field,
  KeyValue,
  LevelBadge,
  LoadingView,
  Notice,
  Section,
  SelectField,
  StatusPill,
  TextField,
  formatDateTime,
} from '../components/forms';
import { INCIDENT_CATEGORY_COLORS, INCIDENT_STATUS_TONES, humanize } from '../services/statusDisplay';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { Incident, IncidentFormOptions, IncidentStatus, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'IncidentDetail'>;
type Route = RouteProp<RootStackParamList, 'IncidentDetail'>;

export function IncidentDetailScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const { incidentId } = useRoute<Route>().params;
  const { state } = useApp();
  const event = state.currentEvent;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [options, setOptions] = useState<IncidentFormOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [comment, setComment] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const [escalateOpen, setEscalateOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [emergency, setEmergency] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const load = useCallback(async () => {
    if (!event) return;
    try {
      setIncident(await api.getIncident(event.id, incidentId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, [event, incidentId]);

  // The pick lists and the scale only need loading once.
  useEffect(() => {
    if (!event) return;
    api
      .getIncidentFormOptions(event.id)
      .then(opts => {
        setOptions(opts);
        setPhone(opts.reporter_phone ?? '');
      })
      .catch(() => {});
  }, [event]);

  // Refetch on focus so an edit made on the form shows on the way back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Incident details',
      headerRight: incident?.permissions.update
        ? () => (
            <TouchableOpacity onPress={() => navigation.navigate('IncidentForm', { incidentId })} hitSlop={8}>
              <Text style={[styles.headerAction, { color: colors.text.accent }]}>Edit</Text>
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [navigation, incident, incidentId, colors, styles]);

  const level = useMemo(
    () => options?.levels.find(l => l.value === incident?.severity) ?? null,
    [options, incident]
  );

  if (!event) return <ErrorView message="Pick an event on the Events tab first." />;
  if (error && !incident) return <ErrorView message={error} onRetry={load} />;
  if (!incident) return <LoadingView />;

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const postComment = async () => {
    if (!comment.trim()) {
      setCommentError('Comment is required.');
      return;
    }
    setPosting(true);
    setCommentError(null);
    try {
      await api.createIncidentComment(event.id, incident.id, comment.trim(), (newStatus || null) as IncidentStatus | null);
      setComment('');
      setNewStatus('');
      await load();
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : 'Failed to add comment.');
    } finally {
      setPosting(false);
    }
  };

  const escalateNow = () => {
    if (!phone.trim()) {
      Alert.alert('Add a number HQ can call you on.');
      return;
    }
    const line = incident.severity === options?.emergency_level
      ? "S0 pages Hack Club HQ's safeguarding team by phone right now. Continue?"
      : "This files a confidential report with Hack Club HQ's safeguarding team. Continue?";
    Alert.alert('Escalate to Hack Club HQ', line, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Escalate',
        style: 'destructive',
        onPress: async () => {
          setEscalating(true);
          try {
            const result = await api.escalateIncident(event.id, incident.id, {
              reporter_phone: phone.trim(),
              emergency_services_called: emergency,
            });
            setIncident(result.record);
            setEscalateOpen(false);
            if (result.notice) Alert.alert(result.notice);
          } catch (e) {
            Alert.alert("Couldn't escalate", e instanceof Error ? e.message : 'Please try again.');
          } finally {
            setEscalating(false);
          }
        },
      },
    ]);
  };

  const people = (list: { id: string; name: string }[], empty: string) =>
    list.length ? (
      <View style={styles.people}>
        {list.map(person => (
          <Text key={person.id} style={styles.value}>{person.name}</Text>
        ))}
      </View>
    ) : (
      <Text style={styles.muted}>{empty}</Text>
    );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.text.accent} />}
      >
        <View style={styles.badges}>
          <Badge label={humanize(incident.category)} color={INCIDENT_CATEGORY_COLORS[incident.category]} />
          <LevelBadge level={level} code={incident.severity} full />
          <StatusPill tone={INCIDENT_STATUS_TONES[incident.status] ?? 'info'} label={humanize(incident.status)} />
        </View>

        {incident.hq_report ? (
          <Notice tone="info">
            <Text style={styles.noticeText}>
              <Text style={styles.bold}>Escalated to Hack Club HQ</Text> {formatDateTime(incident.hq_report.created_at)}.
            </Text>
            <View style={styles.inline}>
              <Text style={styles.noticeText}>HQ status:</Text>
              <StatusPill tone={INCIDENT_STATUS_TONES[incident.hq_report.status] ?? 'info'} label={humanize(incident.hq_report.status)} />
            </View>
          </Notice>
        ) : incident.permissions.escalate ? (
          <Section
            title="Escalate to Hack Club HQ"
            description="Files a confidential report with HQ's safeguarding team. They see this incident's summary, details and actions taken."
            right={escalateOpen ? undefined : <Button title="Escalate…" onPress={() => setEscalateOpen(true)} />}
          >
            {escalateOpen ? (
              <>
                <Field label="Number HQ can call you on" description="Include the country code, for example +1 555 555 0100.">
                  <TextField value={phone} onChangeText={setPhone} keyboardType="phone-pad" textContentType="telephoneNumber" />
                </Field>
                <Text style={styles.muted}>
                  HQ responds at the incident’s level: S0 pages the safeguarding team’s phones within minutes, S1 within
                  the hour, S2 within 12 hours.
                </Text>
                <CheckboxRow
                  label="Emergency services (police, ambulance) have been called"
                  checked={emergency}
                  onChange={setEmergency}
                />
                <View style={styles.actions}>
                  <Button title="Cancel" variant="link" onPress={() => setEscalateOpen(false)} />
                  <Button title="Escalate to HQ" variant="primary" onPress={escalateNow} loading={escalating} />
                </View>
              </>
            ) : null}
          </Section>
        ) : null}

        <Section title="Overview">
          <KeyValue label="Reported by">{incident.reported_by?.name ?? 'Unknown'}</KeyValue>
          <KeyValue label="Occurred">{formatDateTime(incident.occurred_at) || 'Not specified'}</KeyValue>
          <KeyValue label="Location">{incident.location || 'Not specified'}</KeyValue>
          <KeyValue label="Participants involved">{people(incident.participants, 'No participants linked')}</KeyValue>
          <KeyValue label="Staff who helped">{people(incident.helping_staff, 'No staff recorded')}</KeyValue>
          <KeyValue label="Visible to">
            <View style={styles.tokens}>
              {incident.visible_to_roles.map(role => (
                <Badge key={role} label={humanize(role)} />
              ))}
            </View>
          </KeyValue>
        </Section>

        <Section title="Report">
          <KeyValue label="Summary">{incident.summary || 'No summary provided'}</KeyValue>
          <KeyValue label="Details">{incident.details || 'No details provided'}</KeyValue>
          {incident.permissions.view_casework ? (
            <KeyValue label="Actions taken">{incident.actions_taken || 'No actions recorded yet'}</KeyValue>
          ) : null}
        </Section>

        {incident.category === 'medical' ? (
          <Section title="Medication dispensed">
            {incident.medication_dispensed && incident.medications.length ? (
              incident.medications.map((m, i) => (
                <View key={m.id ?? i} style={[styles.medication, i > 0 && styles.divider]}>
                  <Text style={styles.bold}>{m.name}</Text>
                  <Text style={styles.value}>{m.dose}</Text>
                  {m.notes ? <Text style={styles.muted}>{m.notes}</Text> : null}
                </View>
              ))
            ) : (
              <Text style={styles.muted}>None</Text>
            )}
          </Section>
        ) : null}

        {incident.permissions.comment ? (
          <Section title="Add comment">
            {!incident.permissions.view_casework ? (
              <Text style={styles.muted}>
                You can add to the report you filed. The team handling it works the incident separately.
              </Text>
            ) : null}
            <Field label="Comment" description="A comment or note about this incident." error={commentError}>
              <TextField value={comment} onChangeText={setComment} multiline />
            </Field>
            {incident.permissions.change_status && options ? (
              <Field label="Change status to" optional>
                <SelectField
                  title="Change status to"
                  value={newStatus}
                  options={[{ value: '', label: 'No change' }, ...options.statuses]}
                  onChange={setNewStatus}
                />
              </Field>
            ) : null}
            <View style={styles.actions}>
              <Button title="Add comment" variant="primary" onPress={postComment} loading={posting} />
            </View>
          </Section>
        ) : null}

        {incident.permissions.view_casework ? (
          <Section title="Timeline">
            {incident.timeline.map(item => (
              <View key={`${item.type}-${item.id}`} style={styles.step}>
                <Ionicons
                  name={item.type === 'comment' ? 'chatbubble-ellipses' : item.action === 'created' ? 'checkmark-circle' : 'create'}
                  size={18}
                  color={
                    item.type === 'comment' && item.new_status
                      ? colors.status[toneColor(INCIDENT_STATUS_TONES[item.new_status])]
                      : item.type === 'change' && item.action === 'created'
                        ? colors.status.success
                        : colors.gray[500]
                  }
                />
                <View style={styles.flex}>
                  {item.type === 'comment' ? (
                    <>
                      <Text style={styles.value}>
                        <Text style={styles.bold}>{item.author_name ?? 'Someone'}</Text>
                        {item.slack_url ? (
                          <Text style={styles.link} onPress={() => Linking.openURL(item.slack_url!).catch(() => {})}> commented</Text>
                        ) : (
                          ' commented'
                        )}
                        {item.new_status ? (
                          <>
                            {' and changed status to '}
                            <Text style={styles.bold}>{humanize(item.new_status)}</Text>
                          </>
                        ) : null}
                      </Text>
                      <Text style={styles.muted}>{formatDateTime(item.created_at)}</Text>
                      <View style={styles.commentBody}>
                        <Text style={styles.value}>{item.body}</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.value}>
                        <Text style={styles.bold}>{item.actor_name}</Text> {item.action} the incident
                        {item.fields.length ? <Text style={styles.muted}> ({item.fields.join(', ')})</Text> : null}
                      </Text>
                      <Text style={styles.muted}>{formatDateTime(item.created_at)}</Text>
                    </>
                  )}
                </View>
              </View>
            ))}
          </Section>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function toneColor(tone?: string): 'success' | 'warning' | 'error' | 'info' {
  if (tone === 'success' || tone === 'warning' || tone === 'error') return tone;
  return 'info';
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },
  headerAction: { fontSize: 17, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  noticeText: { fontSize: 14, color: colors.gray[800] },
  bold: { fontWeight: '700', color: colors.gray[900] },
  value: { fontSize: 15, color: colors.gray[900], lineHeight: 21 },
  muted: { fontSize: 13, color: colors.gray[600] },
  link: { color: colors.text.accent },
  people: { gap: 2 },
  tokens: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  medication: { gap: 2, paddingTop: 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  step: { flexDirection: 'row', gap: 10 },
  commentBody: { marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: colors.gray[100] },
});
