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
import { KeyboardProvider } from 'react-native-keyboard-controller';
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
import { MyTicketsScreen } from './src/screens/MyTicketsScreen';
import { TicketDetailScreen } from './src/screens/TicketDetailScreen';
import { ThemeProvider, useTheme, useThemedStyles, withAlpha, type Theme } from './src/theme';
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
import { fallbackToRegisteredRoute, limitLinkParams, preferOrganizerTabs } from './src/services/deepLinks';
import { ROOT_NAVIGATOR } from './src/navigation/routes';
import { linkingConfig } from './src/navigation/linking';
import { lazyScreens } from './src/navigation/lazyScreens';
import { useSheetScreens } from './src/navigation/sheetScreens';
import { sheetStack } from './src/navigation/sheetStack';
import { SheetHost } from './src/components/SheetHost';

const REPLAY_ENABLED = Platform.OS === 'ios';

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

  // Session Replay only on iOS: on Android it costs startup time and memory
  // on the lower-end devices organizers scan with.
  replaysSessionSampleRate: REPLAY_ENABLED ? 0.1 : 0,
  replaysOnErrorSampleRate: REPLAY_ENABLED ? 1 : 0,
  // Replays must never show participant data, so masking is spelled out
  // here rather than left to the SDK's defaults. The feedback integration
  // isn't listed: the app shows no feedback UI, and the SDK adds it on demand
  // if one ever opens.
  integrations: REPLAY_ENABLED
    ? [
        Sentry.mobileReplayIntegration({
          maskAllText: true,
          maskAllImages: true,
          maskAllVectors: true,
        }),
      ]
    : [],

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
// Forms that create or compose open modally, with Cancel and Save in their bar.
const FORM_MODAL_OPTIONS = { presentation: 'modal' } as const;

function useNavigationTheme() {
  const { tokens, isDark } = useTheme();
  // Memoized: NavigationContainer re-renders the whole tree when `theme`
  // changes identity.
  return useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: tokens.bg,
        card: tokens.bg,
        border: tokens.div2,
        primary: tokens.accent,
      },
    };
  }, [tokens, isDark]);
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
  const { tokens } = useTheme();
  if (Platform.OS !== 'android') return {};
  return {
    // The native barTintColor is read from tabBarStyle.backgroundColor.
    tabBarStyle: { backgroundColor: tokens.bg },
    // Unset, the library falls back to android:textColorSecondary.
    tabBarInactiveTintColor: tokens.muted,
    // Translucent, so it reads on either surface.
    activeIndicatorColor: withAlpha(tokens.brand, 0.12),
  };
}

// Each tab is its own stack, so a pushed screen keeps the tab bar.
function OverviewTab() {
  return (
    <OverviewStack.Navigator screenOptions={STACK_OPTIONS}>
      <OverviewStack.Screen name="EventHome" component={EventHome} />
      <OverviewStack.Screen name="IncidentList" getComponent={lazyScreens.IncidentList} />
      <OverviewStack.Screen name="IncidentDetail" getComponent={lazyScreens.IncidentDetail} />
      <OverviewStack.Screen name="IncidentForm" getComponent={lazyScreens.IncidentForm} options={FORM_MODAL_OPTIONS} />
      <OverviewStack.Screen name="IncidentReport" getComponent={lazyScreens.IncidentReport} options={FORM_MODAL_OPTIONS} />
      <OverviewStack.Screen name="MessageList" getComponent={lazyScreens.MessageList} />
      <OverviewStack.Screen name="MessageDetail" getComponent={lazyScreens.MessageDetail} />
      <OverviewStack.Screen name="MessageCompose" getComponent={lazyScreens.MessageCompose} options={FORM_MODAL_OPTIONS} />
      {/* Over the composer: a pushed screen would go under its modal on iOS. */}
      <OverviewStack.Screen name="MessagePreview" getComponent={lazyScreens.MessagePreview} options={FORM_MODAL_OPTIONS} />
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
      <TravelStack.Screen name="TravelHome" getComponent={lazyScreens.TravelCalendar} />
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
      <PassStack.Screen name="Inbox" getComponent={lazyScreens.Inbox} />
      <PassStack.Screen name="InboxMessage" getComponent={lazyScreens.InboxMessage} />
      <PassStack.Screen name="IncidentReport" getComponent={lazyScreens.IncidentReport} options={FORM_MODAL_OPTIONS} />
    </PassStack.Navigator>
  );
}

