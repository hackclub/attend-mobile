import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { canViewParticipantRecords } from '../services/eventAccess';
import { activeParticipants as filterActive } from '../services/participantStatus';
import { searchRoster } from '../services/participantFilters';
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

  // The synced roster still includes withdrawn and rejected registrations;
  // everything that counts or lists attendees works from the active subset.
  const activeParticipants = useMemo(() => filterActive(participants), [participants]);

  const checkedInParticipants = useMemo(() => {
    return activeParticipants.filter(p => p.checked_in_at);
  }, [activeParticipants]);

  const notCheckedInParticipants = useMemo(() => {
    return activeParticipants.filter(p => !p.checked_in_at);
  }, [activeParticipants]);

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

  // Searches the roster on the phone first: instant, offline, and in the
  // list's own order. Attend is asked only when nobody here matches (the
  // roster may still be syncing, or the person was added since).
  const search = useCallback(async (query: string) => {
    setSearchQuery(query);
    const normalizedQuery = query.trim();
    const generation = ++searchGenerationRef.current;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;

    if (normalizedQuery.length === 0) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    if (!currentEvent) return;

    // A role without participant records has nothing to search: no request,
    // and no local fallback either, because the roster is empty by design.
    if (!canViewParticipantRecords(currentEvent)) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const localResults = searchRoster(participants, normalizedQuery);
    if (localResults.length > 0 || normalizedQuery.length < 2) {
      setSearchResults(localResults);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchResults([]);
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
      // Offline or failed: the local miss stands.
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
    activeParticipants,
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
