import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { colors } from '../theme/colors';
import type { EmergencyContact } from '../types';

interface EmergencyContactCardProps {
  contact: EmergencyContact;
}

export function EmergencyContactCard({ contact }: EmergencyContactCardProps) {
  const handleCall = () => {
    const phoneNumber = contact.phone.replace(/[^0-9+]/g, '');
    const url = `tel:${phoneNumber}`;
    
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          Alert.alert('Error', 'Phone calls are not supported on this device');
        }
      })
      .catch(() => {
        Alert.alert('Error', 'Unable to make phone call');
      });
  };

  const handleEmail = () => {
    if (!contact.email) return;
    
    const url = `mailto:${contact.email}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Unable to open email client');
    });
  };

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
        <TouchableOpacity style={styles.callButton} onPress={handleCall}>
          <Text style={styles.callButtonText}>📞 {contact.phone}</Text>
        </TouchableOpacity>

        {contact.email && (
          <TouchableOpacity style={styles.emailButton} onPress={handleEmail}>
            <Text style={styles.emailButtonText}>✉️ Email</Text>
          </TouchableOpacity>
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
    flexDirection: 'row',
    gap: 8,
  },
  callButton: {
    flex: 1,
    backgroundColor: colors.green,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  callButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  emailButton: {
    backgroundColor: colors.blue,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  emailButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
});
