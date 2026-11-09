import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { useAppShortcutLaunch } from './src/hooks/useAppShortcutLaunch';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  createNavigationContainerRef,
  getStateFromPath as defaultGetStateFromPath,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import type { AppleIcon } from 'react-native-bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as ScreenOrientation from 'expo-screen-orientation';
import { holdSplash, hideSplash, isAppReady } from './src/services/splash';
import { notificationService } from './src/services/notifications';
import { AppProvider, useApp } from './src/context/AppContext';
import { useEventAccess } from './src/hooks/useEventAccess';
import { LoginScreen } from './src/screens/LoginScreen';
import { EventHome } from './src/screens/EventHome';
import { SwitchEventScreen } from './src/screens/SwitchEventScreen';
import { RoleRestricted } from './src/components/RoleRestricted';
import { ScannerScreen } from './src/screens/ScannerScreen';

import { SearchScreen } from './src/screens/SearchScreen';
import { ParticipantDetailScreen } from './src/screens/ParticipantDetailScreen';
import { TravelCalendarScreen } from './src/screens/TravelCalendarScreen';
import { KioskSetupScreen } from './src/screens/KioskSetupScreen';
import { KioskScreen } from './src/screens/KioskScreen';
import { MyTicketsScreen } from './src/screens/MyTicketsScreen';
import { TicketDetailScreen } from './src/screens/TicketDetailScreen';
import { IncidentListScreen } from './src/screens/IncidentListScreen';
import { IncidentDetailScreen } from './src/screens/IncidentDetailScreen';
import { IncidentFormScreen } from './src/screens/IncidentFormScreen';
import { IncidentReportScreen } from './src/screens/IncidentReportScreen';
import { MessageListScreen } from './src/screens/MessageListScreen';
import { MessageDetailScreen } from './src/screens/MessageDetailScreen';
import { MessageComposeScreen } from './src/screens/MessageComposeScreen';
import { MessagePreviewScreen } from './src/screens/MessagePreviewScreen';
import { InboxScreen } from './src/screens/InboxScreen';
import { InboxMessageScreen } from './src/screens/InboxMessageScreen';
import { IdCheckScreen } from './src/screens/IdCheckScreen';
import { ThemeProvider, useTheme, useThemedStyles, type ThemeColors } from './src/theme';
import type {
  MainTabParamList,
  OverviewStackParamList,
  PassStackParamList,
  PeopleStackParamList,
  RootStackParamList,
  ScannerStackParamList,
  TravelStackParamList,
} from './src/types';
import * as Sentry from '@sentry/react-native';
import { scrubIdCheckBreadcrumb, scrubIdCheckEvent } from './src/services/idCheck/sentryScrub';
import { stripHttpBreadcrumbQuery } from './src/services/breadcrumbScrub';
import { fallbackToRegisteredRoute, preferOrganizerTabs } from './src/services/deepLinks';
import { ROOT_NAVIGATOR } from './src/navigation/routes';
import { linkingConfig } from './src/navigation/linking';

