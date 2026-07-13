import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ImageBackground,
  Image,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { VersionFooter } from '../components/VersionFooter';
import { colors } from '../theme/colors';
import type { RootStackParamList, Ticket } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ParticipantMain'>;

// Dates are shown in the event's timezone, not the device's, so the day
// doesn't shift for travellers.
function formatDate(dateString?: string, timezone?: string) {
  if (!dateString) return '';
  const opts = { month: 'short', day: 'numeric', year: 'numeric' } as const;
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      ...opts,
      timeZone: timezone || undefined,
    });
  } catch {
    try {
      return new Date(dateString).toLocaleDateString(undefined, opts);
    } catch {
      return '';
    }
  }
}

export function MyTicketsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { state, logout } = useApp();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      const fresh = await api.getMyTickets();
      setTickets(fresh);
    } catch (error) {
      // Keep whatever we already have on screen; a transient error shouldn't
      // wipe the list.
      console.error('Failed to load tickets:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadTickets();
    setIsRefreshing(false);
  }, [loadTickets]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const renderTicket = ({ item }: { item: Ticket }) => {
    const event = item.event;
    const hasBanner = !!event.banner_url;
    const startDate = formatDate(event.starts_at, event.timezone);

    const content = (
      <>
        <View style={styles.cardHeader}>
          {event.logo_url ? (
            <Image
              source={{ uri: event.logo_url }}
              style={[styles.logo, hasBanner && styles.logoOnBanner]}
              resizeMode="cover"
            />
          ) : null}
          <Text style={[styles.eventName, hasBanner && styles.textOnBanner]}>{event.name}</Text>
        </View>

        {startDate ? (
          <Text style={[styles.meta, hasBanner && styles.subTextOnBanner]}>{startDate}</Text>
        ) : null}
        {event.location_city ? (
          <Text style={[styles.meta, hasBanner && styles.subTextOnBanner]}>{event.location_city}</Text>
        ) : null}

        <View style={styles.badgeRow}>
          {item.checked_in ? (
            <View style={[styles.pill, styles.pillCheckedIn]}>
              <Text style={styles.pillCheckedInText}>Checked in</Text>
            </View>
          ) : (
            <View style={[styles.pill, hasBanner ? styles.pillOnBanner : styles.pillNeutral]}>
              <Text style={[styles.pillText, hasBanner && styles.textOnBanner]}>
                {item.display_status}
              </Text>
            </View>
          )}
          {/* Unconfirmed tickets prompt the attendee to finish registration. */}
          {!item.confirmed && (
            <View style={styles.finishHint}>
              <Text style={[styles.finishHintText, hasBanner && styles.subTextOnBanner]}>
                Tap to finish registration
              </Text>
              <Ionicons
                name="arrow-forward"
                size={13}
                color={hasBanner ? 'rgba(255,255,255,0.9)' : colors.text.muted}
              />
            </View>
          )}
        </View>
      </>
    );

    // Confirmed → open the native ticket. Unconfirmed → send them to the
    // onboarding website to complete their registration.
    const handlePress = () => {
      if (item.confirmed) {
        navigation.navigate('TicketDetail', { ticket: item });
      } else {
        Linking.openURL(item.onboarding_url).catch(() => {
          Alert.alert('Something went wrong', 'Could not open registration. Please try again.');
        });
      }
    };

    return (
      <TouchableOpacity style={styles.cardWrapper} activeOpacity={0.75} onPress={handlePress}>
        {hasBanner ? (
          <ImageBackground
            source={{ uri: event.banner_url }}
            style={styles.card}
            imageStyle={styles.cardImage}
          >
            <View style={styles.bannerScrim} />
            {content}
          </ImageBackground>
        ) : (
          <View style={[styles.card, styles.cardPlain]}>{content}</View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {/* Staff reach this screen by pushing onto the stack, so offer a way
              back to the scanner app. Participant-only users land here as the
              root and have nothing to go back to. */}
          {navigation.canGoBack() && (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={26} color={colors.red} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.headerTitle}>Hack Club Attend</Text>
            <Text style={styles.headerSubtitle}>
              {state.auth.user?.name || state.auth.user?.email}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tickets}
        renderItem={renderTicket}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.red} />
        }
        ListFooterComponent={<VersionFooter />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {isLoading ? (
              <ActivityIndicator color={colors.red} />
            ) : (
              <>
                <Text style={styles.emptyTitle}>No tickets yet</Text>
                <Text style={styles.emptyText}>
                  When you register for an event, your ticket will appear here.
                </Text>
              </>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.glass.medium,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  backButton: { marginRight: 6, marginLeft: -6 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: colors.text.primary },
  headerSubtitle: { fontSize: 14, color: colors.text.secondary, marginTop: 2 },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.glass.light,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  logoutText: { fontSize: 14, color: colors.red, fontWeight: '500' },
  list: { padding: 16, paddingBottom: 100 },
  cardWrapper: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  card: { padding: 16 },
  cardPlain: { backgroundColor: colors.glass.dark },
  cardImage: { borderRadius: 16 },
  bannerScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  logo: { width: 36, height: 36, borderRadius: 8, marginRight: 10, backgroundColor: colors.white },
  logoOnBanner: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  eventName: { fontSize: 18, fontWeight: '600', color: colors.text.primary, flex: 1 },
  meta: { fontSize: 14, color: colors.text.secondary, marginBottom: 2 },
  textOnBanner: {
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subTextOnBanner: {
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  finishHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 10 },
  finishHintText: { fontSize: 12, fontWeight: '500', color: colors.text.muted },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillNeutral: { backgroundColor: colors.gray[100] },
  pillOnBanner: { backgroundColor: 'rgba(255,255,255,0.2)' },
  pillText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  pillCheckedIn: { backgroundColor: colors.green },
  pillCheckedInText: { fontSize: 12, fontWeight: '700', color: colors.white },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 64, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text.primary, marginBottom: 6 },
  emptyText: { fontSize: 14, color: colors.text.secondary, textAlign: 'center', lineHeight: 20 },
});
