import React from 'react';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/context/AppContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { EventListScreen } from './src/screens/EventListScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';

import { SearchScreen } from './src/screens/SearchScreen';
import { ParticipantDetailScreen } from './src/screens/ParticipantDetailScreen';
import { AirportModeScreen } from './src/screens/AirportModeScreen';
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

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

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

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.red,
      }}
    >
      <Tab.Screen
        name="Events"
        component={EventListScreen}
        options={{
          tabBarLabel: 'Events',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Scanner"
        component={ScannerScreen}
        options={{
          tabBarLabel: 'Scan',
          tabBarIcon: ({ color, size }) => <Ionicons name="qr-code-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarLabel: 'Search',
          tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="AirportMode"
        component={AirportModeScreen}
        options={{
          tabBarLabel: 'Flights',
          tabBarIcon: ({ color, size }) => <Ionicons name="airplane-outline" size={size} color={color} />,
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

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {state.auth.isAuthenticated ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
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
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default Sentry.wrap(function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer theme={LiquidGlassTheme}>
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