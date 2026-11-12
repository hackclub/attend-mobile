import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EmergencyContactCard } from '../components/EmergencyContactCard';
import { ParticipantWebLink } from '../components/ParticipantWebLink';
import {
  Avatar,
  Badge,
  Button,
  Container,
  Divider,
  Flashbar,
  Icon,
  KeyValue,
  PressableSurface,
  RefreshControl,
  StatusGlyph,
  TextField,
  type BadgeColor,
  type IconName,
  type StatusType,
} from '../components/ui';
import { useApp } from '../context/AppContext';
import { useEventAccess } from '../hooks/useEventAccess';
import { useFlash } from '../hooks/useFlash';
import { useNFC } from '../hooks/useNFC';
import { haptics } from '../services/haptics';
import { api } from '../services/api';
import { buildPhoneActions } from '../services/contactLinks';
import { checkInDetail, participantDetailLine } from '../services/participantCheckIn';
import { formatDateOnly } from '../services/eventDates';
import { isWithdrawn } from '../services/participantStatus';
import { travelDayTime } from '../services/travelTimes';
import { useTheme } from '../theme';
import { BiometricGate } from '../components/BiometricGate';
import { optionsSheet } from '../navigation/sheetData';
import { useOpenSheet } from '../navigation/sheetPresenter';
import type { AppStackParamList, Participant, ParticipantNote, Travel, Guardian, Consent, Accommodation, AccessibilityDetail, PersonalDetails, ScanByContext } from '../types';

interface ParticipantDetailContentProps {
  participant: Participant;
  topInset?: number;
  bottomInset?: number;
  /**
   * The screen sits under a translucent native header (iOS): the scroll view
   * insets itself to clear it, with topInset as the gap below.
   */
  underHeader?: boolean;
  /** Extra styles for the scrolling column, e.g. a pushed screen's max width. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * Show the "View on attend.hackclub.com" icon beside the name. A pushed
   * screen turns it off and puts it in its header instead.
   */
  webLink?: boolean;
}

/**
 * Full participant details, always behind the biometric gate. This is the
 * only export, so nothing can render the details without it: the pushed
 * screen, the iPad split pane and anything added later all get the gate,
 * which locks again when the app is backgrounded or the user signs out.
 */
export function ParticipantDetailContent(props: ParticipantDetailContentProps) {
  return (
    <BiometricGate>
      <ParticipantDetailBody {...props} />
    </BiometricGate>
  );
}

