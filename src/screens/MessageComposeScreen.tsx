import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { hasUnsupportedFormatting, htmlToMarkup, markupToHtml } from '../services/richText';
import { MarkupEditor, RichText } from '../components/RichText';
import {
  Button,
  CheckboxRow,
  DateTimeField,
  ErrorView,
  Field,
  LoadingView,
  MultiSelectField,
  Notice,
  Section,
  SelectField,
  StatusPill,
  SwitchRow,
  TextField,
} from '../components/forms';
import { titleize } from '../services/statusDisplay';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { MessageFormOptions, MessageInput, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'MessageCompose'>;
type Route = RouteProp<RootStackParamList, 'MessageCompose'>;

/**
 * Step 1 of 2: write the message. Saving keeps it a draft and moves on to
 * the preview, where it is sent or scheduled, as in the web composer.
 */
export function MessageComposeScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const [messageId, setMessageId] = useState(params?.messageId);
  const { state } = useApp();
  const event = state.currentEvent;

  const [options, setOptions] = useState<MessageFormOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [simplified, setSimplified] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [audience, setAudience] = useState('confirmed_attendees');
  const [channels, setChannels] = useState<string[]>(['slack']);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!event) return;
    try {
      const [opts, message] = await Promise.all([
        api.getMessageFormOptions(event.id),
        params?.messageId ? api.getMessage(event.id, params.messageId) : Promise.resolve(null),
      ]);
      setOptions(opts);
      if (message) {
        setAudience(message.audience);
        setChannels(message.channels);
        setParticipantIds(message.participant_event_ids);
        setGroupIds(message.group_ids);
        setSubject(message.subject ?? '');
        setBody(htmlToMarkup(message.body));
        setSimplified(hasUnsupportedFormatting(message.body));
        setSchedule(!!message.scheduled_at);
        setScheduledAt(message.scheduled_at ? new Date(message.scheduled_at) : null);
      } else {
        setAudience(opts.defaults.audience);
        setChannels(opts.defaults.channels);
      }
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, [event, params]);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: 'Compose message' });
  }, [navigation]);

  const bodyHtml = useMemo(() => markupToHtml(body), [body]);

  if (!event) return <ErrorView message="Pick an event on the Events tab first." />;
  if (loadError) return <ErrorView message={loadError} onRetry={load} />;
  if (!options) return <LoadingView />;

  const toggleChannel = (value: string, on: boolean) =>
    setChannels(list => (on ? [...list, value] : list.filter(c => c !== value)));

  const next = async () => {
    const problems: string[] = [];
    if (!channels.length) problems.push('Select at least one channel.');
    if (schedule && scheduledAt && scheduledAt <= new Date()) problems.push('Enter a time in the future.');
    if (problems.length) {
      setErrors(problems);
      return;
    }

    const input: MessageInput = {
      subject,
      body: bodyHtml,
      audience,
      channels,
      participant_event_ids: audience === 'specific_participants' ? participantIds : [],
      group_ids: groupIds,
      scheduled_at: schedule && scheduledAt ? scheduledAt.toISOString() : null,
    };

    setSaving(true);
    setErrors([]);
    try {
      const saved = messageId
        ? await api.updateMessage(event.id, messageId, input)
        : await api.createMessage(event.id, input);
      setMessageId(saved.id);
      navigation.navigate('MessagePreview', { messageId: saved.id });
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Could not save the message.']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.step}>Step 1 of 2 — Write your message</Text>

        <Section title="Recipients">
          <Field label="Audience">
            <SelectField title="Audience" value={audience} options={options.audiences} onChange={setAudience} />
          </Field>

          {audience === 'specific_participants' ? (
            <Field label="Select participants">
              <MultiSelectField
                title="Select participants"
                items={options.participants.map(p => ({
                  id: p.id,
                  title: p.name,
                  subtitle: p.email,
                  trailing: (
                    <StatusPill
                      tone={p.status === 'complete' ? 'success' : ['in_progress', 'awaiting_guardian'].includes(p.status) ? 'progress' : 'pending'}
                      label={titleize(p.status)}
                    />
                  ),
                }))}
                selected={participantIds}
                onChange={setParticipantIds}
                noun={['participant', 'participants']}
                searchPlaceholder="Find participants"
              />
            </Field>
          ) : null}

          <Field label="Channels">
            {options.channels.map(channel => (
              <CheckboxRow
                key={channel.value}
                label={channel.label}
                description={channel.description}
                checked={channels.includes(channel.value)}
                disabled={channel.disabled}
                onChange={on => toggleChannel(channel.value, on)}
              />
            ))}
          </Field>

          {options.groups.length ? (
            <Field
              label="Restrict to groups"
              optional
              description='Narrows the audience to people in the groups you select. For example, "Incomplete onboarding" with Exhibitor reaches exhibitors not yet onboarded. Leave all cleared to send to the full audience.'
            >
              {options.groups.map(group => (
                <CheckboxRow
                  key={group.id}
                  label={group.name}
                  checked={groupIds.includes(group.id)}
                  onChange={on => setGroupIds(ids => (on ? [...ids, group.id] : ids.filter(id => id !== group.id)))}
                />
              ))}
            </Field>
          ) : null}
        </Section>

        <Section title="Content">
          <Field
            label="Subject"
            optional
            description="The email subject line. Slack and SMS use the event name."
          >
            <TextField value={subject} onChangeText={setSubject} placeholder="For example: Important update about your travel" />
          </Field>
          <Field
            label="Message"
            description="Use the toolbar for links, bold, italic and lists. Formatting is adapted for each channel. Required before the message can be sent."
          >
            {simplified ? (
              <Notice tone="warning">
                This message was written on the web with formatting the app can’t edit (such as underline or code
                blocks). Saving here keeps the text and simpler formatting.
              </Notice>
            ) : null}
            <MarkupEditor value={body} onChangeText={setBody} placeholder="Write your message" />
            <Button
              title={showPreview ? 'Hide formatted preview' : 'Show formatted preview'}
              variant="link"
              onPress={() => setShowPreview(v => !v)}
            />
            {showPreview ? (
              <View style={styles.preview}>
                {body.trim() ? <RichText html={bodyHtml} /> : <Text style={styles.muted}>Nothing to preview yet.</Text>}
              </View>
            ) : null}
          </Field>
        </Section>

        <Section title="Delivery">
          <SwitchRow
            label="Schedule for later"
            value={schedule}
            onChange={on => {
              setSchedule(on);
              if (on && !scheduledAt) setScheduledAt(new Date(Date.now() + 60 * 60 * 1000));
            }}
          />
          {schedule ? (
            <Field label="Send at" optional>
              <DateTimeField value={scheduledAt} onChange={setScheduledAt} minimumDate={new Date()} />
            </Field>
          ) : null}
        </Section>

        {errors.length ? (
          <Notice tone="error">
            {errors.map(message => (
              <Text key={message} style={{ color: colors.status.error }}>{message}</Text>
            ))}
          </Notice>
        ) : null}

        <View style={styles.actions}>
          <Button title="Cancel" variant="link" onPress={() => navigation.goBack()} />
          <Button title="Next: Preview →" variant="primary" onPress={next} loading={saving} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },
  step: { fontSize: 14, color: colors.gray[600], paddingHorizontal: 16, paddingTop: 8 },
  preview: { padding: 12, borderRadius: 12, backgroundColor: colors.gray[50], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200] },
  muted: { color: colors.gray[500] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 18 },
});
