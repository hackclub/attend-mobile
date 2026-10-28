import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useParticipants } from '../hooks/useParticipants';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { ParticipantRow } from '../components/ParticipantRow';
import { SplitView } from '../components/SplitView';
import { ParticipantDetailContent } from './ParticipantDetailContent';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { RootStackParamList, Participant } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function CheckedInScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NavigationProp>();
  const { useSplitView } = useResponsiveLayout();
  const { checkedInParticipants, isRefreshing, refresh, currentEvent } = useParticipants();
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);

  useEffect(() => {
    setSelectedParticipant(null);
  }, [currentEvent?.id]);

  const handleParticipantPress = (participant: Participant) => {
    if (useSplitView) {
      setSelectedParticipant(participant);
    } else {
      navigation.navigate('ParticipantDetail', { participant });
    }
  };

  const sortedParticipants = [...checkedInParticipants].sort((a, b) => {
    const aTime = a.checked_in_at ? new Date(a.checked_in_at).getTime() : 0;
    const bTime = b.checked_in_at ? new Date(b.checked_in_at).getTime() : 0;
    return bTime - aTime;
  });

  if (!currentEvent) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Event Selected</Text>
          <Text style={styles.emptyText}>
            Please select an event from the Events tab.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const sidebar = (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Checked In</Text>
        <Text style={styles.headerSubtitle}>
          {checkedInParticipants.length} participant{checkedInParticipants.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={sortedParticipants}
        renderItem={({ item }) => (
          <ParticipantRow
            participant={item}
            onPress={() => handleParticipantPress(item)}
            selected={useSplitView && selectedParticipant?.participant_event_id === item.participant_event_id}
          />
        )}
        keyExtractor={(item, index) => item.participant_id || item.participant_event_id || `item-${index}`}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={colors.text.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Check-Ins Yet</Text>
            <Text style={styles.emptyText}>
              Scan participant QR codes to check them in.
            </Text>
          </View>
        }
        contentContainerStyle={sortedParticipants.length === 0 ? styles.emptyList : styles.listContent}
      />
    </View>
  );

  if (useSplitView) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <SplitView
          sidebar={sidebar}
          detail={selectedParticipant ? (
            <ParticipantDetailContent
              participant={selectedParticipant}
              topInset={16}
              bottomInset={100}
            />
          ) : null}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {sidebar}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.surface,
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
  },
  emptyList: {
    flexGrow: 1,
  },
  listContent: {
    paddingBottom: 100,
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