function ParticipantDetailBody({
  participant,
  topInset = 16,
  bottomInset = 32,
  underHeader = false,
  contentContainerStyle,
  webLink = true,
}: ParticipantDetailContentProps) {
  const { tokens, type } = useTheme();
  const { state, updateParticipant } = useApp();
  const { canViewParticipantRecords, canViewParticipantPii, roleLabel } = useEventAccess();
  const { isSupported: nfcSupported, writeTag } = useNFC();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const openSheet = useOpenSheet();
  // On-device passport/ID card check: global admins only (the server refuses
  // anyone else too), and only on an iPhone with an NFC reader to read the
  // document's chip — iPads and simulators have none.
  const canVerifyId = !!state.auth.user?.global_admin && Platform.OS === 'ios' && nfcSupported;
  const [isUndoing, setIsUndoing] = useState(false);
  const [isWritingBadge, setIsWritingBadge] = useState(false);
  const { flash, show: showFlash, dismiss: dismissFlash } = useFlash();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentParticipant, setCurrentParticipant] = useState<Participant>(participant);
  const [notes, setNotes] = useState<ParticipantNote[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [notesSupported, setNotesSupported] = useState(true);

  // Reset state when the participant prop changes (split view selection)
  useEffect(() => {
    setCurrentParticipant(participant);
    setNewNoteText('');
  }, [participant.participant_event_id]);

  const loadNotes = useCallback(async () => {
    if (!state.currentEvent) return;
    setIsLoadingNotes(true);
    try {
      const fetchedNotes = await api.getParticipantNotes(
        state.currentEvent.id,
        currentParticipant.participant_event_id
      );
      setNotes(fetchedNotes);
      setNotesSupported(true);
    } catch (error: any) {
      if (error?.status === 404) {
        setNotesSupported(false);
      } else {
        console.error('Failed to load notes:', error);
      }
    } finally {
      setIsLoadingNotes(false);
    }
  }, [state.currentEvent, currentParticipant.participant_event_id]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (!state.currentEvent) return;
    // Reached from a scan on a role the participants API refuses: the scan
    // response is the only record there is, so don't ask again for a 403.
    if (!canViewParticipantRecords) return;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await api.getParticipant(state.currentEvent!.id, currentParticipant.participant_event_id);
        if (!cancelled) {
          setCurrentParticipant(fresh);
          updateParticipant(fresh);
        }
      } catch {
        // keep cached data
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewParticipantRecords, state.currentEvent?.id, currentParticipant.participant_event_id]);

  const handleSubmitNote = async () => {
    if (!newNoteText.trim() || !state.currentEvent || isSubmittingNote) return;

    setIsSubmittingNote(true);
    try {
      const newNote = await api.createParticipantNote(
        state.currentEvent.id,
        currentParticipant.participant_event_id,
        newNoteText.trim()
      );
      setNotes(prev => [newNote, ...prev]);
      setNewNoteText('');
    } catch (error) {
      Alert.alert('Error', 'Failed to add note. Please try again.');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    if (!state.currentEvent) return;
    // Pull-to-refresh must not turn into a 403 loop for a role without
    // participant records; notes still refresh on their own.
    if (!canViewParticipantRecords) {
      setIsRefreshing(true);
      try {
        await loadNotes();
      } finally {
        setIsRefreshing(false);
      }
      return;
    }
    setIsRefreshing(true);
    try {
      const [updated] = await Promise.all([
        api.getParticipant(state.currentEvent.id, currentParticipant.participant_event_id),
        loadNotes(),
      ]);
      setCurrentParticipant(updated);
      updateParticipant(updated);
    } catch {
      // Keep current data on error
    } finally {
      setIsRefreshing(false);
    }
  }, [canViewParticipantRecords, state.currentEvent, currentParticipant.participant_event_id, updateParticipant, loadNotes]);

  const openContactURL = (url: string, appName: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert(`${appName} unavailable`, `Unable to open ${appName} for this number.`);
    });
  };

  const handleCall = (phone: string) => {
    const actions = buildPhoneActions(phone);

    if (actions.length === 0) {
      Alert.alert('Invalid phone number', 'This record does not contain a callable phone number.');
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Call with',
          message: phone,
          options: [...actions.map(action => action.label), 'Cancel'],
          cancelButtonIndex: actions.length,
        },
        buttonIndex => {
          const action = actions[buttonIndex];
          if (action) openContactURL(action.url, action.label);
        }
      );
      return;
    }

    Alert.alert(
      'Call with',
      phone,
      actions.map(action => ({
        text: action.label,
        onPress: () => openContactURL(action.url, action.label),
      })),
      { cancelable: true }
    );
  };

  const handleEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`).catch(() => {
      Alert.alert('Error', 'Unable to open email client');
    });
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const performUndo = async (scanContextId?: string, contextName?: string) => {
    if (!state.currentEvent) return;
    setIsUndoing(true);
    try {
      await api.undoCheckIn(state.currentEvent.id, currentParticipant.participant_event_id, scanContextId);

      const updatedScans = scanContextId
        ? currentParticipant.scans_by_context?.filter(s => s.scan_context_id !== scanContextId)
        : [];

      const hasCheckInScans = updatedScans?.some(s => s.checks_in);

      const updated = {
        ...currentParticipant,
        checked_in_at: hasCheckInScans ? currentParticipant.checked_in_at : undefined,
        scans_by_context: updatedScans,
      };
      setCurrentParticipant(updated);
      updateParticipant(updated);

      const message = contextName
        ? `Scan at "${contextName}" has been undone`
        : 'All scans have been undone';
      showFlash('success', message);
    } catch (error) {
      haptics.error();
      Alert.alert('Error', 'Failed to undo check-in');
    } finally {
      setIsUndoing(false);
    }
  };

  // Android has no action sheet, and Alert keeps three buttons, so the
  // contexts to undo go in the options sheet there.
  const undoScans = currentParticipant.scans_by_context || [];
  const claimUndoSheet = optionsSheet.useOpener({
    title: 'Choose a context to undo',
    subtitle: `${currentParticipant.display_name || currentParticipant.full_name} has been scanned at multiple locations. Which would you like to undo?`,
    options: [
      ...undoScans.map(scan => ({ value: scan.scan_context_id, label: undoContextLabel(scan) })),
      { value: UNDO_ALL, label: 'Undo all scans', destructive: true },
    ],
    onSelect: value => {
      if (value === UNDO_ALL) {
        void performUndo();
        return;
      }
      const scan = undoScans.find(s => s.scan_context_id === value);
      if (scan) void performUndo(scan.scan_context_id, scan.scan_context_name);
    },
  });

  const handleUndoCheckIn = () => {
    const scans = currentParticipant.scans_by_context || [];

    if (scans.length === 0) {
      Alert.alert(
        'Undo check-in',
        `Are you sure you want to undo the check-in for ${currentParticipant.display_name || currentParticipant.full_name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Undo all',
            style: 'destructive',
            onPress: () => performUndo(),
          },
        ]
      );
      return;
    }

    if (scans.length === 1) {
      const scan = scans[0];
      Alert.alert(
        'Undo check-in',
        `Undo scan at "${scan.scan_context_name}" for ${currentParticipant.display_name || currentParticipant.full_name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Undo',
            style: 'destructive',
            onPress: () => performUndo(scan.scan_context_id, scan.scan_context_name),
          },
        ]
      );
      return;
    }

    const name = currentParticipant.display_name || currentParticipant.full_name;
    const message = `${name} has been scanned at multiple locations. Which would you like to undo?`;

    // Alert keeps at most three buttons on Android, so a list of contexts
    // goes in an action sheet on iOS and a bottom sheet on Android.
    if (Platform.OS === 'ios') {
      const options = [...scans.map(undoContextLabel), 'Undo all scans', 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Choose a context to undo',
          message,
          options,
          destructiveButtonIndex: scans.length,
          cancelButtonIndex: scans.length + 1,
        },
        buttonIndex => {
          if (buttonIndex < scans.length) {
            const scan = scans[buttonIndex];
            performUndo(scan.scan_context_id, scan.scan_context_name);
          } else if (buttonIndex === scans.length) {
            performUndo();
          }
        }
      );
      return;
    }

    claimUndoSheet();
    openSheet('OptionsSheet');
  };

  const handleVerifyId = () => {
    if (!state.currentEvent) return;
    navigation.navigate('IdCheck', { participant: currentParticipant, eventId: state.currentEvent.id });
  };

  const handleWriteBadge = async () => {
    if (isWritingBadge) return;

    if (!currentParticipant.nfc_badge_token) {
      Alert.alert('Error', 'No NFC badge token available for this participant. Make sure NFC badges are enabled for this event, then refresh.');
      return;
    }

    if (!currentParticipant.slack_user_id) {
      Alert.alert('Error', 'No Slack ID available for this participant.');
      return;
    }

    setIsWritingBadge(true);
    try {
      const result = await writeTag({
        badgeUrl: `https://badge.hackclub.com/t/${currentParticipant.slack_user_id}`,
        attendToken: currentParticipant.nfc_badge_token,
      });

      if (result.success) {
        // useNFC has already played the haptic.
        showFlash('success', 'Badge written successfully', { silent: true });
      } else if (result.error !== 'Cancelled') {
        Alert.alert('Error', result.error || 'Failed to write badge');
      }
    } catch (error) {
      haptics.error();
      Alert.alert('Error', 'Failed to write badge');
    } finally {
      setIsWritingBadge(false);
    }
  };


  const name = currentParticipant.full_name || currentParticipant.display_name;
  const checkIn = checkInDetail(currentParticipant);
  const status: { glyph: StatusType; text: string; color: string } = isWithdrawn(currentParticipant)
    ? { glyph: 'stopped', text: 'Withdrawn', color: tokens.error }
    : checkIn
      ? { glyph: 'success', text: `Checked in ${checkIn}`, color: tokens.success }
      : { glyph: 'pending', text: participantDetailLine(currentParticipant), color: tokens.text2 };
  const safetyItems = buildSafetyItems(currentParticipant, tokens);
  const noteTypeLabels: Record<string, string> = { ops: 'Ops', safeguarding: 'Safeguarding', logistical: 'Logistical' };

  return (
    <>
      <ScrollView
        style={{ backgroundColor: tokens.bg }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset, paddingBottom: bottomInset },
          contentContainerStyle,
        ]}
        contentInsetAdjustmentBehavior={underHeader ? 'automatic' : 'never'}
        scrollIndicatorInsets={underHeader ? undefined : { top: topInset }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressBackgroundColor={tokens.bg}
            progressViewOffset={topInset}
          />
        }
      >
        <View style={styles.header}>
          <Avatar name={name} uri={currentParticipant.headshot_url} size={72} />
          <View style={styles.headerInfo}>
            <Text style={[type.h1, { color: tokens.textH }]} accessibilityRole="header" selectable>
              {name}
            </Text>
            {currentParticipant.pronouns ? (
              <Text style={[type.body, { color: tokens.text2 }]}>{currentParticipant.pronouns}</Text>
            ) : null}
            <View style={styles.statusLine} accessible accessibilityLabel={status.text}>
              <StatusGlyph type={status.glyph} color={status.color} />
              <Text style={[type.body, styles.statusText, { color: status.color }]}>{status.text}</Text>
            </View>
          </View>
          {webLink && <ParticipantWebLink participantEventId={currentParticipant.participant_event_id} />}
        </View>

        {safetyItems.length > 0 && (
          <Container title="Safety" bodyStyle={styles.safetyBody}>
            {safetyItems.map((item) => (
              <View key={item.title} style={styles.safetyItem} accessible accessibilityLabel={[item.title, item.detail].filter(Boolean).join(': ')}>
                <Icon name={item.icon} size={20} color={item.color} />
                <View style={styles.safetyText}>
                  <Text style={[type.label, { color: tokens.textH }]}>{item.title}</Text>
                  {item.detail ? (
                    <Text style={[type.body, { color: tokens.text2 }]}>{item.detail}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Container>
        )}

        {flash ? <Flashbar type={flash.type} message={flash.message} onDismiss={dismissFlash} /> : null}

        <View style={styles.actions}>
          {currentParticipant.checked_in_at && (
            <Button
              title="Undo check-in"
              icon="refresh"
              onPress={handleUndoCheckIn}
              loading={isUndoing}
              style={styles.actionButton}
            />
          )}
          {nfcSupported && (
            <Button
              title="Write to NFC badge"
              icon="nfc"
              onPress={handleWriteBadge}
              loading={isWritingBadge}
              style={styles.actionButton}
            />
          )}
          {canVerifyId && (
            <Button
              title="Verify ID"
              icon="identification"
              onPress={handleVerifyId}
              style={styles.actionButton}
            />
          )}
        </View>

        <Section title="Contact information">
          <InfoRow label="Email" value={currentParticipant.email} onPress={() => handleEmail(currentParticipant.email)} selectable accessibilityHint="Opens the default email app" />
          {currentParticipant.phone && (
            <InfoRow label="Phone" value={currentParticipant.phone} onPress={() => handleCall(currentParticipant.phone!)} selectable accessibilityHint="Shows calling options" />
          )}
          {currentParticipant.personal?.secondary_email && (
            <InfoRow label="Secondary email" value={currentParticipant.personal.secondary_email} onPress={() => handleEmail(currentParticipant.personal!.secondary_email!)} selectable accessibilityHint="Opens the default email app" />
          )}
        </Section>

        {currentParticipant.personal && (
          <PersonalSection
            personal={currentParticipant.personal}
            canViewPii={canViewParticipantPii}
            roleLabel={roleLabel}
          />
        )}

        {(currentParticipant.allergies || currentParticipant.medical_conditions || currentParticipant.medications || currentParticipant.medical_detail) && (
          <Section title="Medical information">
            {currentParticipant.allergies && (
              <InfoRow label="Allergies" value={currentParticipant.allergies} />
            )}
            {currentParticipant.medical_detail?.allergy_severity && (
              <InfoRow label="Allergy severity" value={currentParticipant.medical_detail.allergy_severity} />
            )}
            {currentParticipant.medical_conditions && (
              <InfoRow label="Medical conditions" value={currentParticipant.medical_conditions} />
            )}
            {currentParticipant.medications && (
              <InfoRow label="Medications" value={currentParticipant.medications} />
            )}
            {currentParticipant.requires_refrigeration && (
              <InfoRow label="Refrigeration required" value="Yes" />
            )}
            {currentParticipant.medical_detail?.emergency_action_plan && (
              <InfoRow label="Emergency action plan" value={currentParticipant.medical_detail.emergency_action_plan} />
            )}
            {currentParticipant.medical_detail?.additional_notes && (
              <InfoRow label="Additional notes" value={currentParticipant.medical_detail.additional_notes} />
            )}
          </Section>
        )}

        {(currentParticipant.diet_type || currentParticipant.life_threatening_allergies || currentParticipant.dietary_detail) && (
          <Section title="Dietary requirements">
            {currentParticipant.diet_type && (
              <InfoRow label="Diet type" value={currentParticipant.diet_type} />
            )}
            {currentParticipant.life_threatening_allergies && (
              <InfoRow label="Life-Threatening Allergies" value={currentParticipant.life_threatening_allergies} />
            )}
            {currentParticipant.cross_contamination_risk && (
              <InfoRow label="Cross contamination risk" value="Yes" />
            )}
            {currentParticipant.dietary_detail?.intolerances && (
              <InfoRow label="Intolerances" value={currentParticipant.dietary_detail.intolerances} />
            )}
            {currentParticipant.dietary_detail?.notes && (
              <InfoRow label="Notes" value={currentParticipant.dietary_detail.notes} />
            )}
          </Section>
        )}

        {currentParticipant.accessibility && (
          <AccessibilitySection a={currentParticipant.accessibility} />
        )}

        <Section title="Safeguarding">
          {/* Only sent to roles that see sensitive data; absent isn't "unsigned". */}
          {currentParticipant.freedom_waiver_granted !== undefined && (
            <InfoRow
              label="Freedom waiver"
              value={currentParticipant.freedom_waiver_granted ? 'Signed' : 'Not signed'}
              valueColor={currentParticipant.freedom_waiver_granted ? tokens.success : tokens.warning}
            />
          )}
          <InfoRow label="High support needs" value={currentParticipant.high_support_flag ? 'Yes' : 'No'} />
          <InfoRow label="Can leave unaccompanied" value={currentParticipant.can_leave_unaccompanied ? 'Yes' : 'No'} />
          {currentParticipant.safeguarding_detail?.high_support_notes && (
            <InfoRow label="High support notes" value={currentParticipant.safeguarding_detail.high_support_notes} />
          )}
          {currentParticipant.safeguarding_detail?.authorized_pickup_adults && (
            <InfoRow label="Authorized for Pickup" value={currentParticipant.safeguarding_detail.authorized_pickup_adults} />
          )}
          {currentParticipant.safeguarding_detail?.other_instructions && (
            <InfoRow label="Other instructions" value={currentParticipant.safeguarding_detail.other_instructions} />
          )}
        </Section>

        <Section title="Waiver status">
          <InfoRow
            label="Waiver signed"
            value={currentParticipant.waiver_signed ? 'Signed' : 'Not signed'}
            valueColor={currentParticipant.waiver_signed ? tokens.success : tokens.warning}
          />
        </Section>

        {currentParticipant.consents && currentParticipant.consents.length > 0 && (
          <ConsentsSection consents={currentParticipant.consents} />
        )}

        {currentParticipant.guardians && currentParticipant.guardians.length > 0 ? (
          <GuardiansSection
            guardians={currentParticipant.guardians}
            onCall={handleCall}
            onEmail={handleEmail}
          />
        ) : currentParticipant.parent_guardian_name ? (
          <Section title="Parent/Guardian">
            <InfoRow label="Name" value={currentParticipant.parent_guardian_name} />
            {currentParticipant.parent_guardian_phone && (
              <InfoRow
                label="Phone"
                value={currentParticipant.parent_guardian_phone}
                onPress={() => handleCall(currentParticipant.parent_guardian_phone!)}
                selectable
                accessibilityHint="Shows calling options"
              />
            )}
            {currentParticipant.parent_guardian_email && (
              <InfoRow
                label="Email"
                value={currentParticipant.parent_guardian_email}
                onPress={() => handleEmail(currentParticipant.parent_guardian_email!)}
                selectable
                accessibilityHint="Opens the default email app"
              />
            )}
          </Section>
        ) : null}

        {!currentParticipant.guardians?.length && currentParticipant.emergency_contacts && currentParticipant.emergency_contacts.length > 0 && (
          <Section title="Emergency contacts">
            {currentParticipant.emergency_contacts.map((contact, index) => (
              <React.Fragment key={contact.id || `contact-${index}`}>
                {index > 0 && <Divider style={styles.itemDivider} />}
                <EmergencyContactCard
                  contact={contact}
                  onCall={handleCall}
                  onEmail={handleEmail}
                />
              </React.Fragment>
            ))}
          </Section>
        )}

        {currentParticipant.travel_inbound && (
          <TravelSection
            title="Inbound travel"
            travel={currentParticipant.travel_inbound}
            canViewPii={canViewParticipantPii}
            timeZone={state.currentEvent?.timezone}
          />
        )}
        {currentParticipant.travel_outbound && (
          <TravelSection
            title="Outbound travel"
            travel={currentParticipant.travel_outbound}
            canViewPii={canViewParticipantPii}
            timeZone={state.currentEvent?.timezone}
          />
        )}

        {currentParticipant.accommodation && (
          <AccommodationSection accommodation={currentParticipant.accommodation} />
        )}

        {notesSupported && (
          <Container title={`Notes${notes.length > 0 ? ` (${notes.length})` : ''}`} bodyStyle={styles.notesBody}>
            {isLoadingNotes ? (
              <ActivityIndicator size="small" color={tokens.accent} style={styles.notesLoading} />
            ) : notes.length === 0 ? (
              <Text style={[type.body, { color: tokens.text2 }]}>No notes yet</Text>
            ) : (
              notes.map((note) => {
                const authorEmailOnly = !note.author?.name && note.author?.email;
                return (
                  <View key={note.id} style={styles.note}>
                    <Text style={[type.body, { color: tokens.text }]} selectable>{note.content}</Text>
                    <View style={styles.noteMeta}>
                      <Text style={[type.body, styles.noteMetaText, { color: tokens.muted }]}>
                        {note.note_type && noteTypeLabels[note.note_type] ? `${noteTypeLabels[note.note_type]} · ` : ''}
                        <Text
                          style={authorEmailOnly ? { color: tokens.accent } : undefined}
                          selectable={Boolean(authorEmailOnly)}
                          onPress={authorEmailOnly ? () => handleEmail(note.author.email) : undefined}
                          accessibilityRole={authorEmailOnly ? 'link' : undefined}
                        >
                          {note.author?.name || note.author?.email || 'Unknown'}
                        </Text>
                        {` · ${formatDateTime(note.created_at)}`}
                      </Text>
                      {note.sensitivity === 'restricted' && <Badge label="Restricted" color="red" />}
                    </View>
                  </View>
                );
              })
            )}

            <TextField
              placeholder="Add a note..."
              accessibilityLabel="Add a note"
              value={newNoteText}
              onChangeText={setNewNoteText}
              multiline
              maxLength={1000}
            />
            <Button
              title="Add note"
              onPress={handleSubmitNote}
              loading={isSubmittingNote}
              disabled={!newNoteText.trim()}
              style={styles.addNoteButton}
            />
          </Container>
        )}
      </ScrollView>
    </>
  );
}

const UNDO_ALL = '__all__';

function undoContextLabel(scan: ScanByContext): string {
  return `${scan.is_airport ? '✈️ ' : ''}${scan.scan_context_name} (${scan.scan_count} scan${scan.scan_count === 1 ? '' : 's'})`;
}

type Tokens = ReturnType<typeof useTheme>['tokens'];

interface SafetyItem {
  title: string;
  detail?: string;
  icon: IconName;
  color: string;
}

// The flags staff need before anything else, from fields the record already has.
function buildSafetyItems(p: Participant, tokens: Tokens): SafetyItem[] {
  const items: SafetyItem[] = [];
  if (p.has_anaphylaxis_risk) {
    const allergies = p.life_threatening_allergies || p.allergies;
    const severity = p.medical_detail?.allergy_severity;
    items.push({
      title: 'Anaphylaxis risk',
      detail: [allergies, severity ? `(${severity})` : null].filter(Boolean).join(' ') || undefined,
      icon: 'exclamation-circle',
      color: tokens.error,
    });
  }
  if (p.high_support_flag) {
    items.push({
      title: 'High support needs',
      detail: p.safeguarding_detail?.high_support_notes || undefined,
      icon: 'shield-exclamation',
      color: tokens.warning,
    });
  }
  if (p.requires_refrigeration) {
    items.push({
      title: 'Refrigeration required',
      detail: p.medications || undefined,
      icon: 'information-circle',
      color: tokens.info,
    });
  }
  if (p.cross_contamination_risk) {
    items.push({
      title: 'Cross contamination risk',
      detail: p.diet_type || undefined,
      icon: 'exclamation',
      color: tokens.warning,
    });
  }
  return items;
}

function PersonalSection({
  personal,
  canViewPii,
  roleLabel,
}: {
  personal: PersonalDetails;
  canViewPii: boolean;
  roleLabel: string | null;
}) {
  const fullLegalName = [personal.legal_first_name, personal.legal_last_name].filter(Boolean).join(' ');
  const addr = personal.address;
  const addressLines = [
    [addr?.line_1, addr?.line_2].filter(Boolean).join(', '),
    [addr?.city, addr?.state, addr?.postal_code].filter(Boolean).join(', '),
    addr?.country,
  ].filter(Boolean).join('\n');
  // The birthday and the address are omitted from the payload for a role that
  // can't see them, so age stands in for the birthday and the address row
  // explains itself instead of leaving a gap someone reads as "none on file".
  const hasContent = !!(
    fullLegalName
    || personal.preferred_name
    || personal.date_of_birth
    || personal.age != null
    || personal.tshirt_size
    || personal.engagement_preference
    || personal.engagement_notes
    || addressLines
    || !canViewPii
  );
  if (!hasContent) return null;
  const hiddenValue = roleLabel ? `Hidden for your role (${roleLabel})` : 'Hidden for your role';
  return (
    <Section title="Personal details">
      {fullLegalName && <InfoRow label="Legal name" value={fullLegalName} />}
      {personal.preferred_name && <InfoRow label="Preferred name" value={personal.preferred_name} />}
      {personal.date_of_birth ? (
        <InfoRow
          label="Date of Birth"
          value={`${formatDateOnly(personal.date_of_birth)}${personal.age != null ? ` (age ${personal.age})` : ''}`}
        />
      ) : personal.age != null ? (
        <InfoRow label="Age" value={`${personal.age}`} />
      ) : null}
      {personal.tshirt_size && <InfoRow label="T-Shirt Size" value={personal.tshirt_size} />}
      {personal.engagement_preference && <InfoRow label="Engagement" value={personal.engagement_preference.replace(/_/g, ' ')} />}
      {personal.engagement_notes && <InfoRow label="Engagement notes" value={personal.engagement_notes} />}
      {addressLines
        ? <InfoRow label="Address" value={addressLines} />
        : !canViewPii
          ? <InfoRow label="Address" value={hiddenValue} />
          : null}
    </Section>
  );
}

function AccommodationSection({ accommodation: a }: { accommodation: Accommodation }) {
  const hasContent =
    a.check_in_date || a.check_out_date || a.gender_identity || a.assigned_room ||
    a.rooming_exempt || a.preferred_roommate_genders?.length || a.roommate_preferences ||
    a.roommate_exclusions || a.venue_name || a.accessibility_needs || a.notes;
  if (!hasContent) return null;
  return (
    <Section title="Accommodation">
      {a.venue_name && <InfoRow label="Venue" value={a.venue_name} />}
      {a.assigned_room && <InfoRow label="Room" value={a.assigned_room} />}
      {a.rooming_exempt && <InfoRow label="Rooming exempt" value="Yes" />}
      {a.check_in_date && <InfoRow label="Check-in" value={formatDateOnly(a.check_in_date)} />}
      {a.check_out_date && <InfoRow label="Check-out" value={formatDateOnly(a.check_out_date)} />}
      {a.gender_identity && <InfoRow label="Gender identity" value={a.gender_identity_other || a.gender_identity.replace(/_/g, ' ')} />}
      {a.preferred_roommate_genders?.length ? (
        <InfoRow label="Preferred roommate genders" value={a.preferred_roommate_genders.join(', ').replace(/_/g, ' ')} />
      ) : null}
      {a.roommate_preferences && <InfoRow label="Roommate preferences" value={a.roommate_preferences} />}
      {a.roommate_exclusions && <InfoRow label="Roommate exclusions" value={a.roommate_exclusions} />}
      {a.room_type_preference && <InfoRow label="Room type" value={a.room_type_preference} />}
      {a.quiet_room_preference && <InfoRow label="Quiet room" value="Yes" />}
      {a.accessibility_needs && <InfoRow label="Accessibility needs" value={a.accessibility_needs} />}
      {a.notes && <InfoRow label="Notes" value={a.notes} />}
    </Section>
  );
}

function AccessibilitySection({ a }: { a: AccessibilityDetail }) {
  const flags: string[] = [];
  if (a.uses_wheelchair) flags.push('Wheelchair user');
  if (a.step_free_required) flags.push('Step-free access');
  if (a.needs_captioning) flags.push('Captioning');
  if (a.needs_large_print) flags.push('Large print');
  if (a.needs_sign_language) flags.push('Sign language');
  if (a.light_sensitivity) flags.push('Light sensitivity');
  if (a.noise_sensitivity) flags.push('Noise sensitivity');
  if (a.strobe_sensitivity) flags.push('Strobe sensitivity');
  if (a.has_adhd) flags.push('ADHD');
  if (a.has_autism) flags.push('Autism');
  if (a.has_dyslexia) flags.push('Dyslexia');
  if (a.prayer_space_required) flags.push('Prayer space');
  if (a.requires_private_space) flags.push('Private space');

  const hasContent =
    flags.length || a.mobility_needs || a.sensory_needs || a.communication_needs ||
    a.neurodivergent_notes || a.religious_practices || a.distance_limitations ||
    a.unavailable_times || a.other_needs;
  if (!hasContent) return null;

  return (
    <Section title="Accessibility">
      {flags.length > 0 && <InfoRow label="Flags" value={flags.join(', ')} />}
      {a.mobility_needs && <InfoRow label="Mobility" value={a.mobility_needs} />}
      {a.sensory_needs && <InfoRow label="Sensory" value={a.sensory_needs} />}
      {a.communication_needs && <InfoRow label="Communication" value={a.communication_needs} />}
      {a.neurodivergent_notes && <InfoRow label="Neurodivergent" value={a.neurodivergent_notes} />}
      {a.religious_practices && <InfoRow label="Religious" value={a.religious_practices} />}
      {a.distance_limitations && <InfoRow label="Distance limits" value={a.distance_limitations} />}
      {a.unavailable_times && <InfoRow label="Unavailable times" value={a.unavailable_times} />}
      {a.other_needs && <InfoRow label="Other" value={a.other_needs} />}
    </Section>
  );
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1).replace(/_/g, ' ') : text;
}

function ConsentsSection({ consents }: { consents: Consent[] }) {
  const { tokens, type } = useTheme();
  const labelFor = (consentType: string) => consentType.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const colorFor = (status: string): BadgeColor => {
    switch (status) {
      case 'signed': return 'green';
      case 'sent':
      case 'viewed': return 'blue';
      case 'failed':
      case 'voided': return 'red';
      default: return 'grey';
    }
  };
  return (
    <Section title="Consents">
      {consents.map((c) => {
        const signed = c.signed_at ? new Date(c.signed_at).toLocaleDateString() : null;
        return (
          <KeyValue
            key={c.id}
            label={labelFor(c.consent_type)}
            value={
              <View style={styles.consentValue}>
                <Badge label={capitalize(c.status)} color={colorFor(c.status)} />
                {signed && <Text style={[type.body, { color: tokens.text2 }]}>Signed {signed}</Text>}
                {!signed && c.pending_on && <Text style={[type.body, { color: tokens.text2 }]}>Pending: {c.pending_on}</Text>}
                {c.failure_reason && <Text style={[type.body, { color: tokens.error }]}>{c.failure_reason}</Text>}
              </View>
            }
          />
        );
      })}
    </Section>
  );
}

function GuardiansSection({ guardians, onCall, onEmail }: { guardians: Guardian[]; onCall: (n: string) => void; onEmail: (e: string) => void }) {
  const { tokens, type } = useTheme();
  return (
    <Section title={`Guardians (${guardians.length})`}>
      {guardians.map((g, index) => {
        const permissions = [
          { label: 'Media', granted: g.media_permission },
          { label: 'Photo', granted: g.photo_permission },
          { label: 'Travel', granted: g.travel_permission },
          { label: 'Med', granted: g.emergency_medical_consent },
          { label: 'OTC', granted: g.otc_medication_consent },
        ].filter((perm): perm is { label: string; granted: boolean } => perm.granted != null);
        return (
          <View key={g.id}>
            {index > 0 && <Divider style={styles.itemDivider} />}
            <View style={styles.personHeader}>
              <Text style={[type.h3, styles.personName, { color: tokens.textH }]}>{g.name || 'Unnamed guardian'}</Text>
              {g.is_primary && <Badge label="Primary" color="blue" />}
              {g.status && <Badge label={capitalize(g.status)} color={g.status === 'completed' ? 'green' : 'grey'} />}
            </View>
            {g.relationship && <InfoRow label="Relationship" value={g.relationship} />}
            {g.email && (
              <InfoRow label="Email" value={g.email} onPress={() => onEmail(g.email!)} selectable accessibilityHint="Opens the default email app" />
            )}
            {g.phone && (
              <InfoRow label="Phone" value={g.phone} onPress={() => onCall(g.phone!)} selectable accessibilityHint="Shows calling options" />
            )}
            {permissions.length > 0 && (
              <KeyValue
                label="Permissions"
                value={
                  <View style={styles.permRow}>
                    {permissions.map((perm) => (
                      <View
                        key={perm.label}
                        style={styles.perm}
                        accessible
                        accessibilityLabel={`${perm.label}: ${perm.granted ? 'granted' : 'not granted'}`}
                      >
                        <Icon name={perm.granted ? 'check' : 'x'} size={14} color={perm.granted ? tokens.success : tokens.error} />
                        <Text style={[type.body, { color: perm.granted ? tokens.success : tokens.error }]}>{perm.label}</Text>
                      </View>
                    ))}
                  </View>
                }
              />
            )}
            {g.emergency_contacts && g.emergency_contacts.length > 0 && (
              <View style={styles.subsection}>
                <Text style={[type.label, { color: tokens.text2 }]}>Emergency contacts</Text>
                {g.emergency_contacts.map((ec) => (
                  <View key={ec.id || ec.name} style={styles.subContact}>
                    <Text style={[type.body, { color: tokens.text }]}>
                      {ec.name}{ec.relationship ? ` · ${ec.relationship}` : ''}
                    </Text>
                    {ec.phone && (
                      <LinkText value={ec.phone} onPress={() => onCall(ec.phone)} accessibilityHint="Shows calling options" />
                    )}
                    {ec.email && (
                      <LinkText value={ec.email} onPress={() => onEmail(ec.email!)} accessibilityHint="Opens the default email app" />
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </Section>
  );
}

function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Container title={title} actions={actions}>
      {children}
    </Container>
  );
}

const TRAVEL_MODE_LABELS: Record<string, string> = {
  plane: 'Flight',
  train: 'Train',
  car: 'Car',
  bus: 'Bus',
  other: 'Other',
};

function legStatusColor(status?: string): BadgeColor {
  switch (status?.toLowerCase()) {
    case 'arrived': return 'green';
    case 'departed':
    case 'enroute': return 'blue';
    case 'delayed':
    case 'diverted': return 'yellow';
    case 'cancelled': return 'red';
    default: return 'grey';
  }
}

/** "Sat 14 Nov, 10:30 AM" in the event's timezone, for a leg's details. */
function formatTravelDateTime(iso: string | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  };
  try {
    return date.toLocaleString(undefined, { ...options, timeZone });
  } catch {
    return date.toLocaleString(undefined, options);
  }
}

interface TravelLegSummary {
  key: string;
  /** "QF1401", "Train" */
  title: string;
  /** "Sat 10:30 AM · Sydney → Canberra" */
  summary: string;
  status?: string;
  /** When the airport pickup collected them, formatted. */
  pickedUpAt?: string;
  details: { label: string; value: string }[];
}

// One row per leg: each flight leg, or the whole journey for the other modes.
function travelLegs(travel: Travel, canViewPii: boolean, timeZone?: string): TravelLegSummary[] {
  const mode = TRAVEL_MODE_LABELS[travel.mode || ''] || 'Unknown';
  const at = (iso?: string) => travelDayTime(iso, timeZone);
  const full = (iso?: string) => formatTravelDateTime(iso, timeZone);
  const route = (from?: string, to?: string) => (from || to ? `${from || '---'} → ${to || '---'}` : null);
  const join = (...bits: (string | null | undefined)[]) => bits.filter(Boolean).join(' · ');
  const rows = (pairs: [string, string | null | undefined][]) =>
    pairs.filter((pair): pair is [string, string] => !!pair[1]).map(([label, value]) => ({ label, value }));

  if (travel.mode === 'plane' && travel.legs?.length) {
    return travel.legs.map((leg) => {
      const departs = leg.live_departure_time || leg.departure_time;
      const arrives = leg.live_arrival_time || leg.arrival_time;
      return {
        key: leg.id,
        title: leg.flight_code || 'Flight',
        summary: join(at(departs), route(leg.departure_airport, leg.arrival_airport)),
        status: leg.live_status,
        pickedUpAt: full(leg.airport_picked_up_at) ?? undefined,
        details: rows([
          ['From', leg.departure_airport],
          ['To', leg.arrival_airport],
          ['Depart', full(departs) || 'N/A'],
          ['Arrive', full(arrives) || 'N/A'],
        ]),
      };
    });
  }

  if (travel.mode === 'train' || travel.mode === 'bus') {
    const from = travel.mode === 'train'
      ? travel.train_departure_station || travel.departure_station
      : travel.bus_departure_location;
    const to = travel.mode === 'train'
      ? travel.train_arrival_station || travel.arrival_station
      : travel.bus_arrival_location;
    const train = travel.mode === 'train';
    return [{
      key: travel.id,
      title: mode,
      summary: join(at(travel.departure_time), route(from, to)),
      details: rows([
        [train ? 'Departure station' : 'From', from],
        [train ? 'Arrival station' : 'To', to],
        ['Departure', full(travel.departure_time)],
        ['Arrival', full(travel.arrival_time)],
      ]),
    }];
  }

  if (travel.mode === 'car') {
    // The pickup address for a car journey is the participant's doorstep,
    // and it isn't in the payload for this role at all.
    const from = travel.origin_address || (!canViewPii ? 'Address hidden for your role' : undefined);
    return [{
      key: travel.id,
      title: mode,
      summary: join(at(travel.expected_arrival_time), travel.origin_address),
      details: rows([
        ['From', from],
        ['Expected arrival', full(travel.expected_arrival_time)],
      ]),
    }];
  }

  return [{
    key: travel.id,
    title: mode,
    summary: travel.mode === 'other' ? travel.other_details ?? '' : '',
    details: rows([['Details', travel.mode === 'other' ? travel.other_details : undefined]]),
  }];
}

function TravelSection({
  title,
  travel,
  canViewPii,
  timeZone,
}: {
  title: string;
  travel: Travel;
  canViewPii: boolean;
  timeZone?: string;
}) {
  const { tokens, type } = useTheme();
  const legs = travelLegs(travel, canViewPii, timeZone);

  return (
    <Section
      title={title}
      actions={travel.is_unaccompanied_minor ? <Badge label="UM" color="yellow" /> : undefined}
    >
      {legs.map((leg, index) => (
        <React.Fragment key={leg.key}>
          {index > 0 && <Divider />}
          <TravelLegRow leg={leg} />
        </React.Fragment>
      ))}

      {travel.notes && <InfoRow label="Notes" value={travel.notes} />}

      {(travel.visa_required || travel.visa_status || travel.visa_type || travel.visa_number || travel.passport_nationality) && (
        <View style={styles.subsection}>
          <Text style={[type.h3, { color: tokens.textH }]}>Visa</Text>
          {travel.passport_nationality && <InfoRow label="Passport" value={travel.passport_nationality} />}
          {travel.visa_status && <InfoRow label="Status" value={travel.visa_status} />}
          {travel.visa_type && <InfoRow label="Type" value={travel.visa_type} />}
          {travel.visa_number && <InfoRow label="Number" value={travel.visa_number} />}
        </View>
      )}
    </Section>
  );
}

/** "QF1401 · Sat 10:30 AM · Sydney → Canberra"; tapping it opens the leg's details. */
function TravelLegRow({ leg }: { leg: TravelLegSummary }) {
  const { tokens, type, hitTarget } = useTheme();
  const [open, setOpen] = useState(false);
  const expandable = leg.details.length > 0 || !!leg.pickedUpAt;
  const line = (
    <View style={[styles.legRow, { minHeight: hitTarget }]}>
      <Text style={[type.body, styles.legLine, { color: tokens.text2 }]} numberOfLines={open ? undefined : 1}>
        <Text style={[type.label, { color: tokens.textH }]}>{leg.title}</Text>
        {leg.summary ? ` · ${leg.summary}` : ''}
      </Text>
      {leg.status ? <Badge label={capitalize(leg.status)} color={legStatusColor(leg.status)} /> : null}
      {leg.pickedUpAt ? <Icon name="check-circle" size={16} color={tokens.success} /> : null}
      {expandable ? <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={tokens.muted} /> : null}
    </View>
  );

  return (
    <View>
      {expandable ? (
        <PressableSurface
          onPress={() => setOpen((value) => !value)}
          rippleColor={tokens.text}
          rippleAlpha={0.1}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityHint={open ? 'Hides the leg details' : 'Shows the leg details'}
        >
          {line}
        </PressableSurface>
      ) : line}
      {open && (
        <View style={styles.legDetails}>
          {leg.details.map((d) => <InfoRow key={d.label} label={d.label} value={d.value} />)}
          {leg.pickedUpAt && (
            <View style={styles.pickedUp}>
              <Icon name="check-circle" size={16} color={tokens.success} />
              <Text style={[type.body, { color: tokens.success }]}>
                Picked up {leg.pickedUpAt}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function LinkText({ value, onPress, accessibilityHint }: { value: string; onPress: () => void; accessibilityHint?: string }) {
  const { tokens, type } = useTheme();
  return (
    <Text
      style={[type.body, { color: tokens.accent }]}
      selectable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityHint={accessibilityHint}
    >
      {value}
    </Text>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  onPress?: () => void;
  valueColor?: string;
  selectable?: boolean;
  accessibilityHint?: string;
}

function InfoRow({ label, value, onPress, valueColor, selectable, accessibilityHint }: InfoRowProps) {
  if (onPress) {
    return (
      <KeyValue
        label={label}
        value={<LinkText value={value} onPress={onPress} accessibilityHint={accessibilityHint} />}
      />
    );
  }
  return (
    <KeyValue
      label={label}
      value={value}
      valueColor={valueColor}
      selectable={selectable}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusText: {
    flexShrink: 1,
  },
  safetyBody: {
    gap: 12,
  },
  safetyItem: {
    flexDirection: 'row',
    gap: 8,
  },
  safetyText: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: '40%',
  },
  itemDivider: {
    marginVertical: 8,
  },
  personHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 4,
  },
  personName: {
    flexShrink: 1,
  },
  subsection: {
    marginTop: 8,
  },
  subContact: {
    paddingVertical: 4,
  },
  consentValue: {
    gap: 2,
  },
  permRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
  },
  perm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  legLine: {
    flex: 1,
    minWidth: 0,
  },
  legDetails: {
    paddingBottom: 6,
  },
  pickedUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  notesBody: {
    gap: 12,
  },
  notesLoading: {
    paddingVertical: 8,
  },
  note: {
    gap: 2,
  },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  noteMetaText: {
    flexShrink: 1,
  },
  addNoteButton: {
    alignSelf: 'flex-start',
  },
});
