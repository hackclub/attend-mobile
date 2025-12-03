import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AlertBadge } from '../components/AlertBadge';
import { StatusBadge } from '../components/StatusBadge';
import { EmergencyContactCard } from '../components/EmergencyContactCard';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { colors } from '../theme/colors';
import type { RootStackParamList, Participant } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ParticipantDetail'>;

export function ParticipantDetailScreen({ route, navigation }: Props) {
  const { participant } = route.params;
  const { state, updateParticipant } = useApp();
  const [isUndoing, setIsUndoing] = useState(false);
  const [currentParticipant, setCurrentParticipant] = useState<Participant>(participant);

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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
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

        {currentParticipant.emergency_contacts && currentParticipant.emergency_contacts.length > 0 && (
          <Section title="Emergency Contacts">
            {currentParticipant.emergency_contacts.map((contact, index) => (
              <EmergencyContactCard key={contact.id || `contact-${index}`} contact={contact} />
            ))}
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
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
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
});
