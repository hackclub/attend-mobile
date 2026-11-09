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
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { BiometricGate } from '../components/BiometricGate';
import { api } from '../services/api';
import {
  Badge,
  Button,
  Container,
  KeyValue,
  StatusGlyph,
  StatusIndicator,
  statusColor,
} from '../components/ui';
import {
  CheckboxRow,
  ErrorView,
  Field,
  LevelBadge,
  LoadingView,
  SelectField,
  TextField,
  formatDateTime,
  statusType,
} from '../components/forms';
import { INCIDENT_STATUS_TONES, humanize } from '../services/statusDisplay';
import { useTheme, useThemedStyles, type Theme, type ThemeColors } from '../theme';
import type { Incident, IncidentFormOptions, IncidentStatus, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'IncidentDetail'>;
type Route = RouteProp<RootStackParamList, 'IncidentDetail'>;

export function IncidentDetailScreen() {
  const { tokens } = useTheme();
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
            <Button title="Edit" variant="link" onPress={() => navigation.navigate('IncidentForm', { incidentId })} />
          )
        : undefined,
    });
  }, [navigation, incident, incidentId]);

  const level = useMemo(
    () => options?.levels.find(l => l.value === incident?.severity) ?? null,
    [options, incident]
  );

  if (!event) return <ErrorView message="Pick an event on the Overview tab first." />;
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
    list.length ? list.map(person => person.name).join(', ') : <Text style={styles.muted}>{empty}</Text>;

  const statusTone = INCIDENT_STATUS_TONES[incident.status] ?? 'info';
  const meta = [formatDateTime(incident.occurred_at), incident.location].filter(Boolean).join(' · ');

  const commentForm = (
    <View style={styles.form}>
      {!incident.permissions.view_casework ? (
        <Text style={styles.muted}>
          You can add to the report you filed. The team handling it works the incident separately.
        </Text>
      ) : null}
      <Field label="Comment" description="A comment or note about this incident." error={commentError}>
        <TextField value={comment} onChangeText={setComment} multiline accessibilityLabel="Comment" />
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
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressBackgroundColor={tokens.bg}
          />
        }
      >
        <View style={styles.intro}>
          <View style={styles.badges}>
            <Badge label={humanize(incident.category)} />
            <LevelBadge level={level} code={incident.severity} name />
            <StatusIndicator type={statusType(statusTone)} label={humanize(incident.status)} style={styles.status} />
          </View>
          <Text style={[styles.title, !incident.summary && styles.titleEmpty]} accessibilityRole="header">
            {incident.summary || 'No summary provided'}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>

        {incident.hq_report ? (
          <View style={styles.hqBox}>
            <View style={styles.hqIcon}>
              <StatusGlyph type="info" color={tokens.info} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.hqTitle}>
                Escalated to Hack Club HQ · {formatDateTime(incident.hq_report.created_at)}
              </Text>
              <Text style={styles.hqStatus}>HQ status: {humanize(incident.hq_report.status)}</Text>
            </View>
          </View>
        ) : incident.permissions.escalate ? (
          <Container
            title="Escalate to Hack Club HQ"
            description="Files a confidential report with HQ's safeguarding team. They see this incident's summary, details and actions taken."
            bodyStyle={styles.containerBody}
          >
            {escalateOpen ? (
              <>
                <Field label="Number HQ can call you on" description="Include the country code, for example +1 555 555 0100.">
                  <TextField
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    accessibilityLabel="Number HQ can call you on"
                  />
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
                  <Button title="Escalate to HQ" variant="primary" onPress={escalateNow} loading={escalating} />
                  <Button title="Cancel" variant="link" onPress={() => setEscalateOpen(false)} />
                </View>
              </>
            ) : (
              <View style={styles.actions}>
                <Button title="Escalate…" onPress={() => setEscalateOpen(true)} />
              </View>
            )}
          </Container>
        ) : null}

        <Container title="Details" bodyStyle={styles.containerBody}>
          <KeyValue label="Details" value={incident.details || 'No details provided'} layout="stacked" />
          {incident.permissions.view_casework ? (
            <KeyValue label="Actions taken" value={incident.actions_taken || 'No actions recorded yet'} layout="stacked" />
          ) : null}
        </Container>

        <Container bodyStyle={styles.kvBody}>
          <KeyValue label="Reported by" value={incident.reported_by?.name ?? 'Unknown'} labelWidth={120} />
          <KeyValue label="Participants involved" value={people(incident.participants, 'No participants linked')} labelWidth={120} />
          <KeyValue label="Staff who helped" value={people(incident.helping_staff, 'No staff recorded')} labelWidth={120} />
          <KeyValue
            label="Visible to"
            labelWidth={120}
            value={
              <View style={styles.tokens}>
                {incident.visible_to_roles.map(role => (
                  <Badge key={role} label={humanize(role)} />
                ))}
              </View>
            }
          />
        </Container>

        {incident.category === 'medical' ? (
          <Container title="Medication dispensed" bodyStyle={styles.containerBody}>
            {incident.medication_dispensed && incident.medications.length ? (
              // Medication, dose and notes are a participant's health data:
              // they sit behind the same unlock as participant details. The
              // rest of the incident stays readable.
              <BiometricGate reason="Authenticate to view medication details">
                {incident.medications.map((m, i) => (
                  <View key={m.id ?? i} style={[styles.medication, i > 0 && styles.divider]}>
                    <Text style={styles.bold}>{m.name}</Text>
                    <Text style={styles.value}>{m.dose}</Text>
                    {m.notes ? <Text style={styles.muted}>{m.notes}</Text> : null}
                  </View>
                ))}
              </BiometricGate>
            ) : (
              <Text style={styles.muted}>None</Text>
            )}
          </Container>
        ) : null}

        {incident.permissions.view_casework ? (
          <Container title="Timeline" bodyStyle={styles.containerBody}>
            {incident.timeline.map(item => {
              const dot =
                item.type === 'comment' && item.new_status
                  ? statusColor(statusType(INCIDENT_STATUS_TONES[item.new_status] ?? 'info'), tokens)
                  : item.type === 'change' && item.action === 'created'
                    ? tokens.success
                    : tokens.div;
              return (
                <View key={`${item.type}-${item.id}`} style={styles.step}>
                  <View style={[styles.dot, { backgroundColor: dot }]} />
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
              );
            })}
            {incident.permissions.comment ? commentForm : null}
          </Container>
        ) : incident.permissions.comment ? (
          <Container title="Add comment" bodyStyle={styles.containerBody}>
            {commentForm}
          </Container>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (_colors: ThemeColors, theme: Theme) => {
  const { tokens: t, type, spacing, radii } = theme;
  return StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: spacing.lg, paddingBottom: 40, gap: spacing.lg },
    intro: { gap: spacing.sm },
    badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    status: { marginLeft: spacing.xs },
    title: { ...type.h1, color: t.textH },
    titleEmpty: { color: t.muted },
    meta: { ...type.body, color: t.text2 },
    hqBox: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: t.infoBg,
      borderRadius: radii.flash,
      paddingVertical: spacing.md,
      paddingHorizontal: 14,
    },
    hqIcon: { paddingTop: 2 },
    hqTitle: { ...type.label, color: t.textH },
    hqStatus: { ...type.body, color: t.text2 },
    containerBody: { gap: spacing.md },
    kvBody: { paddingVertical: spacing.md },
    bold: { fontWeight: '700', color: t.textH },
    value: { ...type.body, color: t.text },
    muted: { ...type.body, color: t.muted },
    link: { color: t.accent, fontWeight: '700' },
    tokens: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    medication: { gap: 2, paddingTop: spacing.sm },
    divider: { borderTopWidth: 1, borderTopColor: t.div2 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
    form: { gap: spacing.md, marginTop: spacing.xs },
    step: { flexDirection: 'row', gap: 10 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
    commentBody: { marginTop: 6, padding: 10, borderRadius: radii.item, backgroundColor: t.shaded },
  });
};
