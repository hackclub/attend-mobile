import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { syncService } from '../services/sync';
import { colors } from '../theme/colors';
import type { Event, MainTabParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<MainTabParamList, 'Events'>;

export function EventListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { state, selectEvent, logout } = useApp();
  const [events, setEvents] = useState<Event[]>(state.events);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    try {
      const cached = await syncService.getCachedEvents();
      if (cached.length > 0) {
        setEvents(cached);
      }

      const fresh = await api.getEvents();
      setEvents(fresh);
      await syncService.cacheEvents(fresh);
    } catch (error) {
      const cached = await syncService.getCachedEvents();
      if (cached.length > 0) {
        setEvents(cached);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadEvents();
    setIsRefreshing(false);
  }, [loadEvents]);

  const handleSelectEvent = async (event: Event) => {
    await selectEvent(event);
    navigation.navigate('Scanner');
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return '';
    }
  };

  const renderEvent = ({ item }: { item: Event }) => {
    const isSelected = state.currentEvent?.id === item.id;
    const startDate = formatDate(item.starts_at);

    return (
      <TouchableOpacity
        style={[styles.eventCard, isSelected && styles.eventCardSelected]}
        onPress={() => handleSelectEvent(item)}
        activeOpacity={0.7}
      >
        <View style={styles.eventHeader}>
          <Text style={styles.eventName}>{item.name}</Text>
          {isSelected && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>Active</Text>
            </View>
          )}
        </View>

        {startDate ? (
          <Text style={styles.eventDate}>{startDate}</Text>
        ) : null}
        {item.location_city && (
          <Text style={styles.eventLocation}>{item.location_city}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Events</Text>
          <Text style={styles.headerSubtitle}>
            {state.auth.user?.name || state.auth.user?.email}
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {state.sync.pendingScans > 0 && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncText}>
            {state.sync.pendingScans} scan{state.sync.pendingScans !== 1 ? 's' : ''} pending sync
          </Text>
        </View>
      )}

      <FlatList
        data={events}
        renderItem={renderEvent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.red}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {isLoading ? (
              <Text style={styles.emptyText}>Loading events...</Text>
            ) : (
              <Text style={styles.emptyText}>No events available</Text>
            )}
          </View>
        }
      />
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
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.glass.light,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  logoutText: {
    fontSize: 14,
    color: colors.red,
    fontWeight: '500',
  },
  syncBanner: {
    backgroundColor: colors.orange,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  syncText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  list: {
    padding: 16,
  },
  eventCard: {
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
  eventCardSelected: {
    borderWidth: 2,
    borderColor: colors.red,
    backgroundColor: 'rgba(236, 55, 80, 0.08)',
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
  },
  selectedBadge: {
    backgroundColor: colors.red,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  selectedBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  eventDate: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  eventLocation: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.gray[200],
    borderRadius: 3,
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.green,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text.secondary,
  },
});
