import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useParticipants } from '../hooks/useParticipants';
import { ParticipantRow } from '../components/ParticipantRow';
import { colors } from '../theme/colors';
import type { RootStackParamList, Participant } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SearchScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    search,
    clearSearch,
    searchQuery,
    searchResults,
    isSearching,
    currentEvent,
    participants,
  } = useParticipants();
  const [inputValue, setInputValue] = useState('');

  const handleSearch = useCallback((text: string) => {
    setInputValue(text);
    if (text.length >= 2) {
      search(text);
    } else if (text.length === 0) {
      clearSearch();
    }
  }, [search, clearSearch]);

  const handleClear = useCallback(() => {
    setInputValue('');
    clearSearch();
    Keyboard.dismiss();
  }, [clearSearch]);

  const handleParticipantPress = (participant: Participant) => {
    navigation.navigate('ParticipantDetail', { participant });
  };

  const displayedParticipants = searchResults ?? participants;

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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>
        <Text style={styles.headerSubtitle}>{currentEvent.name}</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={colors.text.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email..."
            placeholderTextColor={colors.text.muted}
            value={inputValue}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {inputValue.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color={colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isSearching && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.red} />
        </View>
      )}

      <FlatList
        data={displayedParticipants}
        renderItem={({ item }) => (
          <ParticipantRow
            participant={item}
            onPress={() => handleParticipantPress(item)}
          />
        )}
        keyExtractor={(item, index) => item.participant_id || item.participant_event_id || `item-${index}`}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {searchQuery.length >= 2 ? (
              <>
                <Text style={styles.emptyTitle}>No Results</Text>
                <Text style={styles.emptyText}>
                  No participants found matching "{searchQuery}"
                </Text>
              </>
            ) : searchQuery.length > 0 ? (
              <Text style={styles.emptyText}>
                Type at least 2 characters to search
              </Text>
            ) : (
              <>
                <Text style={styles.emptyTitle}>Search Participants</Text>
                <Text style={styles.emptyText}>
                  Search by name or email address
                </Text>
              </>
            )}
          </View>
        }
        contentContainerStyle={displayedParticipants.length === 0 ? styles.emptyList : undefined}
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
  searchContainer: {
    padding: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text.primary,
  },
  clearButton: {
    padding: 8,
  },
  clearButtonText: {
    fontSize: 16,
    color: colors.text.muted,
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
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
  emptyList: {
    flexGrow: 1,
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
