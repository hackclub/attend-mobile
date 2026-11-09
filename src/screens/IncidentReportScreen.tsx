import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { eventHomeState } from '../navigation/routes';
import { resetRoot } from '../navigation/rootNavigation';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  Button,
  CheckboxRow,
  ErrorView,
  Field,
  LevelChart,
  LoadingView,
  Notice,
  Section,
  SelectField,
  TextField,
} from '../components/forms';
import { Button as KitButton, Container, Icon, Screen, pressedStyle } from '../components/ui';
import { useTheme, useThemedStyles, type Theme, type ThemeColors } from '../theme';
import type { IncidentReportOptions, ReportAttachment, AppStackParamList } from '../types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'IncidentReport'>;

const TITLE = 'Report an incident';

const SUPPORT_EMAIL = 'attend@hackclub.com';
const CONTACT_EMAIL = 'deven@hackclub.com';

/**
 * The confidential report to Hack Club HQ (attend.hackclub.com/incident), for
 * anyone signed in: participants, parents, volunteers and staff.
 */
export function IncidentReportScreen() {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const { state, selectEvent } = useApp();

  const [options, setOptions] = useState<IncidentReportOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [eventChoice, setEventChoice] = useState('');
  const [incidentType, setIncidentType] = useState('');
  const [emergencyServices, setEmergencyServices] = useState(false);
  const [priority, setPriority] = useState('');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [attachments, setAttachments] = useState<ReportAttachment[]>([]);

  const load = useCallback(async () => {
    try {
      const opts = await api.getIncidentReportOptions();
      setOptions(opts);
      setName(n => n || opts.prefill.reporter_name || '');
      setEmail(e => e || opts.prefill.reporter_email || '');
      setPhone(p => p || opts.prefill.reporter_phone || '');
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const eventOptions = useMemo(
    () => [...(options?.events ?? []), ...(options?.custom_events ?? [])],
    [options]
  );
  // Emergency priority is only offered for current or recent events.
  const emergencyAllowed = eventOptions.find(e => e.value === eventChoice)?.emergency_allowed ?? true;
  const medical = incidentType === 'medical_emergency';
  const forced = medical && emergencyServices && emergencyAllowed;
  const emergencyLevel = options?.emergency_level ?? 's0';

  // The web form's rules: S0 is disabled for old events, falls back to S2,
  // and is forced (and locked) when emergency services have been called.
  useEffect(() => {
    if (!options) return;
    if (forced) setPriority(emergencyLevel);
    else if (!emergencyAllowed && priority === emergencyLevel) setPriority(options.default_level);
  }, [forced, emergencyAllowed, priority, emergencyLevel, options]);

  useEffect(() => {
    if (!medical) setEmergencyServices(false);
  }, [medical]);

  if (loadError || !options) {
    return (
      <Screen title={TITLE} scroll={false}>
        {loadError ? <ErrorView message={loadError} onRetry={load} /> : <LoadingView />}
      </Screen>
    );
  }

  const addFiles = (files: ReportAttachment[]) => {
    const tooBig = files.find(f => f.size != null && f.size > options.max_attachment_bytes);
    if (tooBig) {
      Alert.alert(`"${tooBig.name}" is larger than 25MB. Please attach a smaller file.`);
      return;
    }
    const next = [...attachments, ...files];
    if (next.length > options.max_attachment_count) {
      Alert.alert(`Please attach at most ${options.max_attachment_count} files.`);
      return;
    }
    setAttachments(next);
  };

  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (result.canceled) return;
    addFiles(
      result.assets.map((asset, i) => ({
        uri: asset.uri,
        name: asset.fileName || `photo-${Date.now()}-${i}.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
        mimeType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        size: asset.fileSize,
      }))
    );
  };

  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    addFiles(
      result.assets.map(asset => ({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || 'application/octet-stream',
        size: asset.size,
      }))
    );
  };

  const submit = async () => {
    const problems: string[] = [];
    if (!name.trim()) problems.push('Your name is required.');
    if (!email.trim()) problems.push('Your email is required.');
    if (!phone.trim()) problems.push('Your phone number is required.');
    if (!role) problems.push('Select what best describes you.');
    if (!eventChoice) problems.push('Please choose an event.');
    if (!incidentType) problems.push('Select the incident type.');
    if (!priority) problems.push('Select how urgent it is.');
    if (!summary.trim()) problems.push('Describe the incident in one line.');
    if (!details.trim()) problems.push('Add some notes about what happened.');
    if (problems.length) {
      setErrors(problems);
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      await api.submitIncidentReport({
        reporter_name: name.trim(),
        reporter_email: email.trim(),
        reporter_phone: phone.trim(),
        reporter_role: role,
        incident_type: incidentType,
        emergency_services_called: medical && emergencyServices,
        priority,
        summary: summary.trim(),
        details: details.trim(),
        event_choice: eventChoice,
        attachments,
      });
      setSubmitted(true);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Your report could not be sent. Please try again.']);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setRole('');
    setEventChoice('');
    setIncidentType('');
    setEmergencyServices(false);
    setPriority('');
    setSummary('');
    setDetails('');
    setAttachments([]);
    setSubmitted(false);
  };

  // An organizer is better served by their event's incident log, which can
  // escalate to HQ with the same people notified.
  const openEventLog = async (eventId: string) => {
    const target = state.events.find(e => e.id === eventId);
    if (!target) return;
    await selectEvent(target);
    // In the Overview's stack the form takes this screen's place; from the
    // attendee stack it opens on the Overview, under the event tabs.
    if (navigation.getState().routeNames.includes('IncidentForm')) {
      navigation.replace('IncidentForm', {});
    } else {
      resetRoot(navigation, eventHomeState('IncidentForm', {}));
    }
  };

  if (submitted) {
    return (
      <Screen title={TITLE}>
        <View style={styles.thanks}>
          <View style={styles.thanksIcon}>
            <Icon name="check" size={30} color={tokens.success} />
          </View>
          <Text style={styles.thanksTitle}>Thank you — your report has been received.</Text>
          <Text style={styles.thanksText}>
            Your report is confidential and has been sent directly to Hack Club HQ. Our average response time is 4–5 hours.
          </Text>
          <Text style={styles.thanksText}>
            If you need to add anything or have questions, email{' '}
            <Text style={styles.link} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>{CONTACT_EMAIL}</Text>.
          </Text>
          <Button title="File another report" variant="link" onPress={reset} />
        </View>
      </Screen>
    );
  }

  const levelOptions = options.levels.map(l => ({ value: l.value, label: l.label }));
  const linkableOrganizerEvents = options.organizer_events.filter(e => state.events.some(se => se.id === e.id));

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title={TITLE} scrollViewProps={{ keyboardShouldPersistTaps: 'handled' }}>
        {/* The form's sections and notices carry their own inset and spacing. */}
        <View style={styles.sections}>
          <View style={styles.intro}>
            <Text style={styles.response}>Average response time: 4–5 hours</Text>
          </View>

          <Notice tone="info">
            <Text style={styles.noticeText}>
              This form is for Hack Club event staff, volunteers, organizers, mentors, parents, attendees, and anyone
              else to file incident reports directly to Hack Club HQ. This data is <Text style={styles.bold}>100% confidential</Text> and
              is not accessible to other Hack Club staff members. Please file your report freely and candidly — we
              assure you that we will fully and thoroughly investigate the incident.
            </Text>
            <Text style={[styles.noticeText, styles.emergency]}>
              For medical emergencies, call 911 (or your local emergency number) and get the affected person the help
              they need before filling out this form.
            </Text>
            <Text style={styles.noticeText}>
              If you have any questions, please reach out directly to{' '}
              <Text style={styles.link} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>{CONTACT_EMAIL}</Text>.
            </Text>
          </Notice>

          <Notice tone="warning">
            <Text style={styles.noticeText}>
              <Text style={styles.bold}>This form is not for support tickets.</Text> If you need help with registration,
              travel, waivers, or anything else about your event, please email our support team instead — reports filed
              here go to our incident response team.
            </Text>
            <Button
              title="Get Support →"
              variant="link"
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Support request')}`)}
            />
          </Notice>

          {linkableOrganizerEvents.length ? (
            <Notice tone="info">
              <Text style={[styles.noticeText, styles.bold]}>Organizing one of these events?</Text>
              <Text style={styles.noticeText}>
                Your event’s Incidents page keeps a record for your team and can escalate to HQ from there, with the
                same people notified:
              </Text>
              {linkableOrganizerEvents.map(e => (
                <Text key={e.id} style={[styles.noticeText, styles.link]} onPress={() => openEventLog(e.id)}>
                  Log an incident for {e.name}
                </Text>
              ))}
              <Text style={styles.muted}>Reporting as a participant or parent? Carry on below.</Text>
            </Notice>
          ) : null}

          <Section title="About you">
            <Field label="What is your full name?">
              <TextField value={name} onChangeText={setName} textContentType="name" />
            </Field>
            <Field label="What is your email?">
              <TextField value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" />
            </Field>
            <Field
              label="What is your phone number?"
              description="We'll only use this if we need more information, and to send you SMS updates on your case if needed. Include the country code."
            >
              <TextField value={phone} onChangeText={setPhone} keyboardType="phone-pad" textContentType="telephoneNumber" />
            </Field>
            <Field label="What best describes you?">
              <SelectField title="What best describes you?" value={role} options={options.roles} onChange={setRole} placeholder="Select one" />
            </Field>
          </Section>

          <Section title="The incident">
            <Field label="Event name">
              <SelectField title="Event" value={eventChoice} options={eventOptions} onChange={setEventChoice} placeholder="Select the event" />
            </Field>
            <Field label="Incident type">
              <SelectField
                title="Incident type"
                value={incidentType}
                options={options.incident_types}
                onChange={setIncidentType}
                placeholder="Select one"
              />
            </Field>
            {medical ? (
              <CheckboxRow
                label="Emergency services (e.g. 911) have already been called for this incident."
                checked={emergencyServices}
                onChange={setEmergencyServices}
              />
            ) : null}
            <Field
              label="How urgent is it?"
              description="S0 is for something happening right now and rings our personal phones, so please use it only if needed. S3 is for something to follow up after the event."
            >
              <SelectField
                title="How urgent is it?"
                value={priority}
                options={levelOptions}
                onChange={setPriority}
                placeholder="Select one"
                disabled={forced}
                isOptionDisabled={o => o.value === emergencyLevel && !emergencyAllowed}
              />
              {forced ? (
                <Text style={styles.hint}>Set to S0 because emergency services have been called.</Text>
              ) : null}
            </Field>
            <KitButton
              title={showChart ? 'Hide the triage chart' : 'Which level? The triage chart'}
              variant="link"
              icon={showChart ? 'chevron-up' : 'chevron-down'}
              iconPosition="end"
              onPress={() => setShowChart(v => !v)}
              style={styles.chartToggle}
            />
            {showChart ? (
              <Container>
                <LevelChart levels={options.levels} />
              </Container>
            ) : null}
            <Field label="Describe the incident in one line">
              <TextField value={summary} onChangeText={setSummary} />
            </Field>
            <Field label="Please add additional notes — be as thorough as you can!">
              <TextField value={details} onChangeText={setDetails} multiline style={styles.details} />
            </Field>
          </Section>

          <Section
            title="Attachments"
            description={`If any. Up to ${options.max_attachment_count} files, 25MB each.`}
          >
            {attachments.map((file, i) => (
              <View key={`${file.uri}-${i}`} style={styles.file}>
                <Ionicons name={file.mimeType.startsWith('image/') ? 'image-outline' : 'document-outline'} size={18} color={tokens.text2} />
                <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                <Pressable
                  onPress={() => setAttachments(list => list.filter((_, j) => j !== i))}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${file.name}`}
                  style={({ pressed }) => pressedStyle(pressed)}
                >
                  <Icon name="x-circle" size={20} color={tokens.muted} />
                </Pressable>
              </View>
            ))}
            <View style={styles.pickers}>
              <Button title="Add photos" icon="images-outline" onPress={pickPhotos} />
              <Button title="Add files" icon="attach" onPress={pickFiles} />
            </View>
          </Section>

          {errors.length ? (
            <Notice tone="error">
              <Text style={[styles.noticeText, styles.bold]}>Please fix the following:</Text>
              {errors.map(message => (
                <Text key={message} style={[styles.noticeText, styles.errorText]}>{message}</Text>
              ))}
            </Notice>
          ) : null}

          <View style={styles.actions}>
            <Button title="Submit report" variant="primary" onPress={submit} loading={submitting} />
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (_colors: ThemeColors, theme: Theme) => {
  const { tokens: t, type, spacing, radii } = theme;
  return StyleSheet.create({
    flex: { flex: 1 },
    sections: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg },
    intro: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
    response: { ...type.label, color: t.success },
    noticeText: { ...type.body, color: t.text, marginBottom: 6 },
    emergency: { fontWeight: '700', color: t.error },
    errorText: { color: t.error },
    bold: { fontWeight: '700', color: t.textH },
    muted: { ...type.body, color: t.muted },
    link: { color: t.accent, fontWeight: '700' },
    hint: { ...type.body, color: t.error },
    chartToggle: { alignSelf: 'flex-start', paddingHorizontal: 0 },
    details: { minHeight: 160 },
    file: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radii.item,
      backgroundColor: t.shaded,
    },
    fileName: { ...type.body, flex: 1, color: t.text },
    pickers: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    actions: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
    thanks: { alignItems: 'center', paddingHorizontal: spacing.sm, paddingTop: spacing.xxl, gap: spacing.md },
    thanksIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.successBg,
    },
    thanksTitle: { ...type.h2, color: t.textH, textAlign: 'center' },
    thanksText: { ...type.body, fontSize: 15, lineHeight: 21, color: t.text2, textAlign: 'center' },
  });
};
