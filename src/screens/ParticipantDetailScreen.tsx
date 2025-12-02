import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlertBadge } from '../components/AlertBadge';
import { StatusBadge } from '../components/StatusBadge';
import { EmergencyContactCard } from '../components/EmergencyContactCard';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ParticipantDetail'>;

export function ParticipantDetailScreen({ route }: Props) {
  const { participant } = route.params;

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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name}>{participant.full_name}</Text>
          {participant.pronouns && (
            <Text style={styles.pronouns}>({participant.pronouns})</Text>
          )}
          <View style={styles.statusRow}>
            <StatusBadge status={participant.checked_in_at ? 'checkedIn' : 'pending'} />
            {participant.checked_in_at && (
              <Text style={styles.checkedInTime}>
                {formatDateTime(participant.checked_in_at)}
              </Text>
            )}
          </View>
        </View>

        {(participant.has_anaphylaxis_risk || participant.high_support_flag) && (
          <View style={styles.alertsSection}>
            {participant.has_anaphylaxis_risk && (
              <AlertBadge type="anaphylaxis" label="⚠️ Anaphylaxis Risk" />
            )}
            {participant.high_support_flag && (
              <AlertBadge type="highSupport" label="⚠️ High Support Needs" />
            )}
          </View>
        )}

        <Section title="Contact Information">
          <InfoRow label="Email" value={participant.email} onPress={() => handleEmail(participant.email)} />
          {participant.phone && (
            <InfoRow label="Phone" value={participant.phone} onPress={() => handleCall(participant.phone!)} />
          )}
        </Section>

        {(participant.allergies || participant.medical_conditions || participant.medications) && (
          <Section title="Medical Information">
            {participant.allergies && (
              <InfoRow label="Allergies" value={participant.allergies} highlight />
            )}
            {participant.medical_conditions && (
              <InfoRow label="Medical Conditions" value={participant.medical_conditions} highlight />
            )}
            {participant.medications && (
              <InfoRow label="Medications" value={participant.medications} />
            )}
            {participant.requires_refrigeration && (
              <InfoRow label="Refrigeration Required" value="Yes" highlight />
            )}
          </Section>
        )}

        {(participant.diet_type || participant.life_threatening_allergies) && (
          <Section title="Dietary Requirements">
            {participant.diet_type && (
              <InfoRow label="Diet Type" value={participant.diet_type} />
            )}
            {participant.life_threatening_allergies && (
              <InfoRow label="Life-Threatening Allergies" value={participant.life_threatening_allergies} highlight />
            )}
            {participant.cross_contamination_risk && (
              <InfoRow label="Cross Contamination Risk" value="Yes" highlight />
            )}
          </Section>
        )}

        <Section title="Safeguarding">
          <View style={styles.safeguardingRow}>
            <Text style={styles.safeguardingLabel}>Freedom Waiver</Text>
            <StatusBadge status={participant.freedom_waiver_granted ? 'signed' : 'unsigned'} />
          </View>
          <View style={styles.safeguardingRow}>
            <Text style={styles.safeguardingLabel}>High Support Needs</Text>
            <Text style={styles.safeguardingValue}>
              {participant.high_support_flag ? 'Yes' : 'No'}
            </Text>
          </View>
          <View style={styles.safeguardingRow}>
            <Text style={styles.safeguardingLabel}>Can Leave Unaccompanied</Text>
            <Text style={styles.safeguardingValue}>
              {participant.can_leave_unaccompanied ? 'Yes' : 'No'}
            </Text>
          </View>
        </Section>

        <Section title="Waiver Status">
          <View style={styles.safeguardingRow}>
            <Text style={styles.safeguardingLabel}>Waiver Signed</Text>
            <StatusBadge status={participant.waiver_signed ? 'signed' : 'unsigned'} />
          </View>
        </Section>

        {participant.emergency_contacts && participant.emergency_contacts.length > 0 && (
          <Section title="Emergency Contacts">
            {participant.emergency_contacts.map((contact, index) => (
              <EmergencyContactCard key={contact.id || `contact-${index}`} contact={contact} />
            ))}
          </Section>
        )}
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
});
