import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import type { Participant } from '../types';

export function useParticipants() {
  const { state, refreshParticipants, updateParticipant } = useApp();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Participant[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchGenerationRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);

  const participants = state.participants;
  const currentEvent = state.currentEvent;

  const checkedInParticipants = useMemo(() => {
    return participants.filter(p => p.checked_in_at);
  }, [participants]);

  const notCheckedInParticipants = useMemo(() => {
    return participants.filter(p => !p.checked_in_at);
  }, [participants]);

  useEffect(() => {
    searchGenerationRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearchQuery('');
    setSearchResults(null);
    setIsSearching(false);
  }, [currentEvent?.id]);

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
    const normalizedQuery = query.trim();
    const generation = ++searchGenerationRef.current;
    searchAbortRef.current?.abort();

    if (normalizedQuery.length < 2) {
      searchAbortRef.current = null;
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    if (!currentEvent) return;

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setIsSearching(true);
    try {
      const results = await api.searchParticipants(
        currentEvent.id,
        normalizedQuery,
        controller.signal
      );
      if (controller.signal.aborted || searchGenerationRef.current !== generation) return;
      setSearchResults(results);
    } catch {
      if (controller.signal.aborted || searchGenerationRef.current !== generation) return;
      const lowerQuery = normalizedQuery.toLowerCase();
      const localResults = participants.filter(p => {
        const fullName = p.full_name.toLowerCase();
        const preferredName = p.display_name.toLowerCase();
        const email = p.email.toLowerCase();
        return (
          fullName.includes(lowerQuery) ||
          preferredName.includes(lowerQuery) ||
          email.includes(lowerQuery)
        );
      });
      setSearchResults(localResults);
    } finally {
      if (searchGenerationRef.current === generation) {
        searchAbortRef.current = null;
        setIsSearching(false);
      }
    }
  }, [currentEvent, participants]);

  const clearSearch = useCallback(() => {
    searchGenerationRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearchQuery('');
    setSearchResults(null);
    setIsSearching(false);
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