function MainTabs() {
  // Every organizer gets Overview, Scan and People; Travel only shows for an
  // event that runs travel.
  const { showTravel } = useEventAccess();
  const { tokens } = useTheme();
  const androidTabBarProps = useAndroidTabBarProps();

  return (
    <Tab.Navigator
      tabBarActiveTintColor={tokens.accent}
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

// The dev UI gallery (attend://ui-gallery). The condition is folded at build
// time, so unless the build sets EXPO_PUBLIC_UI_GALLERY=1 this is null and the
// gallery isn't bundled.
const getUiGallery = process.env.EXPO_PUBLIC_UI_GALLERY === '1'
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred on purpose
  ? () => require('./src/screens/dev/UiGallery').UiGallery
  : null;

function RootNavigator() {
  const { state } = useApp();
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const sheetScreens = useSheetScreens();
  const isAuthenticated = state.auth.isAuthenticated;

  // Signing out closes any drawer still open (Android's aren't routes).
  useEffect(() => {
    if (!isAuthenticated) sheetStack.clear();
  }, [isAuthenticated]);

  if (state.auth.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={tokens.accent} />
      </View>
    );
  }

  const user = state.auth.user;
  // Organizers (global admins or anyone with a staff role) get the event
  // tabs. Everyone has the attendee stack: it's a participant's home, and an
  // organizer reaches the events they attend through it from the switcher
  // (the participant flag can lag a new registration, so it isn't gated).
  const isOrganizer = !!(user?.is_organizer ?? user?.global_admin);
  const uiGallery = getUiGallery ? (
    <Stack.Screen name="UiGallery" getComponent={getUiGallery} />
  ) : null;
  const sheetRoutes = sheetScreens.map((sheet) => (
    <Stack.Screen
      key={sheet.name}
      name={sheet.name}
      getComponent={sheet.getComponent}
      options={sheet.options}
    />
  ));

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
              getComponent={lazyScreens.IdCheck}
              options={{ presentation: 'fullScreenModal' }}
            />
          ) : null}
          <Stack.Screen
            name="KioskSetup"
            getComponent={lazyScreens.KioskSetup}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="Kiosk"
            getComponent={lazyScreens.Kiosk}
            options={{
              presentation: 'fullScreenModal',
              gestureEnabled: false,
              animation: 'fade',
            }}
          />
          {/* Form sheets: the account sheet and every picker (navigation/sheets). */}
          {sheetRoutes}
          {uiGallery}
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          {/* The gallery works signed out, with its sheets. */}
          {uiGallery}
          {uiGallery ? sheetRoutes : null}
        </>
      )}
    </Stack.Navigator>
  );
}

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const rootRouteNames = () =>
  navigationRef.isReady() ? navigationRef.getRootState()?.routeNames : undefined;

// The routes each mounted root navigator registers (Main's tabs: Travel only
// for an event with travel).
const childRouteNames = () => {
  if (!navigationRef.isReady()) return {};
  const names: Record<string, string[]> = {};
  for (const route of navigationRef.getRootState()?.routes ?? []) {
    if (route.state && 'routeNames' in route.state && route.state.routeNames) {
      names[route.name] = [...route.state.routeNames];
    }
  }
  return names;
};

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'attend://'],
  config: linkingConfig,
  // Scan and People live in Main (organizers only), and Travel only for an
  // event with travel; a link to a route this user doesn't have opens their
  // home instead of doing nothing.
  getStateFromPath: (path, options) => {
    const routeNames = rootRouteNames();
    return preferOrganizerTabs(
      fallbackToRegisteredRoute(
        limitLinkParams(defaultGetStateFromPath(path, options)),
        routeNames,
        childRouteNames()
      ),
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
      <KeyboardProvider>
        <ThemeProvider>
          <AppProvider>
            <AppNavigation />
          </AppProvider>
        </ThemeProvider>
      </KeyboardProvider>
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
      <SheetHost />
    </NavigationContainer>
  );
}

const makeStyles = ({ tokens }: Theme) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tokens.bg,
  },
});
