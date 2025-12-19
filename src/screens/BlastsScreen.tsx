import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { colors } from '../theme/colors';
import type { SlackBlast, BlastsStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<BlastsStackParamList, 'BlastsList'>;

export function BlastsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const [blasts, setBlasts] = useState<SlackBlast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadBlasts = useCallback(async () => {
    if (!state.currentEvent) return;
    try {
      const data = await api.getSlackBlasts(state.currentEvent.id);
      setBlasts(data);
    } catch (error) {
      console.error('Failed to load blasts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [state.currentEvent]);

  useEffect(() => {
    loadBlasts();
  }, [loadBlasts]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadBlasts();
    setIsRefreshing(false);
  }, [loadBlasts]);

  const handleNewBlast = () => {
    navigation.navigate('NewBlast');
  };

  const handleBlastPress = (blast: SlackBlast) => {
    navigation.navigate('BlastDetail', { blastId: blast.id });
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const getStatusColor = (status: SlackBlast['status']) => {
    switch (status) {
      case 'pending':
        return colors.orange;
      case 'in_progress':
        return colors.blue;
      case 'completed':
        return colors.green;
      case 'failed':
        return colors.red;
      default:
        return colors.gray[500];
    }
  };

  const getStatusLabel = (status: SlackBlast['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  const truncateMessage = (message: string, maxLength = 100) => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  const renderBlast = ({ item }: { item: SlackBlast }) => {
    const statusColor = getStatusColor(item.status);

    return (
      <TouchableOpacity
        style={styles.blastCard}
        onPress={() => handleBlastPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.blastHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusBadgeText}>{getStatusLabel(item.status)}</Text>
          </View>
          <Text style={styles.blastDate}>{formatDate(item.created_at)}</Text>
        </View>

        <Text style={styles.blastMessage}>{truncateMessage(item.message)}</Text>

        <View style={styles.blastFooter}>
          <Text style={styles.blastSentBy}>Sent by {item.sent_by}</Text>
          <Text style={styles.blastProgress}>
            {item.sent_count}/{item.recipient_count} sent
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (!state.currentEvent) {
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
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Blasts</Text>
          <Text style={styles.headerSubtitle}>{state.currentEvent.name}</Text>
        </View>
        <TouchableOpacity onPress={handleNewBlast} style={styles.newBlastButton}>
          <Text style={styles.newBlastText}>New Blast</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.red} size="large" />
        </View>
      ) : (
        <FlatList
          data={blasts}
          renderItem={renderBlast}
          keyExtractor={(item) => item.id}
          contentContainerStyle={blasts.length === 0 ? styles.emptyList : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.red}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="megaphone-outline" size={48} color={colors.gray[400]} />
              <Text style={styles.emptyTitle}>No blasts yet</Text>
              <Text style={styles.emptyText}>
                Tap "New Blast" to send a message to participants.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.glass.medium,
    borderBottomWidth: 0,
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
  newBlastButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.glass.light,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  newBlastText: {
    fontSize: 14,
    color: colors.blue,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyList: {
    flexGrow: 1,
  },
  blastCard: {
    backgroundColor: colors.glass.dark,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  blastHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  blastDate: {
    fontSize: 12,
    color: colors.text.muted,
  },
  blastMessage: {
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 22,
    marginBottom: 12,
  },
  blastFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blastSentBy: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  blastProgress: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    paddingTop: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
