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
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AlertBadge } from '../components/AlertBadge';
import { StatusBadge } from '../components/StatusBadge';
import { EmergencyContactCard } from '../components/EmergencyContactCard';
import { useApp } from '../context/AppContext';
import { useBiometric } from '../hooks/useBiometric';
import { api } from '../services/api';
import { colors } from '../theme/colors';
import type { RootStackParamList, Participant, ParticipantNote, Travel, TravelLeg } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ParticipantDetail'>;

export function ParticipantDetailScreen({ route, navigation }: Props) {
  const { participant } = route.params;
  const { state, updateParticipant } = useApp();
  const { authenticate, isEnabled } = useBiometric();
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentParticipant, setCurrentParticipant] = useState<Participant>(participant);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [notes, setNotes] = useState<ParticipantNote[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [notesSupported, setNotesSupported] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const success = await authenticate('Authenticate to view participant details');
      setIsAuthenticated(success);
      setIsAuthenticating(false);
      if (!success) {
        navigation.goBack();
      }
    }
    checkAuth();
  }, [authenticate, navigation]);

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
    if (isAuthenticated) {
      loadNotes();
    }
  }, [isAuthenticated, loadNotes]);

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
    Linking.openURL(`dialpad://${phoneNumber}`).catch(() => {
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

  const handleUndoCheckIn = () => {
    Alert.alert(
      'Undo Check-In',
      `Are you sure you want to undo the check-in for ${currentParticipant.display_name || currentParticipant.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: async () => {
            if (!state.currentEvent) return;
            setIsUndoing(true);
            try {
              await api.undoCheckIn(state.currentEvent.id, currentParticipant.participant_event_id);
              const updated = { ...currentParticipant, checked_in_at: undefined };
              setCurrentParticipant(updated);
              updateParticipant(updated);
              Alert.alert('Success', 'Check-in has been undone');
            } catch (error) {
              Alert.alert('Error', 'Failed to undo check-in');
            } finally {
              setIsUndoing(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenInBrowser = () => {
    if (!state.currentEvent) return;
    const url = `https://attend.hackclub.com/admin/events/${state.currentEvent.id}/participants/${currentParticipant.participant_event_id}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Unable to open browser');
    });
  };

  if (isAuthenticating) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.authContainer}>
          <ActivityIndicator size="large" color={colors.red} />
          <Text style={styles.authText}>Authenticating...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView 
        contentContainerStyle={styles.content}
        scrollIndicatorInsets={{ top: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.red}
            progressViewOffset={100}
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
        </Section>

        {(currentParticipant.allergies || currentParticipant.medical_conditions || currentParticipant.medications) && (
          <Section title="Medical Information">
            {currentParticipant.allergies && (
              <InfoRow label="Allergies" value={currentParticipant.allergies} highlight />
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
          </Section>
        )}

        {(currentParticipant.diet_type || currentParticipant.life_threatening_allergies) && (
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
          </Section>
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
        </Section>

        <Section title="Waiver Status">
          <View style={styles.safeguardingRow}>
            <Text style={styles.safeguardingLabel}>Waiver Signed</Text>
            <StatusBadge status={currentParticipant.waiver_signed ? 'signed' : 'unsigned'} />
          </View>
        </Section>

        {currentParticipant.parent_guardian_name && (
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
        )}

        {currentParticipant.emergency_contacts && currentParticipant.emergency_contacts.length > 0 && (
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

        {/* Notes Section */}
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

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
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
    </SafeAreaView>
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
        
        {travel.legs && travel.legs.length > 0 && (
          <View style={styles.flightLegsContainer}>
            {travel.legs.map((leg, index) => (
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  authText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text.secondary,
  },
  content: {
    padding: 16,
    paddingTop: 100, // Account for transparent header
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
});
