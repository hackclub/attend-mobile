import type { LinkingOptions, PathConfigMap } from '@react-navigation/native';
import type {
  OverviewStackParamList,
  PassStackParamList,
  PeopleStackParamList,
  RootStackParamList,
} from '../types';

// A link deep into a stack keeps the stack's first screen under it to go
// back to. (React Navigation can't infer the nested route names for
// initialRouteName through our param lists, so it's checked here instead.)
const withInitialRoute = <ParamList extends object>(
  initialRouteName: keyof ParamList & string,
  config: { screens: PathConfigMap<ParamList> }
) => ({ ...config, initialRouteName }) as { screens: PathConfigMap<ParamList> };

/**
 * attend:// paths. Each path names one screen, so a screen held by more than
 * one stack is linked in one place (see preferOrganizerTabs in
 * services/deepLinks for where an organizer's link opens instead).
 */
export const linkingConfig: LinkingOptions<RootStackParamList>['config'] = {
  screens: {
    Main: {
      screens: {
        // attend://scan, attend://people and attend://tickets are the
        // app shortcuts'; the older paths keep working.
        Overview: withInitialRoute<OverviewStackParamList>('EventHome', {
          screens: {
            EventHome: { path: 'overview', alias: ['events'] },
            IncidentList: 'incidents',
            IncidentDetail: 'incidents/:incidentId',
            MessageList: 'event-messages',
            MessageDetail: 'event-messages/:messageId',
          },
        }),
        Scanner: { screens: { ScannerHome: { path: 'scanner', alias: ['scan'] } } },
        Search: withInitialRoute<PeopleStackParamList>('PeopleHome', {
          screens: {
            PeopleHome: { path: 'search', alias: ['people'] },
            ParticipantDetail: 'participant/:id',
          },
        }),
        Travel: { screens: { TravelHome: 'travel' } },
      },
    },
    ParticipantMain: withInitialRoute<PassStackParamList>('MyTickets', {
      screens: {
        MyTickets: { path: 'my-tickets', alias: ['tickets'] },
        // Shared with the Overview stack; preferOrganizerTabs opens an
        // organizer's link there.
        IncidentReport: 'incident',
        Inbox: 'messages',
        InboxMessage: 'messages/:messageId',
      },
    }),
  },
};