Sentry.init({
  dsn: 'https://6a7370567b34299ea8bb4ecf2aec3628@o4509680631087104.ingest.us.sentry.io/4510470752043008',

  // No IP addresses, cookies or user details: this app handles participant
  // personal data, so nothing identifying goes to Sentry by default.
  // https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: false,

  // Enable Logs
  enableLogs: true,

  // Enable Tracing
  tracesSampleRate: 0.2,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  // Replays must never show participant data, so masking is spelled out
  // here rather than left to the SDK's defaults.
  integrations: [
    Sentry.mobileReplayIntegration({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true,
    }),
    Sentry.feedbackIntegration(),
  ],

  // Keep anything logged during an on-device ID check out of Sentry, and
  // strip query strings (search terms) from HTTP breadcrumb URLs.
  beforeBreadcrumb: (breadcrumb) => {
    const scrubbed = scrubIdCheckBreadcrumb(breadcrumb);
    return scrubbed ? stripHttpBreadcrumbQuery(scrubbed) : null;
  },
  beforeSend: scrubIdCheckEvent,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// The splash stays up until the first real screen is ready (see
// AppNavigation), so a restored session opens straight onto its event.
holdSplash();

// Portrait is requested at runtime instead of android:screenOrientation in
// the manifest: Play flags the manifest attribute, and Android 16+ ignores
// this request on large screens (foldables/tablets rotate freely) while
// phones still hold portrait. iOS keeps its Info.plist orientation masks.
if (Platform.OS === 'android') {
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createNativeBottomTabNavigator<MainTabParamList>();
const OverviewStack = createNativeStackNavigator<OverviewStackParamList>();
const ScannerStack = createNativeStackNavigator<ScannerStackParamList>();
const PeopleStack = createNativeStackNavigator<PeopleStackParamList>();
const TravelStack = createNativeStackNavigator<TravelStackParamList>();
const PassStack = createNativeStackNavigator<PassStackParamList>();

// Pushed screens draw their own back link and title (components/ui/Screen),
// so no stack shows a native header.
const STACK_OPTIONS = { headerShown: false } as const;

function useNavigationTheme() {
  const { colors, isDark } = useTheme();
  // Memoized: NavigationContainer re-renders the whole tree when `theme`
  // changes identity.
  return useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: isDark ? 'rgba(21,30,46,0.8)' : 'rgba(255,255,255,0.8)',
        border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
        primary: colors.text.accent,
      },
    };
  }, [colors, isDark]);
}

// iOS renders SF Symbols in the native (liquid glass) tab bar; Android's
// Material bottom bar can't use SF Symbols, so it gets bundled SVG sources,
// tinted by the bar's active/inactive colors.
const tabIcon = (sfSymbol: AppleIcon['sfSymbol'], androidSource: number) => () =>
  Platform.OS === 'ios' ? ({ sfSymbol } satisfies AppleIcon) : androidSource;

// Android-only bar styling. The Material 3 app theme (plugins/
// withAndroidBrandTheme.js) already gives the bar our surface, indicator and
// ripple colours, but only for the system scheme: it's resolved once when the
// bar is created, and an in-app light/dark override doesn't recreate it. So
// the colours that change between schemes still come from the active palette.
function useAndroidTabBarProps() {
  const { colors } = useTheme();
  if (Platform.OS !== 'android') return {};
  return {
    // The native barTintColor is read from tabBarStyle.backgroundColor.
    tabBarStyle: { backgroundColor: colors.surface },
    // Unset, the library falls back to android:textColorSecondary.
    tabBarInactiveTintColor: colors.gray[500],
    // Translucent, so it reads on either surface.
    activeIndicatorColor: `${colors.red}1F`,
  };
}

// Each tab is its own stack, so a pushed screen keeps the tab bar.
function OverviewTab() {
  return (
    <OverviewStack.Navigator screenOptions={STACK_OPTIONS}>
      <OverviewStack.Screen name="EventHome" component={EventHome} />
      <OverviewStack.Screen name="IncidentList" component={IncidentListScreen} />
      <OverviewStack.Screen name="IncidentDetail" component={IncidentDetailScreen} />
      <OverviewStack.Screen name="IncidentForm" component={IncidentFormScreen} />
      <OverviewStack.Screen name="IncidentReport" component={IncidentReportScreen} />
      <OverviewStack.Screen name="MessageList" component={MessageListScreen} />
      <OverviewStack.Screen name="MessageDetail" component={MessageDetailScreen} />
      <OverviewStack.Screen name="MessageCompose" component={MessageComposeScreen} />
      <OverviewStack.Screen name="MessagePreview" component={MessagePreviewScreen} />
    </OverviewStack.Navigator>
  );
}

function ScannerTab() {
  return (
    <ScannerStack.Navigator screenOptions={STACK_OPTIONS}>
      <ScannerStack.Screen name="ScannerHome" component={ScannerScreen} />
      <ScannerStack.Screen name="ParticipantDetail" component={ParticipantDetailScreen} />
    </ScannerStack.Navigator>
  );
}

