import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
// SvgCss (not SvgXml) so the Illustrator-exported badge SVGs' <style>/class
// based fills are applied — SvgXml ignores CSS stylesheets and renders them black.
import { SvgCss } from 'react-native-svg/css';
import { appleWalletBadgeXml, googleWalletBadgeXml } from '../assets/walletBadges';
import { addPassFromUrl, canAddPasses } from '../../modules/wallet/src';
import { api } from '../services/api';
import { colors } from '../theme/colors';
import type { Ticket } from '../types';

// The official badges have a ~110:35 aspect ratio. We render them at a fixed
// height and let the width scale to keep Apple/Google's proportions intact.
const BADGE_HEIGHT = 48;
const BADGE_WIDTH = BADGE_HEIGHT * (110.739 / 35.016);

interface Props {
  ticket: Ticket;
}

export function WalletButtons({ ticket }: Props) {
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  const openUrl = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Unable to open', 'Your device could not open the wallet pass.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Something went wrong', 'Could not open the wallet pass. Please try again.');
    }
  };

  const [loadingApple, setLoadingApple] = useState(false);

  const handleApple = async () => {
    if (loadingApple) return;
    const url = ticket.apple_wallet_url;
    if (!url) {
      Alert.alert('Not available', 'This ticket does not have an Apple Wallet pass yet.');
      return;
    }
    // Prefer the native in-app Add-to-Wallet sheet; fall back to opening the
    // .pkpass URL (e.g. on Simulator, where Wallet is unavailable).
    if (canAddPasses()) {
      setLoadingApple(true);
      try {
        const presented = await addPassFromUrl(url);
        if (presented) return;
      } finally {
        setLoadingApple(false);
      }
    }
    openUrl(url);
  };

  const handleGoogle = async () => {
    if (loadingGoogle) return;
    setLoadingGoogle(true);
    try {
      const url = await api.getGoogleWalletUrl(ticket.id);
      await openUrl(url);
    } catch {
      Alert.alert('Something went wrong', 'Could not generate a Google Wallet pass. Please try again.');
    } finally {
      setLoadingGoogle(false);
    }
  };

  // Show the platform-native wallet only: Apple Wallet on iOS, Google Wallet
  // on Android.
  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' ? (
        ticket.apple_wallet_url ? (
          <TouchableOpacity
            onPress={handleApple}
            activeOpacity={0.8}
            accessibilityLabel="Add to Apple Wallet"
            style={styles.googleWrap}
          >
            <SvgCss xml={appleWalletBadgeXml} height={BADGE_HEIGHT} width={BADGE_WIDTH} />
            {loadingApple ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color={colors.white} />
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null
      ) : (
        <TouchableOpacity
          onPress={handleGoogle}
          activeOpacity={0.8}
          accessibilityLabel="Add to Google Wallet"
          style={styles.googleWrap}
        >
          <SvgCss xml={googleWalletBadgeXml} height={BADGE_HEIGHT} width={BADGE_WIDTH} />
          {loadingGoogle ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={colors.white} />
            </View>
          ) : null}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleWrap: {
    position: 'relative',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
  },
});
