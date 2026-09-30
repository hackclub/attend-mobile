import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Switch,
  TextInput,
  Platform,
  ImageBackground,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useBiometric } from '../hooks/useBiometric';
import { useEventAccess } from '../hooks/useEventAccess';
import { api } from '../services/api';
import { syncService } from '../services/sync';
import { eventRoleLabel } from '../services/eventRoles';
import { liveActivityService } from '../services/liveActivity';
import { VersionFooter } from '../components/VersionFooter';
import { colors } from '../theme/colors';
import { ScreenHeader, SearchField, cardSurface, ui } from '../components/ui';
import type { Event, MainTabParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<MainTabParamList, 'Events'>;

export function EventListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { state, selectEvent, setEvents: setContextEvents, logout, startLiveActivity, stopLiveActivity } = useApp();
  const { isAvailable, isEnabled, biometricType, toggleEnabled } = useBiometric();
  const {
    roleLabel,
    roleSummary,
    canViewParticipantRecords,
    canViewParticipantPii,
  } = useEventAccess();
  // Say once, in one place, why the selected event shows less than usual —
  // otherwise a missing birthday or a missing tab reads as a bug.
  const showRoleNotice = !!roleLabel
    && !!roleSummary
    && (!canViewParticipantRecords || !canViewParticipantPii);
  const [events, setEvents] = useState<Event[]>(state.events);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [liveActivityRunning, setLiveActivityRunning] = useState(false);
  const liveActivitySupported = Platform.OS === 'ios' && liveActivityService.isSupported();

  useEffect(() => {
    console.log('[LiveActivity] Checking support:', {
      platform: Platform.OS,
      supported: liveActivitySupported,
      currentEvent: state.currentEvent?.name,
    });
    setLiveActivityRunning(liveActivityService.isRunning());
  }, [state.currentEvent, liveActivitySupported]);

  const handleToggleLiveActivity = async () => {
    console.log('[LiveActivity] Toggle pressed, currently running:', liveActivityRunning);
    if (liveActivityRunning) {
      await stopLiveActivity();
      setLiveActivityRunning(false);
    } else {
      console.log('[LiveActivity] Starting...');
      await startLiveActivity();
      const isNowRunning = liveActivityService.isRunning();
      console.log('[LiveActivity] After start, running:', isNowRunning);
      setLiveActivityRunning(isNowRunning);
    }
  };

  const loadEvents = useCallback(async () => {
    const cacheGeneration = syncService.getCacheGeneration();
    try {
      const cached = await syncService.getCachedEvents();
      if (cached.length > 0) {
        setEvents(cached);
      }

      const fresh = await api.getEvents();
      setEvents(fresh);
      // Share them with the app state too: each event carries the caller's role
      // on it, which decides what the other tabs offer for the selected event.
      setContextEvents(fresh);
      await syncService.cacheEvents(fresh, cacheGeneration);
    } catch (error) {
      const cached = await syncService.getCachedEvents();
      if (cached.length > 0) {
        setEvents(cached);
      }
    } finally {
      setIsLoading(false);
    }
  }, [setContextEvents]);

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

  // Shown in the event's timezone so the date matches the event schedule.
  // Friendly form ("Fri 28 Aug"), with the year only when it isn't this year.
  const formatDate = (dateString?: string, timezone?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const sameYear = date.getFullYear() === new Date().getFullYear();
    try {
      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
        timeZone: timezone || undefined,
      }).format(date);
    } catch {
      return date.toLocaleDateString();
    }
  };

  // An event is considered finished once its end date has passed (matches the
  // backend's Event#completed? which compares ends_at.to_date < Date.current).
  const isFinished = (event: Event): boolean => {
    if (!event.ends_at) return false;
    const ends = new Date(event.ends_at);
    if (isNaN(ends.getTime())) return false;
    const today = new Date();
    const endDay = new Date(ends.getFullYear(), ends.getMonth(), ends.getDate());
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return endDay < startOfToday;
  };

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const matchesSearch = (event: Event) => {
    if (!trimmedQuery) return true;
    const haystack = [event.name, event.location_city, event.slug]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return trimmedQuery.split(/\s+/).every((term) => haystack.includes(term));
  };

  const visibleEvents = events.filter((event) => !isFinished(event) && matchesSearch(event));

  const renderEvent = ({ item }: { item: Event }) => {
    const isSelected = state.currentEvent?.id === item.id;
    const startDate = formatDate(item.starts_at, item.timezone);
    const hasBanner = !!item.banner_url;
    // Absent on older servers, and null for a role this build doesn't know.
    const roleLabel = eventRoleLabel(item.role);

    const content = (
      <>
        <View style={styles.eventHeader}>
          {item.logo_url ? (
            <Image
              source={{ uri: item.logo_url }}
              style={[styles.eventLogo, hasBanner && styles.eventLogoOnBanner]}
              resizeMode="cover"
            />
          ) : null}
          <Text style={[styles.eventName, hasBanner && styles.textOnBanner]}>
            {item.name}
          </Text>
          {isSelected && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>Active</Text>
            </View>
          )}
        </View>

        {startDate ? (
          <Text style={[styles.eventDate, hasBanner && styles.subTextOnBanner]}>
            {startDate}
          </Text>
        ) : null}
        {item.location_city && (
          <Text style={[styles.eventLocation, hasBanner && styles.subTextOnBanner]}>
            {item.location_city}
          </Text>
        )}
        {roleLabel ? (
          <View style={[styles.roleBadge, hasBanner && styles.roleBadgeOnBanner]}>
            <Text style={[styles.roleBadgeText, hasBanner && styles.textOnBanner]}>
              {roleLabel}
            </Text>
          </View>
        ) : null}
      </>
    );

    return (
      <TouchableOpacity
        style={[styles.eventCardWrapper, isSelected && styles.eventCardSelected]}
        onPress={() => handleSelectEvent(item)}
        activeOpacity={0.7}
      >
        {hasBanner ? (
          <ImageBackground
            source={{ uri: item.banner_url }}
            style={styles.eventCard}
            imageStyle={styles.eventCardImage}
          >
            {/* dark scrim keeps the text readable over any banner */}
            <View style={styles.bannerScrim} />
            {content}
          </ImageBackground>
        ) : (
          <View style={[styles.eventCard, styles.eventCardPlain]}>{content}</View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Events"
        subtitle={state.auth.user?.name || state.auth.user?.email}
        right={
          <View style={styles.headerActions}>
            {state.auth.user?.is_participant && (
              <TouchableOpacity
                onPress={() => navigation.getParent()?.navigate('ParticipantMain' as never)}
                style={ui.headerAction}
              >
                <Ionicons name="ticket-outline" size={15} color={colors.gray[700]} />
                <Text style={ui.headerActionText}>Tickets</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleLogout} style={ui.headerAction}>
              <Text style={[ui.headerActionText, ui.headerActionTextDestructive]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {showRoleNotice && (
        <View style={styles.roleNotice}>
          <Ionicons name="information-circle-outline" size={20} color={colors.gray[600]} />
          <View style={styles.roleNoticeText}>
            <Text style={styles.roleNoticeTitle}>
              {roleLabel} on {state.currentEvent?.name}
            </Text>
            <Text style={styles.roleNoticeBody}>
              {roleSummary}
              {canViewParticipantRecords
                ? ''
                : ' Participant records are not available for this role.'}
            </Text>
          </View>
        </View>
      )}

      {state.sync.pendingScans > 0 && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncText}>
            {state.sync.pendingScans} scan{state.sync.pendingScans !== 1 ? 's' : ''} pending sync
          </Text>
        </View>
      )}

      {isAvailable && (
        <View style={styles.securitySection}>
          <View style={styles.securityRow}>
            <View style={styles.securityInfo}>
              <Ionicons 
                name={biometricType === 'Face ID' ? 'scan' : 'finger-print'} 
                size={22} 
                color={colors.blue} 
              />
              <View style={styles.securityTextContainer}>
                <Text style={styles.securityTitle}>{biometricType}</Text>
                <Text style={styles.securitySubtitle}>
                  Protect participant details
                </Text>
              </View>
            </View>
            <Switch
              value={isEnabled}
              onValueChange={() => { toggleEnabled(); }}
              trackColor={{ false: colors.gray[300], true: colors.blue }}
              thumbColor={colors.white}
            />
          </View>
        </View>
      )}

      {liveActivitySupported && state.currentEvent && (
        <View style={styles.liveActivitySection}>
          <View style={styles.securityRow}>
            <View style={styles.securityInfo}>
              <Ionicons name="pulse" size={22} color={colors.red} />
              <View style={styles.securityTextContainer}>
                <Text style={styles.securityTitle}>Live Activity</Text>
                <Text style={styles.securitySubtitle}>
                  Show check-in progress on Lock Screen
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.liveActivityButton,
                liveActivityRunning && styles.liveActivityButtonActive,
              ]}
              onPress={handleToggleLiveActivity}
            >
              <Text style={[
                styles.liveActivityButtonText,
                liveActivityRunning && styles.liveActivityButtonTextActive,
              ]}>
                {liveActivityRunning ? 'Stop' : 'Start'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <SearchField
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search events"
      />

      <FlatList
        data={visibleEvents}
        renderItem={renderEvent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.red}
          />
        }
        ListFooterComponent={<VersionFooter />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {isLoading ? (
              <Text style={styles.emptyText}>Loading events...</Text>
            ) : trimmedQuery ? (
              <Text style={styles.emptyText}>No events match “{searchQuery.trim()}”</Text>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  securitySection: {
    ...cardSurface,
    marginHorizontal: 16,
    marginTop: 12,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  securityTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  securityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  securitySubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  list: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  eventCardWrapper: {
    ...cardSurface,
    marginBottom: 12,
    overflow: 'hidden',
  },
  eventCard: {
    padding: 16,
  },
  eventCardPlain: {
    backgroundColor: colors.white,
  },
  eventCardImage: {
    borderRadius: 16,
  },
  bannerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  eventCardSelected: {
    borderWidth: 2,
    borderColor: colors.red,
  },
  eventLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: colors.white,
  },
  eventLogoOnBanner: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  textOnBanner: {
    color: colors.white,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subTextOnBanner: {
    color: 'rgba(255, 255, 255, 0.9)',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
  roleNotice: {
    ...cardSurface,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  roleNoticeText: {
    flex: 1,
    gap: 2,
  },
  roleNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  roleNoticeBody: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.gray[100],
  },
  roleBadgeOnBanner: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
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
  liveActivitySection: {
    ...cardSurface,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
  },
  liveActivityButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.red,
    borderRadius: 8,
  },
  liveActivityButtonActive: {
    backgroundColor: colors.gray[200],
  },
  liveActivityButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  liveActivityButtonTextActive: {
    color: colors.text.primary,
  },
});