// People is the roster. A role without participant records keeps the tab but
// sees why it's empty, rather than the tab vanishing.
function PeopleHome() {
  const { canViewParticipantRecords } = useEventAccess();
  return canViewParticipantRecords ? <SearchScreen /> : <RoleRestricted fill />;
}

function PeopleTab() {
  return (
    <PeopleStack.Navigator screenOptions={STACK_OPTIONS}>
      <PeopleStack.Screen name="PeopleHome" component={PeopleHome} />
      <PeopleStack.Screen name="ParticipantDetail" component={ParticipantDetailScreen} />
    </PeopleStack.Navigator>
  );
}

function TravelTab() {
  return (
    <TravelStack.Navigator screenOptions={STACK_OPTIONS}>
      <TravelStack.Screen name="TravelHome" component={TravelCalendarScreen} />
      <TravelStack.Screen name="ParticipantDetail" component={ParticipantDetailScreen} />
    </TravelStack.Navigator>
  );
}

/**
 * The attendee's stack: their tickets, each pushing its pass. An organizer
 * who picks an event they attend gets the pass alone as its home.
 */
function PassStackNavigator() {
  return (
    <PassStack.Navigator screenOptions={STACK_OPTIONS}>
      <PassStack.Screen name="MyTickets" component={MyTicketsScreen} />
      <PassStack.Screen name="TicketDetail" component={TicketDetailScreen} />
      <PassStack.Screen name="Inbox" component={InboxScreen} />
      <PassStack.Screen name="InboxMessage" component={InboxMessageScreen} />
      <PassStack.Screen name="IncidentReport" component={IncidentReportScreen} />
    </PassStack.Navigator>
  );
}

function MainTabs() {
  // Every organizer gets Overview, Scan and People; Travel only shows for an
  // event that runs travel.
  const { showTravel } = useEventAccess();
  const { colors } = useTheme();
  const androidTabBarProps = useAndroidTabBarProps();

  return (
    <Tab.Navigator
      tabBarActiveTintColor={colors.text.accent}
      {...androidTabBarProps}
    >
      <Tab.Screen
        name="Overview"
        component={OverviewTab}
        options={{
          tabBarLabel: 'Overview',
          tabBarIcon: tabIcon('house', require('./assets/tabs/home.svg')),
        }}
      />
      <Tab.Screen
        name="Scanner"
        component={ScannerTab}
        options={{
          tabBarLabel: 'Scan',
          tabBarIcon: tabIcon('qrcode.viewfinder', require('./assets/tabs/scan.svg')),
        }}
      />
      <Tab.Screen
        name="Search"
        component={PeopleTab}
        options={{
          tabBarLabel: 'People',
          tabBarIcon: tabIcon('person.2', require('./assets/tabs/people.svg')),
        }}
      />
      {showTravel ? (
        <Tab.Screen
          name="Travel"
          component={TravelTab}
          options={{
            tabBarLabel: 'Travel',
            tabBarIcon: tabIcon('airplane', require('./assets/tabs/travel.svg')),
          }}
        />
      ) : null}
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { state } = useApp();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (state.auth.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.text.accent} />
      </View>
    );
  }

  const user = state.auth.user;
  // Organizers (global admins or anyone with a staff role) get the event
  // tabs. Everyone has the attendee stack: it's a participant's home, and an
  // organizer reaches the events they attend through it from the switcher
  // (the participant flag can lag a new registration, so it isn't gated).
  const isOrganizer = !!(user?.is_organizer ?? user?.global_admin);

  return (
    <Stack.Navigator id={ROOT_NAVIGATOR} screenOptions={{ headerShown: false }}>
      {state.auth.isAuthenticated ? (
        <>
          {isOrganizer && <Stack.Screen name="Main" component={MainTabs} />}
          {isOrganizer && (
            <Stack.Screen
              name="SwitchEvent"
              component={SwitchEventScreen}
              options={{ presentation: 'modal' }}
            />
          )}
          <Stack.Screen name="ParticipantMain" component={PassStackNavigator} />
          {user?.global_admin ? (
            <Stack.Screen
              name="IdCheck"
              component={IdCheckScreen}
              options={{ presentation: 'modal', gestureEnabled: false }}
            />
          ) : null}
          <Stack.Screen
            name="KioskSetup"
            component={KioskSetupScreen}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="Kiosk"
            component={KioskScreen}
            options={{
              presentation: 'fullScreenModal',
              gestureEnabled: false,
              animation: 'fade',
            }}
          />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const rootRouteNames = () =>
  navigationRef.isReady() ? navigationRef.getRootState()?.routeNames : undefined;

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'attend://'],
  config: linkingConfig,
  // Scan and People live in Main (organizers only); a link to a route this
  // user doesn't have opens their home instead of doing nothing.
  getStateFromPath: (path, options) => {
    const routeNames = rootRouteNames();
    return preferOrganizerTabs(
      fallbackToRegisteredRoute(defaultGetStateFromPath(path, options), routeNames),
      routeNames
    );
  },
};

// Only genuine attend:// deep links count. A loose substring check also
// matched the Expo dev client's launch URL, which contains the app slug
// ("attend-scanner") and fired before the navigator mounted.
const isScannerLink = (url: string) => /^attend:\/\/(--\/)?scan(ner)?(\/|\?|$)/.test(url);

export default Sentry.wrap(function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <AppNavigation />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
});

