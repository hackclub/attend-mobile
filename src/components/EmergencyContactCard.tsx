import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Badge, KeyValue } from './ui';
import type { EmergencyContact } from '../types';

interface EmergencyContactCardProps {
  contact: EmergencyContact;
  onCall: (phone: string) => void;
  onEmail: (email: string) => void;
}

/** One emergency contact inside a Container: name, relationship and tappable phone / email. */
export function EmergencyContactCard({ contact, onCall, onEmail }: EmergencyContactCardProps) {
  const { tokens, type } = useTheme();
  const link = (value: string, onPress: () => void, hint: string) => (
    <Text
      style={[type.body, { color: tokens.accent }]}
      selectable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityHint={hint}
    >
      {value}
    </Text>
  );

  return (
    <View>
      <View style={styles.header}>
        <Text style={[type.h3, styles.name, { color: tokens.textH }]}>{contact.name}</Text>
        {contact.is_primary && <Badge label="Primary" color="blue" />}
      </View>
      {contact.relationship ? (
        <Text style={[type.body, styles.relationship, { color: tokens.text2 }]}>{contact.relationship}</Text>
      ) : null}
      <KeyValue label="Phone" value={link(contact.phone, () => onCall(contact.phone), 'Shows calling options')} />
      {contact.email && (
        <KeyValue label="Email" value={link(contact.email, () => onEmail(contact.email!), 'Opens the default email app')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  name: { flexShrink: 1 },
  relationship: { marginBottom: 2 },
});
