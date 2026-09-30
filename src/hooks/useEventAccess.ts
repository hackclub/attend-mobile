import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useApp } from '../context/AppContext';
import {
  canViewParticipantPii,
  canViewParticipantRecords,
  eventRunsTravel,
  forbiddenParticipants,
} from '../services/eventAccess';
import { eventRoleDetails } from '../services/eventRoles';

/**
 * What the signed-in user's role on the current event lets them see.
 *
 * Re-renders both when the current event changes and when the API refuses a
 * participant request, so a screen that hides an entry point hides it the
 * moment access turns out not to be there.
 */
export function useEventAccess() {
  const { state } = useApp();
  const event = state.currentEvent;

  const subscribe = useCallback(
    (listener: () => void) => forbiddenParticipants.subscribe(listener),
    []
  );
  const getVersion = useCallback(() => forbiddenParticipants.getVersion(), []);
  const forbiddenVersion = useSyncExternalStore(subscribe, getVersion, getVersion);

  return useMemo(() => {
    const roleDetails = eventRoleDetails(event?.role);
    return {
      role: event?.role ?? null,
      roleLabel: roleDetails?.label ?? null,
      roleSummary: roleDetails?.summary ?? null,
      // Roster, participant search, and participant detail.
      canViewParticipantRecords: canViewParticipantRecords(event),
      // Exact dates of birth and addresses, home and travel pickup alike.
      canViewParticipantPii: canViewParticipantPii(event),
      // Whether the Travel tab has anything to show.
      showTravel: eventRunsTravel(event),
    };
    // forbiddenVersion is the store's change signal, not a value we read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, forbiddenVersion]);
}
