import { useState, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import type { Participant } from '../types';

export function useParticipants() {
  const { state, refreshParticipants, updateParticipant } = useApp();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Participant[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const participants = state.participants;
  const currentEvent = state.currentEvent;

  const checkedInParticipants = useMemo(() => {
    return participants.filter(p => p.checked_in_at);
  }, [participants]);

  const notCheckedInParticipants = useMemo(() => {
    return participants.filter(p => !p.checked_in_at);
  }, [participants]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshParticipants();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshParticipants]);

  const search = useCallback(async (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    if (!currentEvent) return;

    setIsSearching(true);
    try {
      const results = await api.searchParticipants(currentEvent.id, query);
      setSearchResults(results);
    } catch {
      const lowerQuery = query.toLowerCase();
      const localResults = participants.filter(p => {
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        const preferredName = p.preferredName?.toLowerCase() ?? '';
        const email = p.email.toLowerCase();
        return (
          fullName.includes(lowerQuery) ||
          preferredName.includes(lowerQuery) ||
          email.includes(lowerQuery)
        );
      });
      setSearchResults(localResults);
    } finally {
      setIsSearching(false);
    }
  }, [currentEvent, participants]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults(null);
  }, []);

  const getParticipantById = useCallback((id: string): Participant | undefined => {
    return participants.find(p => p.participant_event_id === id || p.participant_id === id);
  }, [participants]);

  const markAsCheckedIn = useCallback((participantId: string) => {
    const participant = participants.find(p => p.participant_event_id === participantId || p.participant_id === participantId);
    if (participant) {
      updateParticipant({
        ...participant,
        checked_in_at: new Date().toISOString(),
      });
    }
  }, [participants, updateParticipant]);

  return {
    participants,
    checkedInParticipants,
    notCheckedInParticipants,
    isRefreshing,
    refresh: handleRefresh,
    search,
    clearSearch,
    searchQuery,
    searchResults,
    isSearching,
    getParticipantById,
    markAsCheckedIn,
    currentEvent,
  };
}
