import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CommonActions, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { RichText } from '../components/RichText';
import { Badge, Button, ErrorView, LoadingView, Notice, Section, StatusPill, formatDateTime } from '../components/forms';
import { useThemedStyles, type ThemeColors } from '../theme';
import type { MessagePreview, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'MessagePreview'>;
type Route = RouteProp<RootStackParamList, 'MessagePreview'>;

/** Step 2 of 2: who it reaches, how each channel renders, then send. */
export function MessagePreviewScreen() {
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const { messageId } = useRoute<Route>().params;
  const { state } = useApp();
  const event = state.currentEvent;
  const [preview, setPreview] = useState<MessagePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!event) return;
    try {
      setPreview(await api.previewMessage(event.id, messageId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, [event, messageId]);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: 'Preview & send' });
  }, [navigation]);

  if (!event) return <ErrorView message="Pick an event on the Events tab first." />;
  if (error && !preview) return <ErrorView message={error} onRetry={load} />;
  if (!preview) return <LoadingView />;

  // Out of the composer and onto the message's page: drop Compose and this
  // screen, landing on the message's page if that is what opened the
  // composer, or pushing it otherwise.
  const leaveComposer = () => {
    const navState = navigation.getState();
    const composeAt = navState.routes.map(r => r.name).lastIndexOf('MessageCompose');
    const base = navState.routes.slice(0, Math.max(composeAt, 0));
    const last = base[base.length - 1];
    const routes = last?.name === 'MessageDetail' && (last.params as { messageId?: string })?.messageId === messageId
      ? base
      : [...base, { name: 'MessageDetail' as const, params: { messageId } }];
    navigation.dispatch(CommonActions.reset({ ...navState, routes, index: routes.length - 1 } as never));
  };

  const scheduling = preview.scheduled_in_future;
  const send = () => {
    const prompt = scheduling
      ? `Schedule this message to be sent on ${formatDateTime(preview.scheduled_at)}?`
      : `Send this message to ${preview.total_count} recipients now?`;
    Alert.alert(scheduling ? 'Schedule message' : 'Send now', prompt, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: scheduling ? 'Schedule' : 'Send',
        onPress: async () => {
          setSending(true);
          try {
            const result = await api.messageAction(event.id, messageId, 'send_now');
            if (result.notice) Alert.alert(result.notice);
            leaveComposer();
          } catch (e) {
            Alert.alert('Not sent', e instanceof Error ? e.message : 'Please try again.');
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  };

  const shown = preview.recipient_names;
  const more = preview.total_count - shown.length;

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Text style={styles.step}>Step 2 of 2 — Review and send your message</Text>

      <Section title={`Audience: ${preview.audience_label}`}>
        <Text style={styles.body}>
          <Text style={styles.bold}>{preview.total_count}</Text> recipient{preview.total_count === 1 ? '' : 's'} will
          receive this message via <Text style={styles.bold}>{preview.channel_labels}</Text>.
        </Text>
        {shown.length ? (
          <View style={styles.tokens}>
            {shown.map((name, i) => (
              <Badge key={`${name}-${i}`} label={name} />
            ))}
            {more > 0 ? <Badge label={`+${more} more`} /> : null}
          </View>
        ) : (
          <Notice tone="warning">No recipients match this criteria. The message won’t be sent to anyone.</Notice>
        )}
      </Section>

      {preview.slack_text != null ? (
        <Section title="Slack preview">
          {/* A mock of Slack's own dark message view, so it keeps Slack's colours. */}
          <View style={styles.slack}>
            <View style={styles.slackAvatar}>
              <Text style={styles.slackAvatarText}>HC</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.slackName}>
                Hack Club Attend <Text style={styles.slackApp}>App</Text>
              </Text>
              <Text style={styles.slackBody}>{preview.slack_text}</Text>
            </View>
          </View>
        </Section>
      ) : null}

      {preview.email_subject != null ? (
        <Section title="Email preview" description={`Subject: ${preview.email_subject}`}>
          <RichText html={preview.body_html} />
        </Section>
      ) : null}

      {preview.sms_text != null ? (
        <Section title="SMS preview">
          <View style={styles.sms}>
            <Text style={styles.smsText}>{preview.sms_text}</Text>
          </View>
          <View style={styles.smsMeta}>
            <Text style={styles.muted}>{preview.sms_length} characters</Text>
            {preview.sms_length > 160 ? <StatusPill tone="warning" label={`(~${preview.sms_segments} segments)`} /> : null}
          </View>
        </Section>
      ) : null}

      {preview.scheduled_at ? (
        <Notice tone="warning">
          <Text style={styles.body}>
            <Text style={styles.bold}>Scheduled:</Text> This message will be sent on{' '}
            <Text style={styles.bold}>{formatDateTime(preview.scheduled_at)}</Text>
          </Text>
        </Notice>
      ) : null}

      <View style={styles.actions}>
        <Button title="Edit message" variant="link" onPress={() => navigation.goBack()} />
        <Button
          title={scheduling ? 'Schedule message' : 'Send now'}
          variant="primary"
          onPress={send}
          loading={sending}
          disabled={preview.total_count === 0}
        />
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },
  step: { fontSize: 14, color: colors.gray[600], paddingHorizontal: 16, paddingTop: 8 },
  body: { fontSize: 15, color: colors.gray[800], lineHeight: 21 },
  bold: { fontWeight: '700', color: colors.gray[900] },
  muted: { fontSize: 13, color: colors.gray[600] },
  tokens: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  slack: { flexDirection: 'row', gap: 10, backgroundColor: '#1a1d21', borderRadius: 10, padding: 14 },
  slackAvatar: { width: 36, height: 36, borderRadius: 6, backgroundColor: '#d42f46', alignItems: 'center', justifyContent: 'center' },
  slackAvatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  slackName: { color: '#fff', fontWeight: '700' },
  slackApp: { color: '#9ca3af', fontSize: 12, fontWeight: '400' },
  slackBody: { color: '#f3f4f6', fontSize: 15, marginTop: 4, lineHeight: 21 },
  sms: { alignSelf: 'flex-start', maxWidth: '85%', backgroundColor: '#22c55e', borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 9 },
  smsText: { color: '#fff', fontSize: 14 },
  smsMeta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 18 },
});
