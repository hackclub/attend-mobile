import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import type { EmergencyContact } from '../types';

interface EmergencyContactCardProps {
  contact: EmergencyContact;
  onCall: (phone: string) => void;
  onEmail: (email: string) => void;
}

export function EmergencyContactCard({ contact, onCall, onEmail }: EmergencyContactCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{contact.name}</Text>
        {contact.isPrimary && (
          <View style={styles.primaryBadge}>
            <Text style={styles.primaryText}>Primary</Text>
          </View>
        )}
      </View>

      <Text style={styles.relationship}>{contact.relationship}</Text>

      <View style={styles.actions}>
        <View style={styles.callButton}>
          <Ionicons name="call" size={16} color={colors.white} />
          <Text
            style={styles.callButtonText}
            selectable
            onPress={() => onCall(contact.phone)}
            accessibilityRole="link"
            accessibilityHint="Shows calling options"
          >
            {contact.phone}
          </Text>
        </View>

        {contact.email && (
          <View style={styles.emailButton}>
            <Ionicons name="mail" size={16} color={colors.white} />
            <Text
              style={styles.emailButtonText}
              selectable
              onPress={() => onEmail(contact.email!)}
              accessibilityRole="link"
              accessibilityHint="Opens the default email app"
            >
              {contact.email}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
  },
  primaryBadge: {
    backgroundColor: colors.blue,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  primaryText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
  relationship: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 12,
  },
  actions: {
    gap: 8,
  },
  callButton: {
    flexDirection: 'row',
    backgroundColor: colors.green,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  callButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  emailButton: {
    flexDirection: 'row',
    backgroundColor: colors.blue,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  emailButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
});
