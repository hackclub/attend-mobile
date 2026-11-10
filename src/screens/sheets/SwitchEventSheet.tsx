import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { EventSwitcherBody } from '../../components/EventSwitcher';
import { Sheet, SHEET_INSET } from '../../components/ui';
import { useApp } from '../../context/AppContext';
import { useSwitcherEvents } from '../../hooks/useSwitcherEvents';
import { eventHomeState, passHomeState } from '../../navigation/routes';
import { resetRoot } from '../../navigation/rootNavigation';
import type { PartialState } from '../../navigation/routes';
import { switchEventSheet, type SwitchEventSheetData } from '../../navigation/sheetData';
import { useCloseSheet, useLeaveSheet } from '../../navigation/sheetPresenter';
import { switcherPick } from '../../services/eventSwitcher';
import type { Event, Ticket } from '../../types';
import { useSheetData } from './useSheetData';

/**
 * The event switcher, a drawer opened from an event's banner. Picking an
 * event closes it, then resets the root to that event's home: an organized
 * event's Overview (every tab back at its root, so nothing from the last
 * event stays pushed) or an attended event's pass.
 */
export function SwitchEventSheet() {
  const data = useSheetData(switchEventSheet);
  if (!data) return null;
  return data.preview ? <PreviewSwitcher preview={data.preview} /> : <LiveSwitcher {...data} />;
}

function LiveSwitcher({ currentTicketId }: SwitchEventSheetData) {
  const navigation = useNavigation();
  const leave = useLeaveSheet();
  const { state, selectEvent } = useApp();
  const { groups, isLoading, loadFailed, refresh } = useSwitcherEvents();

  const close = useCloseSheet();
  const current = { eventId: state.currentEvent?.id, ticketId: currentTicketId };

  // Goes to `home` once the switcher has closed on iOS: there it's a route
  // on the root stack, and resetting while it closed left the app not taking
  // touches. Android's drawer is a window outside the navigators, so the
  // reset runs as it starts to close (see useLeaveSheet).
  const switchTo = (home: PartialState, before?: () => void) => {
    leave(() => {
      before?.();
      resetRoot(navigation, home);
    }, { whileClosing: true });
  };

  // The current entry only closes the switcher.
  const pickEvent = (event: Event) => {
    if (switcherPick({ kind: 'event', id: event.id }, current) === 'close') {
      close();
      return;
    }
    // The event changes with the reset, in one render, so no screen left
    // from the last event sees the new one.
    switchTo(eventHomeState(), () => void selectEvent(event));
  };

  const pickTicket = (ticket: Ticket) => {
    if (switcherPick({ kind: 'ticket', id: ticket.id }, current) === 'close') {
      close();
      return;
    }
    switchTo(passHomeState(ticket));
  };

  return (
    <SwitcherSheet>
      <EventSwitcherBody
        groups={groups}
        isLoading={isLoading}
        loadFailed={loadFailed}
        onRetry={() => void refresh()}
        // Opened from a pass, that ticket is the current entry, not the event.
        currentEventId={currentTicketId ? undefined : state.currentEvent?.id}
        currentTicketId={currentTicketId}
        onPickEvent={pickEvent}
        onPickTicket={pickTicket}
      />
    </SwitcherSheet>
  );
}

/** The dev gallery's switcher, with sample events. */
function PreviewSwitcher({ preview }: { preview: NonNullable<SwitchEventSheetData['preview']> }) {
  const close = useCloseSheet();
  const leave = useLeaveSheet();
  // As the real one: the current event only closes it, anything else hands
  // the gallery the pick (which resets the root) once the sheet has gone.
  const pick = (id: string, name: string) => {
    if (switcherPick({ kind: 'event', id }, { eventId: preview.currentEventId }) === 'close') close();
    else leave(() => preview.onPick(name));
  };
  return (
    <SwitcherSheet>
      <EventSwitcherBody
        groups={preview.groups}
        isLoading={false}
        loadFailed={false}
        onRetry={() => {}}
        currentEventId={preview.currentEventId}
        onPickEvent={(event) => pick(event.id, event.name)}
        onPickTicket={(ticket) => pick(ticket.event.id, ticket.event.name)}
      />
    </SwitcherSheet>
  );
}

function SwitcherSheet({ children }: { children: React.ReactNode }) {
  return (
    <Sheet title="Switch event">
      <View style={styles.body}>{children}</View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SHEET_INSET },
});
