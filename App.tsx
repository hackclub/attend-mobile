import React, { useRef, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme, NavigationContainerRef } from '@react-navigation/native';
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
import { colors } from './src/theme/colors';
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

const LiquidGlassTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.gray[50],
    card: 'rgba(255,255,255,0.8)',
    border: 'rgba(0,0,0,0.05)',
    primary: colors.red,
  },
};

// iOS renders SF Symbols in the native (liquid glass) tab bar; Android's
// Material bottom bar can't use SF Symbols, so it gets bundled SVG sources,
// tinted by the bar's active/inactive colors.
const tabIcon = (sfSymbol: AppleIcon['sfSymbol'], androidSource: number) => () =>
  Platform.OS === 'ios' ? ({ sfSymbol } satisfies AppleIcon) : androidSource;

// Android-only bar styling: the Material bar follows the system theme by
// default, which turns black in dark mode while our screens stay paper-light.
const androidTabBarProps = Platform.OS === 'android'
  ? {
      // The native barTintColor is read from tabBarStyle.backgroundColor;
      // without it the bar paints the theme's colorPrimary (near-black).
      tabBarStyle: { backgroundColor: colors.white },
      tabBarInactiveTintColor: colors.gray[500],
      activeIndicatorColor: `${colors.red}1F`,
      rippleColor: `${colors.red}22`,
    }
  : {};

function MainTabs() {
  // A role without participant records gets no Search tab at all: the roster,
  // the search box, and every participant link behind it would only 403.
  const { canViewParticipantRecords } = useEventAccess();

  return (
    <Tab.Navigator
      tabBarActiveTintColor={colors.red}
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
      <Tab.Screen
        name="Travel"
        component={TravelCalendarScreen}
        options={{
          tabBarLabel: 'Travel',
          tabBarIcon: tabIcon('airplane', require('./assets/tabs/travel.svg')),
        }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { state } = useApp();

  if (state.auth.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.red} />
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
              headerTintColor: colors.red,
              headerTransparent: Platform.OS === 'ios',
              headerBlurEffect: 'light',
              headerStyle: {
                backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.white,
              },
            }}
          />
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

    // Tapping an organizer-message push opens the participant's tickets.
    const notifSub = notificationService.addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as { type?: string } | undefined;
      if (data?.type === 'message' && navigationRef.current) {
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
      <AppProvider>
        <NavigationContainer 
          ref={navigationRef}
          theme={LiquidGlassTheme}
          linking={linking}
        >
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
});

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
});