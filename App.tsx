import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import type { AppleIcon } from 'react-native-bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as ScreenOrientation from 'expo-screen-orientation';
import { notificationService } from './src/services/notifications';
import { AppProvider, useApp } from './src/context/AppContext';
import { useEventAccess } from './src/hooks/useEventAccess';
import { LoginScreen } from './src/screens/LoginScreen';
import { EventListScreen } from './src/screens/EventListScreen';
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
import { ThemeProvider, useTheme, useThemedStyles, type ThemeColors } from './src/theme';
import type { RootStackParamList, MainTabParamList } from './src/types';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://6a7370567b34299ea8bb4ecf2aec3628@o4509680631087104.ingest.us.sentry.io/4510470752043008',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Enable Tracing
  tracesSampleRate: 0.2,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Portrait is requested at runtime instead of android:screenOrientation in
// the manifest: Play flags the manifest attribute, and Android 16+ ignores
// this request on large screens (foldables/tablets rotate freely) while
// phones still hold portrait. iOS keeps its Info.plist orientation masks.
if (Platform.OS === 'android') {
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createNativeBottomTabNavigator<MainTabParamList>();

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

// Android-only bar styling: the Material bar's own theming doesn't track our
// palette, so we paint it from the active scheme's surface color.
function useAndroidTabBarProps() {
  const { colors } = useTheme();
  if (Platform.OS !== 'android') return {};
  return {
    // The native barTintColor is read from tabBarStyle.backgroundColor;
    // without it the bar paints the theme's colorPrimary (near-black).
    tabBarStyle: { backgroundColor: colors.surface },
    tabBarInactiveTintColor: colors.gray[500],
    activeIndicatorColor: `${colors.red}1F`,
    rippleColor: `${colors.red}22`,
  };
}

function MainTabs() {
  // A role without participant records gets no Search tab at all: the roster,
  // the search box, and every participant link behind it would only 403. An
  // event that doesn't run travel gets no Travel tab.
  const { canViewParticipantRecords, showTravel } = useEventAccess();
  const { colors } = useTheme();
  const androidTabBarProps = useAndroidTabBarProps();

  return (
    <Tab.Navigator
      tabBarActiveTintColor={colors.text.accent}
      {...androidTabBarProps}
    >
      <Tab.Screen
        name="Events"
        component={EventListScreen}
        options={{
          tabBarLabel: 'Events',
          tabBarIcon: tabIcon('calendar', require('./assets/tabs/calendar.svg')),
        }}
      />
      <Tab.Screen
        name="Scanner"
        component={ScannerScreen}
        options={{
          tabBarLabel: 'Scan',
          tabBarIcon: tabIcon('qrcode.viewfinder', require('./assets/tabs/scan.svg')),
        }}
      />
      {canViewParticipantRecords ? (
        <Tab.Screen
          name="Search"
          component={SearchScreen}
          options={{
            tabBarLabel: 'Search',
            tabBarIcon: tabIcon('magnifyingglass', require('./assets/tabs/search.svg')),
          }}
        />
      ) : null}
      {showTravel ? (
        <Tab.Screen
          name="Travel"
          component={TravelCalendarScreen}
          options={{
            tabBarLabel: 'Travel',
            tabBarIcon: tabIcon('airplane', require('./assets/tabs/travel.svg')),
          }}
        />
      ) : null}
    </Tab.Navigator>
  );
}

// The pushed paper-world screens share the participant page's header: a
// translucent blurred bar on iOS, the surface color on Android.
function useStackHeaderOptions() {
  const { colors, isDark } = useTheme();
  return useCallback(
    (title: string) => ({
      headerShown: true,
      headerTitle: title,
      headerBackTitle: 'Back',
      headerTintColor: colors.text.accent,
      headerTransparent: Platform.OS === 'ios',
      headerBlurEffect: isDark ? ('dark' as const) : ('light' as const),
      headerStyle: {
        backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.surface,
      },
    }),
    [colors, isDark]
  );
}

function RootNavigator() {
  const { state } = useApp();
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const header = useStackHeaderOptions();

  if (state.auth.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.text.accent} />
      </View>
    );
  }

  const user = state.auth.user;
  // Organizers (global admins or anyone with a staff role) get the scanner
  // experience. Everyone else lands on their tickets. A user who is both a
  // participant and an organizer defaults to the scanner app but can reach
  // their tickets from the Events header.
  const isOrganizer = !!(user?.is_organizer ?? user?.global_admin);
  const isParticipant = !!user?.is_participant;
  const showParticipant = isParticipant || !isOrganizer;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {state.auth.isAuthenticated ? (
        <>
          {isOrganizer && <Stack.Screen name="Main" component={MainTabs} />}
          {showParticipant && (
            <Stack.Screen name="ParticipantMain" component={MyTicketsScreen} />
          )}
          <Stack.Screen name="TicketDetail" component={TicketDetailScreen} />
          <Stack.Screen
            name="ParticipantDetail"
            component={ParticipantDetailScreen}
            options={{
              headerShown: true,
              headerTitle: 'Participant',
              headerBackTitle: 'Back',
              headerTintColor: colors.text.accent,
              headerTransparent: Platform.OS === 'ios',
              headerBlurEffect: isDark ? 'dark' : 'light',
              headerStyle: {
                backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.surface,
              },
            }}
          />
          <Stack.Screen name="IncidentList" component={IncidentListScreen} options={header('Incidents')} />
          <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} options={header('Incident details')} />
          <Stack.Screen name="IncidentForm" component={IncidentFormScreen} options={header('New incident')} />
          <Stack.Screen name="IncidentReport" component={IncidentReportScreen} options={header('Report an incident')} />
          <Stack.Screen name="MessageList" component={MessageListScreen} options={header('Messages')} />
          <Stack.Screen name="MessageDetail" component={MessageDetailScreen} options={header('Message')} />
          <Stack.Screen name="MessageCompose" component={MessageComposeScreen} options={header('Compose message')} />
          <Stack.Screen name="MessagePreview" component={MessagePreviewScreen} options={header('Preview & send')} />
          <Stack.Screen name="Inbox" component={InboxScreen} options={header('Messages')} />
          <Stack.Screen name="InboxMessage" component={InboxMessageScreen} options={header('Message')} />
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

const linking = {
  prefixes: [Linking.createURL('/'), 'attend://'],
  config: {
    screens: {
      Main: {
        screens: {
          Scanner: 'scanner',
          Events: 'events',
          Search: 'search',
          Travel: 'travel',
        },
      },
      ParticipantMain: 'my-tickets',
      ParticipantDetail: 'participant/:id',
      IncidentList: 'incidents',
      IncidentReport: 'incident',
      MessageList: 'event-messages',
      Inbox: 'messages',
      InboxMessage: 'messages/:messageId',
    },
  },
};

export default Sentry.wrap(function App() {
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    // Only genuine attend:// deep links count. A loose substring check also
    // matched the Expo dev client's launch URL, which contains the app slug
    // ("attend-scanner") and fired before the navigator mounted.
    const isScannerLink = (url: string) =>
      /^attend:\/\/(--\/)?scanner/.test(url);

    const openScanner = (url?: string | null) => {
      if (url && isScannerLink(url) && navigationRef.current?.isReady()) {
        // Navigate to scanner tab when tapping Live Activity
        navigationRef.current.navigate('Main', { screen: 'Scanner' } as any);
      }
    };

    const subscription = Linking.addEventListener('url', (event) => openScanner(event.url));

    // Handle initial URL (app opened from Live Activity)
    Linking.getInitialURL().then(openScanner);

    // Tapping an organizer-message push opens that message in the inbox
    // (it carries the message id); an older payload without one opens the
    // participant's tickets as before.
    const notifSub = notificationService.addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as { type?: string; message_id?: string } | undefined;
      if (data?.type !== 'message' || !navigationRef.current) return;
      if (data.message_id) {
        navigationRef.current.navigate('InboxMessage', { messageId: data.message_id });
      } else {
        navigationRef.current.navigate('ParticipantMain' as any);
      }
    });

    return () => {
      subscription.remove();
      notifSub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <ThemedNavigationContainer navigationRef={navigationRef}>
            <RootNavigator />
          </ThemedNavigationContainer>
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
});

function ThemedNavigationContainer({
  navigationRef,
  children,
}: {
  navigationRef: React.RefObject<NavigationContainerRef<RootStackParamList> | null>;
  children: React.ReactNode;
}) {
  const theme = useNavigationTheme();

  return (
    <NavigationContainer ref={navigationRef} theme={theme} linking={linking}>
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
