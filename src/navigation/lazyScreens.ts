/* eslint-disable @typescript-eslint/no-require-imports -- deferred on purpose */
import type React from 'react';

type ScreenGetter = () => React.ComponentType<any>;

/**
 * Screens most sessions never open, for a navigator's `getComponent`: each
 * module (and what only it imports, like RichText) is evaluated on the
 * screen's first visit instead of at launch.
 */
export const lazyScreens = {
  IdCheck: () => require('../screens/IdCheckScreen').IdCheckScreen,
  Kiosk: () => require('../screens/KioskScreen').KioskScreen,
  IncidentList: () => require('../screens/IncidentListScreen').IncidentListScreen,
  IncidentDetail: () => require('../screens/IncidentDetailScreen').IncidentDetailScreen,
  IncidentForm: () => require('../screens/IncidentFormScreen').IncidentFormScreen,
  IncidentReport: () => require('../screens/IncidentReportScreen').IncidentReportScreen,
  MessageList: () => require('../screens/MessageListScreen').MessageListScreen,
  MessageDetail: () => require('../screens/MessageDetailScreen').MessageDetailScreen,
  MessageCompose: () => require('../screens/MessageComposeScreen').MessageComposeScreen,
  MessagePreview: () => require('../screens/MessagePreviewScreen').MessagePreviewScreen,
  Inbox: () => require('../screens/InboxScreen').InboxScreen,
  InboxMessage: () => require('../screens/InboxMessageScreen').InboxMessageScreen,
  TravelCalendar: () => require('../screens/TravelCalendarScreen').TravelCalendarScreen,
} satisfies Record<string, ScreenGetter>;
