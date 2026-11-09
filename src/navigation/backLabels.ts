// The in-content back link names the screen it returns to ("‹ Overview",
// "‹ Incidents"), the way iOS back buttons do, rather than a generic "Back".

interface RouteLike {
  name: string;
  params?: object;
}

const LABELS: Record<string, string> = {
  EventHome: 'Overview',
  ScannerHome: 'Scan',
  PeopleHome: 'People',
  TravelHome: 'Travel',
  MyTickets: 'Tickets',
  IncidentList: 'Incidents',
  IncidentDetail: 'Incident',
  IncidentReport: 'Report an incident',
  MessageList: 'Messages',
  MessageDetail: 'Message',
  MessageCompose: 'Compose message',
  MessagePreview: 'Preview & send',
  Inbox: 'Messages',
  InboxMessage: 'Message',
  ParticipantDetail: 'Participant',
};

/** What the back link says when it returns to `route`. */
export function backLabelFor(route: RouteLike | undefined): string {
  if (!route) return 'Back';
  if (route.name === 'TicketDetail') {
    const name = (route.params as { ticket?: { event?: { name?: string } } } | undefined)?.ticket?.event?.name;
    return name || 'Pass';
  }
  return LABELS[route.name] ?? 'Back';
}

/** The route below the focused one in a stack's state, if there is one. */
export function previousRoute<R extends RouteLike>(state: { index: number; routes: readonly R[] } | undefined): R | undefined {
  if (!state || state.index < 1) return undefined;
  return state.routes[state.index - 1];
}
