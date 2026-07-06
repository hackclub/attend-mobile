import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { asyncStorage } from '../services/storage';
import {
  PRESET_VIEWS,
  viewSignature,
  newRuleId,
  type FilterRule,
  type Conjunction,
  type SortRule,
  type SavedView,
} from '../services/participantFilters';

const VIEWS_KEY = (eventId: string) => `participant_views_${eventId}`;
const STATE_KEY = (eventId: string) => `participant_filter_state_${eventId}`;

interface PersistedState {
  rules: FilterRule[];
  conjunction: Conjunction;
  sort: SortRule | null;
}

export function useParticipantViews(eventId: string | undefined) {
  const [rules, setRulesState] = useState<FilterRule[]>([]);
  const [conjunction, setConjunctionState] = useState<Conjunction>('and');
  const [sort, setSortState] = useState<SortRule | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  // Which event's persisted state has finished loading (state, so the persist effect re-runs)
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  // Set when the user edits filters before hydration finishes, so load() doesn't clobber them
  const dirty = useRef(false);

  const setRules = useCallback((next: FilterRule[]) => {
    dirty.current = true;
    setRulesState(next);
  }, []);
  const setConjunction = useCallback((next: Conjunction) => {
    dirty.current = true;
    setConjunctionState(next);
  }, []);
  const setSort = useCallback((next: SortRule | null) => {
    dirty.current = true;
    setSortState(next);
  }, []);

  // Load saved views + last working state when the event changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setHydratedFor(null);
      dirty.current = false;
      setRulesState([]);
      setConjunctionState('and');
      setSortState(null);
      setSavedViews([]);
      if (!eventId) return;

      try {
        const [views, state] = await Promise.all([
          asyncStorage.get<SavedView[]>(VIEWS_KEY(eventId)),
          asyncStorage.get<PersistedState>(STATE_KEY(eventId)),
        ]);
        if (cancelled) return;

        setSavedViews(views ?? []);
        if (!dirty.current) {
          setRulesState(state?.rules ?? []);
          setConjunctionState(state?.conjunction ?? 'and');
          setSortState(state?.sort ?? null);
        }
      } catch (error) {
        console.error('Failed to load participant views:', error);
      } finally {
        // Enable persistence even if the read failed, so new edits still save
        if (!cancelled) setHydratedFor(eventId);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Persist working state so filters survive app restarts
  useEffect(() => {
    if (!eventId || hydratedFor !== eventId) return;
    asyncStorage
      .set(STATE_KEY(eventId), { rules, conjunction, sort } satisfies PersistedState)
      .catch(error => console.error('Failed to persist filter state:', error));
  }, [eventId, hydratedFor, rules, conjunction, sort]);

  const allViews = useMemo(() => [...PRESET_VIEWS, ...savedViews], [savedViews]);

  const activeViewId = useMemo(() => {
    const sig = viewSignature(rules, conjunction, sort);
    return allViews.find(v => viewSignature(v.rules, v.conjunction, v.sort) === sig)?.id ?? null;
  }, [allViews, rules, conjunction, sort]);

  const applyView = useCallback((view: SavedView) => {
    // Clone rules so edits to the working set never mutate the saved view
    setRules(view.rules.map(r => ({ ...r, id: newRuleId() })));
    setConjunction(view.conjunction);
    setSort(view.sort ? { ...view.sort } : null);
  }, []);

  const saveView = useCallback(
    (name: string) => {
      if (!eventId) return;
      const view: SavedView = {
        id: newRuleId(),
        name: name.trim(),
        rules: rules.map(r => ({ ...r })),
        conjunction,
        sort: sort ? { ...sort } : null,
      };
      setSavedViews(prev => {
        const next = [...prev, view];
        asyncStorage.set(VIEWS_KEY(eventId), next);
        return next;
      });
    },
    [eventId, rules, conjunction, sort],
  );

  const deleteView = useCallback(
    (viewId: string) => {
      if (!eventId) return;
      setSavedViews(prev => {
        const next = prev.filter(v => v.id !== viewId);
        asyncStorage.set(VIEWS_KEY(eventId), next);
        return next;
      });
    },
    [eventId],
  );

  const clearFilters = useCallback(() => {
    setRules([]);
    setConjunction('and');
    setSort(null);
  }, []);

  return {
    rules,
    setRules,
    conjunction,
    setConjunction,
    sort,
    setSort,
    savedViews,
    allViews,
    activeViewId,
    applyView,
    saveView,
    deleteView,
    clearFilters,
  };
}
