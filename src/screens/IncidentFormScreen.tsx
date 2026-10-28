import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  Button,
  CheckboxRow,
  DateTimeField,
  ErrorView,
  Field,
  LevelChart,
  LoadingView,
  MultiSelectField,
  Notice,
  Section,
  SelectField,
  SwitchRow,
  TextField,
} from '../components/forms';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type {
  IncidentFormOptions,
  IncidentInput,
  IncidentMedication,
  RootStackParamList,
} from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'IncidentForm'>;
type Route = RouteProp<RootStackParamList, 'IncidentForm'>;

type MedicationRow = IncidentMedication & { key: string; _destroy?: boolean };

let medicationKey = 0;
const blankMedication = (): MedicationRow => ({ key: `new-${medicationKey++}`, name: '', dose: '', notes: '' });

export function IncidentFormScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const incidentId = params?.incidentId;
  const editing = !!incidentId;
  const { state } = useApp();
  const event = state.currentEvent;

  const [options, setOptions] = useState<IncidentFormOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [showChart, setShowChart] = useState(false);

  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('open');
  const [occurredAt, setOccurredAt] = useState<Date | null>(null);
  const [location, setLocation] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [actionsTaken, setActionsTaken] = useState('');
  const [medicationDispensed, setMedicationDispensed] = useState(false);
  const [medications, setMedications] = useState<MedicationRow[]>([blankMedication()]);
  const [visibleRoles, setVisibleRoles] = useState<string[]>([]);
  const [escalate, setEscalate] = useState(false);
  const [reporterPhone, setReporterPhone] = useState('');
  const [emergencyServices, setEmergencyServices] = useState(false);

  const load = useCallback(async () => {
    if (!event) return;
    try {
      const [opts, incident] = await Promise.all([
        api.getIncidentFormOptions(event.id),
        incidentId ? api.getIncident(event.id, incidentId) : Promise.resolve(null),
      ]);
      setOptions(opts);
      setReporterPhone(opts.reporter_phone ?? '');
      if (incident) {
        setCategory(incident.category);
        setSeverity(incident.severity);
        setStatus(incident.status);
        setOccurredAt(incident.occurred_at ? new Date(incident.occurred_at) : null);
        setLocation(incident.location ?? '');
        setParticipantIds(incident.participants.map(p => p.id));
        setStaffIds(incident.helping_staff.map(s => s.id));
        setSummary(incident.summary ?? '');
        setDetails(incident.details ?? '');
        setActionsTaken(incident.actions_taken ?? '');
        setMedicationDispensed(incident.medication_dispensed);
        setMedications(
          incident.medications.length
            ? incident.medications.map(m => ({ ...m, notes: m.notes ?? '', key: m.id ?? `new-${medicationKey++}` }))
            : [blankMedication()]
        );
        setVisibleRoles(incident.visible_to_roles);
      } else {
        setVisibleRoles(opts.default_visible_to_roles);
      }
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, [event, incidentId]);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: editing ? 'Edit incident' : 'New incident' });
  }, [navigation, editing]);

  const medical = category === 'medical';
  const liveMedications = medications.filter(m => !m._destroy);

  const levelOptions = useMemo(
    () => (options?.levels ?? []).map(l => ({ value: l.value, label: l.label })),
    [options]
  );

  const buildInput = (): IncidentInput => ({
    category,
    severity,
    status,
    summary,
    details,
    actions_taken: actionsTaken,
    location,
    occurred_at: occurredAt ? occurredAt.toISOString() : null,
    medication_dispensed: medical && medicationDispensed,
    visible_to_roles: visibleRoles,
    participant_event_ids: participantIds,
    helping_staff_ids: staffIds,
    // Rows only count on a medical incident marked as dispensed; the server
    // drops them otherwise, as the web form's hidden rows are dropped.
    medications_attributes: medications
      .filter(m => m.id || m.name.trim() || m.dose.trim() || (m.notes ?? '').trim())
      .map(({ key: _key, ...m }) => (m._destroy ? { id: m.id, name: m.name, dose: m.dose, _destroy: true } : m)),
  });

  const submit = async () => {
    if (!event || !options) return;
    const missing: string[] = [];
    if (!category) missing.push('Category is required.');
    if (!severity) missing.push('Level is required.');
    if (escalate && !reporterPhone.trim()) missing.push('Add a number HQ can call you on.');
    if (missing.length) {
      setErrors(missing);
      return;
    }

    const save = async () => {
      setSaving(true);
      setErrors([]);
      try {
        const input = buildInput();
        const result = editing
          ? await api.updateIncident(event.id, incidentId!, input)
          : await api.createIncident(
              event.id,
              input,
              escalate ? { reporter_phone: reporterPhone.trim(), emergency_services_called: emergencyServices } : null
            );
        // Whether the HQ half went through is worth saying; a plain save isn't.
        if (!editing && escalate && result.notice) Alert.alert(result.notice);
        navigation.replace('IncidentDetail', { incidentId: result.record.id });
      } catch (e) {
        setErrors([e instanceof Error ? e.message : 'Could not save the incident.']);
      } finally {
        setSaving(false);
      }
    };

    // The web form confirms before it escalates, and an S0 says it will ring
    // HQ's phones.
    if (!editing && escalate) {
      const line = severity === options.emergency_level
        ? "S0 pages Hack Club HQ's safeguarding team by phone right now. Continue?"
        : "This files a confidential report with Hack Club HQ's safeguarding team. Continue?";
      Alert.alert('Escalate to Hack Club HQ', line, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: save },
      ]);
    } else {
      save();
    }
  };

  if (!event) return <ErrorView message="Pick an event on the Events tab first." />;
  if (loadError) return <ErrorView message={loadError} onRetry={load} />;
  if (!options) return <LoadingView />;

  const updateMedication = (key: string, patch: Partial<MedicationRow>) =>
    setMedications(rows => rows.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const removeMedication = (row: MedicationRow) =>
    setMedications(rows => {
      const next = row.id ? rows.map(r => (r.key === row.key ? { ...r, _destroy: true } : r)) : rows.filter(r => r.key !== row.key);
      return next.some(r => !r._destroy) ? next : [...next, blankMedication()];
    });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Section title="Incident details">
          <Field label="Category">
            <SelectField title="Category" value={category} options={options.categories} onChange={setCategory} placeholder="Select category" />
          </Field>
          <Field label="Level" description="S0 is the most urgent. The chart below has examples.">
            <SelectField title="Level" value={severity} options={levelOptions} onChange={setSeverity} placeholder="Select level" />
          </Field>
          <Field label="Status">
            <SelectField title="Status" value={status} options={options.statuses} onChange={setStatus} />
          </Field>
          <Field label="Date and time of incident" optional>
            <DateTimeField value={occurredAt} onChange={setOccurredAt} />
          </Field>
          <Field label="Location" optional description="For example: Main Hall, Room 204">
            <TextField value={location} onChangeText={setLocation} placeholder="Location" />
          </Field>
          <TouchableOpacity onPress={() => setShowChart(v => !v)}>
            <Text style={styles.link}>{showChart ? 'Hide the triage chart' : 'Which level? The triage chart'}</Text>
          </TouchableOpacity>
          {showChart ? <LevelChart levels={options.levels} /> : null}
        </Section>

        <Section title="People involved">
          <Field label="Participants involved" optional={medical ? 'required for medical incidents' : undefined}>
            <MultiSelectField
              title="Participants involved"
              items={options.participants.map(p => ({ id: p.id, title: p.name, subtitle: p.email }))}
              selected={participantIds}
              onChange={setParticipantIds}
              noun={['participant', 'participants']}
              searchPlaceholder="Search participants..."
            />
          </Field>
          <Field label="Staff who helped" optional={medical ? 'required for medical incidents' : undefined}>
            <MultiSelectField
              title="Staff who helped"
              items={options.staff.map(s => ({ id: s.id, title: s.name, subtitle: s.email }))}
              selected={staffIds}
              onChange={setStaffIds}
              noun={['staff member', 'staff members']}
              searchPlaceholder="Search staff..."
            />
          </Field>
        </Section>

        <Section title="What happened">
          <Field label="Summary" optional description="A brief summary of the incident.">
            <TextField value={summary} onChangeText={setSummary} />
          </Field>
          <Field label="Details" optional description="A detailed description of what happened.">
            <TextField value={details} onChangeText={setDetails} multiline />
          </Field>
          <Field label="Actions taken" optional description="What actions have been taken or are planned.">
            <TextField value={actionsTaken} onChangeText={setActionsTaken} multiline />
          </Field>
        </Section>

        {medical ? (
          <Section title="Medication">
            <CheckboxRow label="Medication was dispensed" checked={medicationDispensed} onChange={setMedicationDispensed} />
            {medicationDispensed
              ? liveMedications.map((row, i) => (
                  <View key={row.key} style={styles.medication}>
                    <View style={styles.medicationHeader}>
                      <Text style={styles.medicationTitle}>Medication {i + 1}</Text>
                      <Button title="Remove" variant="link" onPress={() => removeMedication(row)} />
                    </View>
                    <Field label="Medication">
                      <TextField value={row.name} onChangeText={name => updateMedication(row.key, { name })} />
                    </Field>
                    <Field label="Quantity / dose">
                      <TextField value={row.dose} onChangeText={dose => updateMedication(row.key, { dose })} />
                    </Field>
                    <Field label="Notes" optional>
                      <TextField value={row.notes ?? ''} onChangeText={notes => updateMedication(row.key, { notes })} multiline />
                    </Field>
                  </View>
                ))
              : null}
            {medicationDispensed ? (
              <Button title="Add another medication" icon="add" onPress={() => setMedications(rows => [...rows, blankMedication()])} />
            ) : null}
          </Section>
        ) : null}

        <Section title="Visibility" description="The roles that can view this incident.">
          {options.roles.map(role => (
            <CheckboxRow
              key={role.value}
              label={role.label}
              checked={visibleRoles.includes(role.value)}
              onChange={checked =>
                setVisibleRoles(roles => (checked ? [...roles, role.value] : roles.filter(r => r !== role.value)))
              }
            />
          ))}
        </Section>

        {!editing ? (
          <Section title="Hack Club HQ">
            <SwitchRow
              label="Escalate to Hack Club HQ"
              description="Files a confidential report with HQ's safeguarding team. They're notified by email and Slack, and an S0 rings their phones. Conduct incidents also post to the HQ Firehouse channel."
              value={escalate}
              onChange={setEscalate}
            />
            {escalate ? (
              <>
                <Field label="Number HQ can call you on" description="Include the country code, for example +1 555 555 0100.">
                  <TextField value={reporterPhone} onChangeText={setReporterPhone} keyboardType="phone-pad" textContentType="telephoneNumber" />
                </Field>
                <Text style={styles.hint}>
                  HQ responds at the incident’s level: S0 pages the safeguarding team’s phones within minutes, S1 within
                  the hour, S2 within 12 hours.
                </Text>
                <CheckboxRow
                  label="Emergency services (police, ambulance) have been called"
                  checked={emergencyServices}
                  onChange={setEmergencyServices}
                />
              </>
            ) : null}
          </Section>
        ) : null}

        {errors.length ? (
          <Notice tone="error">
            {errors.map(message => (
              <Text key={message} style={[styles.errorText, { color: colors.status.error }]}>{message}</Text>
            ))}
          </Notice>
        ) : null}

        <View style={styles.actions}>
          <Button title="Cancel" variant="link" onPress={() => navigation.goBack()} />
          <Button title={editing ? 'Update incident' : 'Create incident'} variant="primary" onPress={submit} loading={saving} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },
  link: { fontSize: 14, fontWeight: '600', color: colors.text.accent },
  hint: { fontSize: 13, color: colors.gray[600] },
  medication: {
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  medicationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  medicationTitle: { fontSize: 14, fontWeight: '700', color: colors.gray[800] },
  errorText: { fontSize: 14 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 18 },
});
