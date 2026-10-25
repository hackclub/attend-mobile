import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { Participant } from '../types';
import { useThemedStyles, type Theme, type ThemeColors } from '../theme';

interface ParticipantAvatarProps {
  participant?: Participant;
  size?: number;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
}

export function ParticipantAvatar({ participant, size = 84 }: ParticipantAvatarProps) {
  const name = participant?.display_name || participant?.full_name || 'Attendee';
  const uri = participant?.headshot_url;
  const styles = useThemedStyles(makeStyles);
  const [imageFailed, setImageFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [uri]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => subscription.remove();
  }, []);

  const sharedStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (uri && !imageFailed) {
    return (
      <Image
        source={{ uri }}
        style={[styles.avatar, sharedStyle]}
        cachePolicy="memory-disk"
        contentFit="cover"
        recyclingKey={participant?.participant_event_id}
        transition={reduceMotion ? 0 : 120}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Photo of ${name}`}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <View
      style={[styles.avatar, styles.fallback, sharedStyle]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Initials for ${name}`}
    >
      <Text style={[styles.initials, { fontSize: size * 0.34 }]}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors, { isDark }: Theme) => StyleSheet.create({
  avatar: {
    borderWidth: 2,
    borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.72)',
    overflow: 'hidden',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? colors.gray[300] : colors.gray[700],
  },
  initials: {
    color: colors.white,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
