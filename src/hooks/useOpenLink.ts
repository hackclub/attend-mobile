import { useCallback } from 'react';
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../theme';

const WEB = /^https?:\/\//i;

/**
 * Opens a link the native way: a web page in the in-app browser (Safari View
 * Controller / Custom Tabs) tinted with the app's chrome, so the person stays
 * in Attend; anything else (mailto:, tel:, maps, Slack) goes to its app.
 */
export async function openLink(
  url: string,
  colors?: { controls: string; toolbar: string },
): Promise<void> {
  if (!WEB.test(url)) {
    await Linking.openURL(url);
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(url, {
      controlsColor: colors?.controls,
      toolbarColor: colors?.toolbar,
      dismissButtonStyle: 'close',
      enableBarCollapsing: true,
      showTitle: true,
    });
  } catch {
    // No browser that supports custom tabs: hand it to the system.
    await Linking.openURL(url);
  }
}

/** openLink with the theme's colours; failures are swallowed unless onError. */
export function useOpenLink(onError?: () => void) {
  const { tokens } = useTheme();
  return useCallback(
    (url: string) => {
      openLink(url, { controls: tokens.accent, toolbar: tokens.bg }).catch(() => onError?.());
    },
    [tokens.accent, tokens.bg, onError],
  );
}
