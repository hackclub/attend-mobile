import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import { useThemedStyles, type ThemeColors } from '../theme';

function updateLabel(): string {
  if (__DEV__) {
    return 'development';
  }
  if (Updates.isEmbeddedLaunch || !Updates.updateId) {
    return 'embedded build';
  }
  const shortId = Updates.updateId.split('-')[0];
  if (!Updates.createdAt) {
    return `update ${shortId}`;
  }
  const date = Updates.createdAt.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  const time = Updates.createdAt.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `update ${shortId} · ${date} ${time}`;
}

export function VersionFooter() {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        v{Updates.runtimeVersion ?? '?'} · {updateLabel()}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  text: {
    fontSize: 12,
    color: colors.text.secondary,
  },
});
