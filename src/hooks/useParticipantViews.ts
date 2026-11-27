import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { asyncStorage } from '../services/storage';
import {
  EMPTY_BASIC,
  viewSignature,
  newRuleId,
  type BasicFilters,
  type FilterRule,
  type Conjunction,
  type QuickFilter,
  type SortRule,
  type SavedView,
} from '../services/participantFilters';

const VIEWS_KEY = (eventId: string) => `participant_views_${eventId}`;
const STATE_KEY = (eventId: string) => `participant_filter_state_${eventId}`;

interface PersistedState {
  rules: FilterRule[];
  conjunction: Conjunction;
  sort: SortRule | null;
  /** Both absent in state saved before the chip row. */
  quick?: QuickFilter;
  basic?: BasicFilters;
}

function cloneBasic(basic: BasicFilters | undefined): BasicFilters {
  return basic ? { ...basic, states: [...basic.states] } : EMPTY_BASIC;
}

export function useParticipantViews(eventId: string | undefined) {
  const [rules, setRulesState] = useState<FilterRule[]>([]);
  const [conjunction, setConjunctionState] = useState<Conjunction>('and');
  const [sort, setSortState] = useState<SortRule | null>(null);
  const [quick, setQuickState] = useState<QuickFilter>('all');
  const [basic, setBasicState] = useState<BasicFilters>(EMPTY_BASIC);
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
  const setQuick = useCallback((next: QuickFilter) => {
    dirty.current = true;
    setQuickState(next);
  }, []);
  const setBasic = useCallback((next: BasicFilters) => {
    dirty.current = true;
    setBasicState(next);
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
      setQuickState('all');
      setBasicState(EMPTY_BASIC);
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
          setQuickState(state?.quick ?? 'all');
          setBasicState(cloneBasic(state?.basic));
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
      .set(STATE_KEY(eventId), { rules, conjunction, sort, quick, basic } satisfies PersistedState)
      .catch(error => console.error('Failed to persist filter state:', error));
  }, [eventId, hydratedFor, rules, conjunction, sort, quick, basic]);

  // The saved view the sheet's filters and sort match exactly, if any. The
  // quick chip isn't part of a view: it narrows whatever the view shows.
  const activeViewId = useMemo(() => {
    const sig = viewSignature(rules, conjunction, sort, basic);
    return savedViews.find(v => viewSignature(v.rules, v.conjunction, v.sort, v.basic) === sig)?.id ?? null;
  }, [savedViews, rules, conjunction, sort, basic]);

  const applyView = useCallback((view: SavedView) => {
    // Clone so edits to the working set never mutate the saved view
    setRules(view.rules.map(r => ({ ...r, id: newRuleId() })));
    setConjunction(view.conjunction);
    setSort(view.sort ? { ...view.sort } : null);
    setBasic(cloneBasic(view.basic));
  }, [setRules, setConjunction, setSort, setBasic]);

  const saveView = useCallback(
    (name: string) => {
      if (!eventId) return;
      const view: SavedView = {
        id: newRuleId(),
        name: name.trim(),
        rules: rules.map(r => ({ ...r })),
        conjunction,
        sort: sort ? { ...sort } : null,
        basic: cloneBasic(basic),
      };
      setSavedViews(prev => {
        const next = [...prev, view];
        asyncStorage.set(VIEWS_KEY(eventId), next);
        return next;
      });
    },
    [eventId, rules, conjunction, sort, basic],
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
    setBasic(EMPTY_BASIC);
  }, [setRules, setConjunction, setSort, setBasic]);

  return {
    rules,
    setRules,
    conjunction,
    setConjunction,
    sort,
    setSort,
    quick,
    setQuick,
    basic,
    setBasic,
    savedViews,
    activeViewId,
    applyView,
    saveView,
    deleteView,
    clearFilters,
  };
}