function AppNavigation() {
  const { state } = useApp();
  const [navigationReady, setNavigationReady] = useState(false);

  // iOS home screen quick actions (Android shortcuts arrive as plain links).
  // Held until auth has loaded, the user is signed in and the navigator is
  // mounted: on a cold start RootNavigator first shows the auth spinner, and
  // a link opened then would be consumed and dropped.
  useAppShortcutLaunch(
    navigationReady && !state.auth.isLoading && state.auth.isAuthenticated
  );

  const appReady = isAppReady({ authLoading: state.auth.isLoading, navigationReady });
  useEffect(() => {
    if (appReady) hideSplash();
  }, [appReady]);

  useEffect(() => {
    const openScanner = (url?: string | null) => {
      if (!url || !isScannerLink(url) || !navigationRef.isReady()) return;
      // A participant-only user has no Scanner; the linking config's
      // fallback already sends them home.
      if (!rootRouteNames()?.includes('Main')) return;
      // Navigate to scanner tab when tapping Live Activity
      navigationRef.navigate('Main', { screen: 'Scanner' });
    };

    const subscription = Linking.addEventListener('url', (event) => openScanner(event.url));

    // Handle initial URL (app opened from Live Activity)
    Linking.getInitialURL().then(openScanner);

    // Tapping an organizer-message push opens that message in the inbox
    // (it carries the message id); an older payload without one opens the
    // participant's tickets as before.
    const notifSub = notificationService.addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as { type?: string; message_id?: string } | undefined;
      if (data?.type !== 'message' || !navigationRef.isReady()) return;
      if (data.message_id) {
        // `initial: false` keeps the ticket list under it to go back to.
        navigationRef.navigate('ParticipantMain', {
          screen: 'InboxMessage',
          params: { messageId: data.message_id },
          initial: false,
        });
      } else {
        navigationRef.navigate('ParticipantMain');
      }
    });

    return () => {
      subscription.remove();
      notifSub.remove();
    };
  }, []);

  return (
    <ThemedNavigationContainer onReady={() => setNavigationReady(true)}>
      <RootNavigator />
    </ThemedNavigationContainer>
  );
}

function ThemedNavigationContainer({
  onReady,
  children,
}: {
  onReady: () => void;
  children: React.ReactNode;
}) {
  const theme = useNavigationTheme();

  return (
    <NavigationContainer ref={navigationRef} theme={theme} linking={linking} onReady={onReady}>
      {/* "auto" tracks the system appearance, so the clock and icons stay
          readable against whichever background the scheme paints. */}
      <StatusBar style="auto" />
      {children}
    </NavigationContainer>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
