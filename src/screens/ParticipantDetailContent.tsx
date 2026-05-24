import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AlertBadge } from '../components/AlertBadge';
import { StatusBadge } from '../components/StatusBadge';
import { EmergencyContactCard } from '../components/EmergencyContactCard';
import { useApp } from '../context/AppContext';
import { useNFC } from '../hooks/useNFC';
import { api } from '../services/api';
import { colors } from '../theme/colors';
import type { Participant, ParticipantNote, Travel, Guardian, Consent, Accommodation, AccessibilityDetail, PersonalDetails } from '../types';

interface ParticipantDetailContentProps {
  participant: Participant;
  topInset?: number;
  bottomInset?: number;
}

export function ParticipantDetailContent({ participant, topInset = 100, bottomInset = 32 }: ParticipantDetailContentProps) {
  const { state, updateParticipant } = useApp();
  const { isSupported: nfcSupported, writeTag } = useNFC();
  const [isUndoing, setIsUndoing] = useState(false);
  const [isWritingBadge, setIsWritingBadge] = useState(false);
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
  }, [state.currentEvent?.id, currentParticipant.participant_event_id]);

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
  }, [state.currentEvent, currentParticipant.participant_event_id, updateParticipant, loadNotes]);

  const handleCall = (phone: string) => {
    const phoneNumber = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${phoneNumber}`).catch(() => {
      Alert.alert('Error', 'Unable to make phone call');
    });
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
      Alert.alert('Success', message);
    } catch (error) {
      Alert.alert('Error', 'Failed to undo check-in');
    } finally {
      setIsUndoing(false);
    }
  };

  const handleUndoCheckIn = () => {
    const scans = currentParticipant.scans_by_context || [];

    if (scans.length === 0) {
      Alert.alert(
        'Undo Check-In',
        `Are you sure you want to undo the check-in for ${currentParticipant.display_name || currentParticipant.full_name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Undo All',
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
        'Undo Check-In',
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

    const buttons: any[] = scans.map(scan => ({
      text: `${scan.is_airport ? '✈️ ' : ''}${scan.scan_context_name} (${scan.scan_count} scan${scan.scan_count === 1 ? '' : 's'})`,
      onPress: () => performUndo(scan.scan_context_id, scan.scan_context_name),
    }));

    buttons.push({
      text: 'Undo All Scans',
      style: 'destructive',
      onPress: () => performUndo(),
    });

    buttons.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert(
      'Select Context to Undo',
      `${currentParticipant.display_name || currentParticipant.full_name} has been scanned at multiple locations. Which would you like to undo?`,
      buttons
    );
  };

  const handleOpenInBrowser = () => {
    if (!state.currentEvent) return;
    const url = `https://attend.hackclub.com/admin/events/${state.currentEvent.id}/participants/${currentParticipant.participant_event_id}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Unable to open browser');
    });
  };

  const handleWriteBadge = async () => {
    if (isWritingBadge) return;

    if (!currentParticipant.nfc_badge_token) {
      Alert.alert('Error', 'No NFC badge token available for this participant. Try checking them in first.');
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
        Alert.alert('Success', 'Badge written successfully');
      } else if (result.error !== 'Cancelled') {
        Alert.alert('Error', result.error || 'Failed to write badge');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to write badge');
    } finally {
      setIsWritingBadge(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: bottomInset }]}
      scrollIndicatorInsets={{ top: topInset }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.red}
          progressViewOffset={topInset}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerContent}>
          {currentParticipant.headshot_url ? (
            <Image
              source={{ uri: currentParticipant.headshot_url }}
              style={styles.headshot}
            />
          ) : (
            <View style={styles.headshotPlaceholder}>
              <Ionicons name="person" size={40} color={colors.gray[400]} />
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{currentParticipant.full_name}</Text>
            {currentParticipant.pronouns && (
              <Text style={styles.pronouns}>({currentParticipant.pronouns})</Text>
            )}
            <View style={styles.statusRow}>
              <StatusBadge status={currentParticipant.checked_in_at ? 'checkedIn' : 'pending'} />
              {currentParticipant.checked_in_at && (
                <Text style={styles.checkedInTime}>
                  {formatDateTime(currentParticipant.checked_in_at)}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>

      {(currentParticipant.has_anaphylaxis_risk || currentParticipant.high_support_flag) && (
        <View style={styles.alertsSection}>
          {currentParticipant.has_anaphylaxis_risk && (
            <AlertBadge type="anaphylaxis" label="⚠️ Anaphylaxis Risk" />
          )}
          {currentParticipant.high_support_flag && (
            <AlertBadge type="highSupport" label="⚠️ High Support Needs" />
          )}
        </View>
      )}

      <Section title="Contact Information">
        <InfoRow label="Email" value={currentParticipant.email} onPress={() => handleEmail(currentParticipant.email)} />
        {currentParticipant.phone && (
          <InfoRow label="Phone" value={currentParticipant.phone} onPress={() => handleCall(currentParticipant.phone!)} />
        )}
        {currentParticipant.personal?.secondary_email && (
          <InfoRow label="Secondary Email" value={currentParticipant.personal.secondary_email} onPress={() => handleEmail(currentParticipant.personal!.secondary_email!)} />
        )}
      </Section>

      {currentParticipant.personal && (
        <PersonalSection personal={currentParticipant.personal} />
      )}

      {currentParticipant.accommodation && (
        <AccommodationSection accommodation={currentParticipant.accommodation} />
      )}

      {(currentParticipant.allergies || currentParticipant.medical_conditions || currentParticipant.medications || currentParticipant.medical_detail) && (
        <Section title="Medical Information">
          {currentParticipant.allergies && (
            <InfoRow label="Allergies" value={currentParticipant.allergies} highlight />
          )}
          {currentParticipant.medical_detail?.allergy_severity && (
            <InfoRow label="Allergy Severity" value={currentParticipant.medical_detail.allergy_severity} highlight />
          )}
          {currentParticipant.medical_conditions && (
            <InfoRow label="Medical Conditions" value={currentParticipant.medical_conditions} highlight />
          )}
          {currentParticipant.medications && (
            <InfoRow label="Medications" value={currentParticipant.medications} />
          )}
          {currentParticipant.requires_refrigeration && (
            <InfoRow label="Refrigeration Required" value="Yes" highlight />
          )}
          {currentParticipant.medical_detail?.emergency_action_plan && (
            <InfoRow label="Emergency Action Plan" value={currentParticipant.medical_detail.emergency_action_plan} highlight />
          )}
          {currentParticipant.medical_detail?.additional_notes && (
            <InfoRow label="Additional Notes" value={currentParticipant.medical_detail.additional_notes} />
          )}
        </Section>
      )}

      {(currentParticipant.diet_type || currentParticipant.life_threatening_allergies || currentParticipant.dietary_detail) && (
        <Section title="Dietary Requirements">
          {currentParticipant.diet_type && (
            <InfoRow label="Diet Type" value={currentParticipant.diet_type} />
          )}
          {currentParticipant.life_threatening_allergies && (
            <InfoRow label="Life-Threatening Allergies" value={currentParticipant.life_threatening_allergies} highlight />
          )}
          {currentParticipant.cross_contamination_risk && (
            <InfoRow label="Cross Contamination Risk" value="Yes" highlight />
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
        <View style={styles.safeguardingRow}>
          <Text style={styles.safeguardingLabel}>Freedom Waiver</Text>
          <StatusBadge status={currentParticipant.freedom_waiver_granted ? 'signed' : 'unsigned'} />
        </View>
        <View style={styles.safeguardingRow}>
          <Text style={styles.safeguardingLabel}>High Support Needs</Text>
          <Text style={styles.safeguardingValue}>
            {currentParticipant.high_support_flag ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.safeguardingRow}>
          <Text style={styles.safeguardingLabel}>Can Leave Unaccompanied</Text>
          <Text style={styles.safeguardingValue}>
            {currentParticipant.can_leave_unaccompanied ? 'Yes' : 'No'}
          </Text>
        </View>
        {currentParticipant.safeguarding_detail?.high_support_notes && (
          <InfoRow label="High Support Notes" value={currentParticipant.safeguarding_detail.high_support_notes} highlight />
        )}
        {currentParticipant.safeguarding_detail?.authorized_pickup_adults && (
          <InfoRow label="Authorized for Pickup" value={currentParticipant.safeguarding_detail.authorized_pickup_adults} />
        )}
        {currentParticipant.safeguarding_detail?.other_instructions && (
          <InfoRow label="Other Instructions" value={currentParticipant.safeguarding_detail.other_instructions} />
        )}
        {currentParticipant.safeguarding_detail && (
          <>
            <View style={styles.safeguardingRow}>
              <Text style={styles.safeguardingLabel}>Curfew Acknowledged</Text>
              <Text style={styles.safeguardingValue}>{currentParticipant.safeguarding_detail.curfew_acknowledged ? 'Yes' : 'No'}</Text>
            </View>
            <View style={styles.safeguardingRow}>
              <Text style={styles.safeguardingLabel}>Overnight Rules Acknowledged</Text>
              <Text style={styles.safeguardingValue}>{currentParticipant.safeguarding_detail.overnight_rules_acknowledged ? 'Yes' : 'No'}</Text>
            </View>
          </>
        )}
      </Section>

      <Section title="Waiver Status">
        <View style={styles.safeguardingRow}>
          <Text style={styles.safeguardingLabel}>Waiver Signed</Text>
          <StatusBadge status={currentParticipant.waiver_signed ? 'signed' : 'unsigned'} />
        </View>
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
            />
          )}
          {currentParticipant.parent_guardian_email && (
            <InfoRow
              label="Email"
              value={currentParticipant.parent_guardian_email}
              onPress={() => handleEmail(currentParticipant.parent_guardian_email!)}
            />
          )}
        </Section>
      ) : null}

      {!currentParticipant.guardians?.length && currentParticipant.emergency_contacts && currentParticipant.emergency_contacts.length > 0 && (
        <Section title="Emergency Contacts">
          {currentParticipant.emergency_contacts.map((contact, index) => (
            <EmergencyContactCard key={contact.id || `contact-${index}`} contact={contact} />
          ))}
        </Section>
      )}

      {(currentParticipant.travel_inbound || currentParticipant.travel_outbound) && (
        <>
          {currentParticipant.travel_inbound && (
            <TravelSection title="Inbound Travel" travel={currentParticipant.travel_inbound} />
          )}
          {currentParticipant.travel_outbound && (
            <TravelSection title="Outbound Travel" travel={currentParticipant.travel_outbound} />
          )}
        </>
      )}

      {notesSupported && (
        <Section title={`Notes${notes.length > 0 ? ` (${notes.length})` : ''}`}>
          <View style={styles.noteInputContainer}>
            <TextInput
              style={styles.noteInput}
              placeholder="Add a note..."
              placeholderTextColor={colors.text.muted}
              value={newNoteText}
              onChangeText={setNewNoteText}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.noteSubmitButton, (!newNoteText.trim() || isSubmittingNote) && styles.noteSubmitButtonDisabled]}
              onPress={handleSubmitNote}
              disabled={!newNoteText.trim() || isSubmittingNote}
            >
              {isSubmittingNote ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="send" size={18} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>

          {isLoadingNotes ? (
            <View style={styles.notesLoading}>
              <ActivityIndicator size="small" color={colors.red} />
            </View>
          ) : notes.length === 0 ? (
            <Text style={styles.noNotesText}>No notes yet</Text>
          ) : (
            notes.map((note) => (
              <View key={note.id} style={[styles.noteCard, note.sensitivity === 'restricted' && styles.noteCardRestricted]}>
                <View style={styles.noteHeader}>
                  <View style={styles.noteAuthorRow}>
                    <Text style={styles.noteAuthor}>{note.author?.name || note.author?.email || 'Unknown'}</Text>
                    {note.sensitivity === 'restricted' && (
                      <View style={styles.restrictedBadge}>
                        <Ionicons name="lock-closed" size={10} color={colors.white} />
                        <Text style={styles.restrictedBadgeText}>Restricted</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.noteTime}>{formatDateTime(note.created_at)}</Text>
                </View>
                <Text style={styles.noteContent}>{note.content}</Text>
              </View>
            ))
          )}
        </Section>
      )}

      <View style={styles.actionButtons}>
        {nfcSupported && (
          <TouchableOpacity
            style={[styles.writeBadgeButton, isWritingBadge && styles.writeBadgeButtonDisabled]}
            onPress={handleWriteBadge}
            disabled={isWritingBadge}
          >
            {isWritingBadge ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="radio-outline" size={20} color={colors.white} />
                <Text style={styles.writeBadgeButtonText}>Write to NFC Badge</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.openInBrowserButton}
          onPress={handleOpenInBrowser}
        >
          <Ionicons name="open-outline" size={20} color={colors.blue} />
          <Text style={styles.openInBrowserText}>View on attend.hackclub.com</Text>
        </TouchableOpacity>

        {currentParticipant.checked_in_at && (
          <TouchableOpacity
            style={styles.undoButton}
            onPress={handleUndoCheckIn}
            disabled={isUndoing}
          >
            {isUndoing ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="arrow-undo" size={20} color={colors.white} />
                <Text style={styles.undoButtonText}>Undo Check-In</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function PersonalSection({ personal }: { personal: PersonalDetails }) {
  const fullLegalName = [personal.legal_first_name, personal.legal_last_name].filter(Boolean).join(' ');
  const addr = personal.address;
  const addressLines = [
    [addr?.line_1, addr?.line_2].filter(Boolean).join(', '),
    [addr?.city, addr?.state, addr?.postal_code].filter(Boolean).join(', '),
    addr?.country,
  ].filter(Boolean).join('\n');
  return (
    <Section title="Personal Details">
      {fullLegalName && <InfoRow label="Legal Name" value={fullLegalName} />}
      {personal.preferred_name && <InfoRow label="Preferred Name" value={personal.preferred_name} />}
      {personal.date_of_birth && (
        <InfoRow
          label="Date of Birth"
          value={`${new Date(personal.date_of_birth).toLocaleDateString()}${personal.age != null ? ` (age ${personal.age})` : ''}`}
        />
      )}
      {personal.tshirt_size && <InfoRow label="T-Shirt Size" value={personal.tshirt_size} />}
      {personal.engagement_preference && <InfoRow label="Engagement" value={personal.engagement_preference.replace(/_/g, ' ')} />}
      {personal.engagement_notes && <InfoRow label="Engagement Notes" value={personal.engagement_notes} />}
      {addressLines && <InfoRow label="Address" value={addressLines} />}
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
      {a.assigned_room && <InfoRow label="Room" value={a.assigned_room} highlight />}
      {a.rooming_exempt && <InfoRow label="Rooming Exempt" value="Yes" />}
      {a.check_in_date && <InfoRow label="Check-in" value={new Date(a.check_in_date).toLocaleDateString()} />}
      {a.check_out_date && <InfoRow label="Check-out" value={new Date(a.check_out_date).toLocaleDateString()} />}
      {a.gender_identity && <InfoRow label="Gender Identity" value={a.gender_identity_other || a.gender_identity.replace(/_/g, ' ')} />}
      {a.preferred_roommate_genders?.length ? (
        <InfoRow label="Preferred Roommate Genders" value={a.preferred_roommate_genders.join(', ').replace(/_/g, ' ')} />
      ) : null}
      {a.roommate_preferences && <InfoRow label="Roommate Preferences" value={a.roommate_preferences} />}
      {a.roommate_exclusions && <InfoRow label="Roommate Exclusions" value={a.roommate_exclusions} highlight />}
      {a.room_type_preference && <InfoRow label="Room Type" value={a.room_type_preference} />}
      {a.quiet_room_preference && <InfoRow label="Quiet Room" value="Yes" />}
      {a.accessibility_needs && <InfoRow label="Accessibility Needs" value={a.accessibility_needs} />}
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
      {a.distance_limitations && <InfoRow label="Distance Limits" value={a.distance_limitations} />}
      {a.unavailable_times && <InfoRow label="Unavailable Times" value={a.unavailable_times} />}
      {a.other_needs && <InfoRow label="Other" value={a.other_needs} />}
    </Section>
  );
}

function ConsentsSection({ consents }: { consents: Consent[] }) {
  const labelFor = (type: string) => type.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const toneFor = (status: string) => {
    switch (status) {
      case 'signed': return { bg: colors.green + '20', fg: colors.green };
      case 'sent':
      case 'viewed': return { bg: colors.blue + '20', fg: colors.blue };
      case 'failed':
      case 'voided': return { bg: colors.red + '20', fg: colors.red };
      default: return { bg: colors.gray[200], fg: colors.gray[700] };
    }
  };
  return (
    <Section title="Consents">
      {consents.map((c) => {
        const tone = toneFor(c.status);
        const signed = c.signed_at ? new Date(c.signed_at).toLocaleDateString() : null;
        return (
          <View key={c.id} style={styles.consentRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.consentType}>{labelFor(c.consent_type)}</Text>
              {signed && <Text style={styles.consentMeta}>Signed {signed}</Text>}
              {!signed && c.pending_on && <Text style={styles.consentMeta}>Pending: {c.pending_on}</Text>}
              {c.failure_reason && <Text style={[styles.consentMeta, { color: colors.red }]}>{c.failure_reason}</Text>}
            </View>
            <View style={[styles.consentBadge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.consentBadgeText, { color: tone.fg }]}>{c.status}</Text>
            </View>
          </View>
        );
      })}
    </Section>
  );
}

function GuardiansSection({ guardians, onCall, onEmail }: { guardians: Guardian[]; onCall: (n: string) => void; onEmail: (e: string) => void }) {
  return (
    <Section title={`Guardians (${guardians.length})`}>
      {guardians.map((g) => (
        <View key={g.id} style={styles.guardianCard}>
          <View style={styles.guardianHeader}>
            <Text style={styles.guardianName}>{g.name || 'Unnamed guardian'}</Text>
            {g.is_primary && (
              <View style={styles.primaryBadge}><Text style={styles.primaryBadgeText}>Primary</Text></View>
            )}
            {g.status && (
              <View style={[styles.guardianStatusBadge, g.status === 'completed' ? { backgroundColor: colors.green + '20' } : { backgroundColor: colors.gray[200] }]}>
                <Text style={[styles.guardianStatusText, g.status === 'completed' ? { color: colors.green } : { color: colors.gray[700] }]}>{g.status}</Text>
              </View>
            )}
          </View>
          {g.relationship && <Text style={styles.guardianMeta}>{g.relationship}</Text>}
          {g.email && (
            <TouchableOpacity onPress={() => onEmail(g.email!)}><Text style={styles.guardianLink}>{g.email}</Text></TouchableOpacity>
          )}
          {g.phone && (
            <TouchableOpacity onPress={() => onCall(g.phone!)}><Text style={styles.guardianLink}>{g.phone}</Text></TouchableOpacity>
          )}
          {(g.media_permission != null || g.photo_permission != null || g.travel_permission != null || g.emergency_medical_consent != null || g.otc_medication_consent != null) && (
            <View style={styles.permRow}>
              {g.media_permission != null && <PermChip label="Media" granted={g.media_permission} />}
              {g.photo_permission != null && <PermChip label="Photo" granted={g.photo_permission} />}
              {g.travel_permission != null && <PermChip label="Travel" granted={g.travel_permission} />}
              {g.emergency_medical_consent != null && <PermChip label="Med" granted={g.emergency_medical_consent} />}
              {g.otc_medication_consent != null && <PermChip label="OTC" granted={g.otc_medication_consent} />}
            </View>
          )}
          {g.emergency_contacts && g.emergency_contacts.length > 0 && (
            <View style={styles.guardianContactsList}>
              <Text style={styles.guardianContactsTitle}>Emergency Contacts</Text>
              {g.emergency_contacts.map((ec) => (
                <View key={ec.id || ec.name} style={styles.guardianContact}>
                  <Text style={styles.guardianContactName}>{ec.name}{ec.relationship ? ` · ${ec.relationship}` : ''}</Text>
                  {ec.phone && (
                    <TouchableOpacity onPress={() => onCall(ec.phone)}><Text style={styles.guardianLink}>{ec.phone}</Text></TouchableOpacity>
                  )}
                  {ec.email && (
                    <TouchableOpacity onPress={() => onEmail(ec.email!)}><Text style={styles.guardianLink}>{ec.email}</Text></TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </Section>
  );
}

function PermChip({ label, granted }: { label: string; granted: boolean }) {
  return (
    <View style={[styles.permChip, granted ? styles.permChipOn : styles.permChipOff]}>
      <Ionicons name={granted ? 'checkmark' : 'close'} size={10} color={granted ? colors.green : colors.red} />
      <Text style={[styles.permChipText, { color: granted ? colors.green : colors.red }]}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function TravelSection({ title, travel }: { title: string; travel: Travel }) {
  const getModeLabel = (mode?: string) => {
    const modes: Record<string, string> = {
      plane: '✈️ Flight',
      train: '🚂 Train',
      car: '🚗 Car',
      bus: '🚌 Bus',
      other: 'Other',
    };
    return modes[mode || ''] || 'Unknown';
  };

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'arrived': return colors.green;
      case 'departed':
      case 'enroute': return colors.blue;
      case 'delayed': return colors.orange;
      case 'cancelled': return colors.red;
      case 'diverted': return colors.purple;
      default: return colors.gray[500];
    }
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleString();
  };

  return (
    <View style={styles.section}>
      <View style={styles.travelHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {travel.is_unaccompanied_minor && (
          <View style={styles.umBadge}>
            <Text style={styles.umBadgeText}>UM</Text>
          </View>
        )}
      </View>
      <View style={styles.sectionContent}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Mode</Text>
          <Text style={styles.infoValue}>{getModeLabel(travel.mode)}</Text>
        </View>

        {travel.mode === 'train' && (
          <>
            {(travel.train_departure_station || travel.departure_station) && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Departure Station</Text><Text style={styles.infoValue}>{travel.train_departure_station || travel.departure_station}</Text></View>
            )}
            {(travel.train_arrival_station || travel.arrival_station) && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Arrival Station</Text><Text style={styles.infoValue}>{travel.train_arrival_station || travel.arrival_station}</Text></View>
            )}
            {travel.departure_time && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Departure</Text><Text style={styles.infoValue}>{formatDateTime(travel.departure_time)}</Text></View>
            )}
            {travel.arrival_time && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Arrival</Text><Text style={styles.infoValue}>{formatDateTime(travel.arrival_time)}</Text></View>
            )}
          </>
        )}

        {travel.mode === 'car' && (
          <>
            {travel.origin_address && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>From</Text><Text style={styles.infoValue}>{travel.origin_address}</Text></View>
            )}
            {travel.expected_arrival_time && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Expected Arrival</Text><Text style={styles.infoValue}>{formatDateTime(travel.expected_arrival_time)}</Text></View>
            )}
          </>
        )}

        {travel.mode === 'bus' && (
          <>
            {travel.bus_departure_location && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>From</Text><Text style={styles.infoValue}>{travel.bus_departure_location}</Text></View>
            )}
            {travel.bus_arrival_location && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>To</Text><Text style={styles.infoValue}>{travel.bus_arrival_location}</Text></View>
            )}
            {travel.departure_time && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Departure</Text><Text style={styles.infoValue}>{formatDateTime(travel.departure_time)}</Text></View>
            )}
            {travel.arrival_time && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Arrival</Text><Text style={styles.infoValue}>{formatDateTime(travel.arrival_time)}</Text></View>
            )}
          </>
        )}

        {travel.mode === 'other' && travel.other_details && (
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Details</Text><Text style={styles.infoValue}>{travel.other_details}</Text></View>
        )}

        {travel.notes && (
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Notes</Text><Text style={styles.infoValue}>{travel.notes}</Text></View>
        )}

        {(travel.visa_required || travel.visa_status || travel.visa_type || travel.visa_number || travel.passport_nationality) && (
          <View style={styles.visaBox}>
            <Text style={styles.visaTitle}>Visa</Text>
            {travel.passport_nationality && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Passport</Text><Text style={styles.infoValue}>{travel.passport_nationality}</Text></View>
            )}
            {travel.visa_status && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Status</Text><Text style={styles.infoValue}>{travel.visa_status}</Text></View>
            )}
            {travel.visa_type && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Type</Text><Text style={styles.infoValue}>{travel.visa_type}</Text></View>
            )}
            {travel.visa_number && (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Number</Text><Text style={styles.infoValue}>{travel.visa_number}</Text></View>
            )}
          </View>
        )}

        {travel.legs && travel.legs.length > 0 && (
          <View style={styles.flightLegsContainer}>
            {travel.legs.map((leg) => (
              <View key={leg.id} style={styles.flightLeg}>
                <View style={styles.flightLegHeader}>
                  <Text style={styles.flightCode}>{leg.flight_code || 'N/A'}</Text>
                  {leg.live_status && (
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(leg.live_status) + '20' }]}>
                      <Text style={[styles.statusBadgeText, { color: getStatusColor(leg.live_status) }]}>
                        {leg.live_status}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.routeRow}>
                  <Text style={styles.airport}>{leg.departure_airport || '---'}</Text>
                  <Ionicons name="airplane" size={14} color={colors.gray[400]} style={styles.planeIcon} />
                  <Text style={styles.airport}>{leg.arrival_airport || '---'}</Text>
                </View>
                <View style={styles.flightTimes}>
                  <View style={styles.flightTimeColumn}>
                    <Text style={styles.flightTimeLabel}>Depart</Text>
                    <Text style={styles.flightTime}>
                      {formatDateTime(leg.live_departure_time || leg.departure_time) || 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.flightTimeColumn}>
                    <Text style={styles.flightTimeLabel}>Arrive</Text>
                    <Text style={styles.flightTime}>
                      {formatDateTime(leg.live_arrival_time || leg.arrival_time) || 'N/A'}
                    </Text>
                  </View>
                </View>
                {leg.airport_picked_up_at && (
                  <View style={styles.pickedUpBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.green} />
                    <Text style={styles.pickedUpText}>
                      Picked up {formatDateTime(leg.airport_picked_up_at)}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  onPress?: () => void;
  highlight?: boolean;
}

function InfoRow({ label, value, onPress, highlight }: InfoRowProps) {
  const content = (
    <View style={[styles.infoRow, highlight && styles.infoRowHighlight]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, onPress && styles.infoValueLink]}>
        {value}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
  },
  header: {
    backgroundColor: colors.glass.dark,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headshot: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 16,
  },
  headshotPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 2,
  },
  pronouns: {
    fontSize: 16,
    color: colors.text.secondary,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkedInTime: {
    marginLeft: 12,
    fontSize: 14,
    color: colors.text.secondary,
  },
  alertsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  section: {
    backgroundColor: colors.glass.dark,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  sectionContent: {},
  infoRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  infoRowHighlight: {
    backgroundColor: colors.yellow + '20',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderBottomWidth: 0,
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    color: colors.text.primary,
  },
  infoValueLink: {
    color: colors.blue,
  },
  safeguardingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  safeguardingLabel: {
    fontSize: 14,
    color: colors.text.primary,
  },
  safeguardingValue: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  actionButtons: {
    marginTop: 8,
    marginBottom: 32,
    gap: 12,
  },
  writeBadgeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.red,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  writeBadgeButtonDisabled: {
    opacity: 0.6,
  },
  writeBadgeButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  openInBrowserButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass.dark,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.blue,
    gap: 8,
  },
  openInBrowserText: {
    color: colors.blue,
    fontSize: 16,
    fontWeight: '600',
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.orange,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  undoButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  travelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  umBadge: {
    backgroundColor: colors.orange + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  umBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.orange,
  },
  flightLegsContainer: {
    marginTop: 8,
    gap: 12,
  },
  flightLeg: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
  },
  flightLegHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  flightCode: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
    color: colors.text.primary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  airport: {
    fontSize: 14,
    color: colors.text.secondary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  planeIcon: {
    marginHorizontal: 8,
  },
  flightTimes: {
    flexDirection: 'row',
    gap: 16,
  },
  flightTimeColumn: {
    flex: 1,
  },
  flightTimeLabel: {
    fontSize: 11,
    color: colors.text.muted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  flightTime: {
    fontSize: 13,
    color: colors.text.primary,
  },
  pickedUpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  pickedUpText: {
    fontSize: 13,
    color: colors.green,
    fontWeight: '500',
  },
  noteInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  noteInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text.primary,
    minHeight: 44,
    maxHeight: 100,
  },
  noteSubmitButton: {
    backgroundColor: colors.red,
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteSubmitButtonDisabled: {
    opacity: 0.5,
  },
  notesLoading: {
    padding: 16,
    alignItems: 'center',
  },
  noNotesText: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  noteCard: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  noteCardRestricted: {
    backgroundColor: colors.orange + '10',
    borderWidth: 1,
    borderColor: colors.orange + '30',
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  noteAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  noteAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  restrictedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.orange,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  restrictedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
  },
  noteTime: {
    fontSize: 11,
    color: colors.text.muted,
  },
  noteContent: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  visaBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.gray[100],
  },
  visaTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[700],
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  consentType: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
  consentMeta: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
  consentBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  consentBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  guardianCard: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  guardianHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  guardianName: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  primaryBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.red },
  primaryBadgeText: { fontSize: 9, fontWeight: '800', color: colors.white, letterSpacing: 0.5 },
  guardianStatusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  guardianStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  guardianMeta: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
  guardianLink: { fontSize: 13, color: colors.blue, marginTop: 2 },
  permRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  permChip: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  permChipOn: { backgroundColor: colors.green + '15' },
  permChipOff: { backgroundColor: colors.red + '15' },
  permChipText: { fontSize: 10, fontWeight: '700' },
  guardianContactsList: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.gray[100] },
  guardianContactsTitle: { fontSize: 11, fontWeight: '700', color: colors.gray[600], textTransform: 'uppercase', marginBottom: 4 },
  guardianContact: { marginTop: 4 },
  guardianContactName: { fontSize: 13, fontWeight: '600', color: colors.text.primary },
});
