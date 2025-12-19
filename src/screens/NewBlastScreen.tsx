import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { colors } from '../theme/colors';
import type { BlastsStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<BlastsStackParamList>;

export function NewBlastScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const { currentEvent, participants } = state;

  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const recipientCount = participants.length;
  const isDisabled = message.trim().length === 0 || isSending;

  const handleSend = () => {
    Alert.alert(
      'Confirm Send',
      `This will send a Slack message to ${recipientCount} participant${recipientCount !== 1 ? 's' : ''}. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: sendBlast },
      ]
    );
  };

  const sendBlast = async () => {
    if (!currentEvent) return;

    setIsSending(true);
    try {
      await api.createSlackBlast(currentEvent.id, message.trim());
      navigation.navigate('BlastsList');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  if (!currentEvent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Event Selected</Text>
          <Text style={styles.emptyText}>
            Please select an event from the Events tab.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>New Blast</Text>
          <Text style={styles.headerSubtitle}>{currentEvent.name}</Text>
        </View>

        <View style={styles.content}>
          <TextInput
            style={styles.input}
            placeholder="Enter your message to all participants..."
            placeholderTextColor={colors.text.muted}
            value={message}
            onChangeText={setMessage}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{message.length} characters</Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.sendButton, isDisabled && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={isDisabled}
            activeOpacity={0.7}
          >
            {isSending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.sendButtonText}>Send Blast</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    minHeight: 150,
    fontSize: 16,
    color: colors.text.primary,
  },
  charCount: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 8,
    textAlign: 'right',
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
  },
  sendButton: {
    backgroundColor: colors.blue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.gray[300],
  },
  sendButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
