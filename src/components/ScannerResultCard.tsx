import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ParticipantAvatar } from './ParticipantAvatar';
import type { ScannerOutcome, ScannerResult } from '../services/scannerCore';
import { colors } from '../theme/colors';

interface ScannerResultCardProps {
  result: ScannerResult;
  onDetails: () => void;
  onRetry: () => void;
  onClear: () => void;
}

const OUTCOME_FOREGROUND = '#020617';

const OUTCOME: Record<ScannerOutcome, {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = {
  confirming: {
    label: 'Confirming',
    icon: 'sync',
    color: colors.blue,
  },
  scanned: {
    label: 'Scanned',
    icon: 'checkmark-circle',
    color: colors.green,
  },
  already_scanned: {
    label: 'Already Scanned',
    icon: 'time',
    color: colors.orange,
  },
  not_scanned: {
    label: 'Not Scanned',
    icon: 'close-circle',
    color: colors.red,
  },
};

function formattedFirstScan(timestamp?: string): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return `First scan ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function ScannerResultCard({
  result,
  onDetails,
  onRetry,
  onClear,
}: ScannerResultCardProps) {
  const config = OUTCOME[result.outcome];
  const participant = result.participant;
  const name = participant?.display_name || participant?.full_name || 'Attendee not identified';
  const firstScan = formattedFirstScan(result.firstScannedAt);
  const isFinal = result.outcome !== 'confirming';
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    translateY.setValue(0);
  }, [result.attemptId, translateY]);

  const settleBack = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const dismiss = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 320,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      translateY.setValue(0);
      onClear();
    });
  }, [onClear, translateY]);

  const releaseOrSettle = useCallback((dy: number, vy: number) => {
    if (dy > 64 || vy > 0.7) {
      dismiss();
    } else {
      settleBack();
    }
  }, [dismiss, settleBack]);

  // Claims the gesture on touch-start so the surrounding ScrollView can't
  // steal the vertical drag, and refuses to hand it back mid-swipe.
  const handlePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => {
      translateY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => releaseOrSettle(gesture.dy, gesture.vy),
    onPanResponderTerminate: settleBack,
    onPanResponderTerminationRequest: () => false,
  }), [releaseOrSettle, settleBack, translateY]);

  const cardPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
    ),
    onPanResponderMove: (_, gesture) => {
      translateY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => releaseOrSettle(gesture.dy, gesture.vy),
    onPanResponderTerminate: settleBack,
    onPanResponderTerminationRequest: () => false,
  }), [releaseOrSettle, settleBack, translateY]);
  const alerts = participant ? [
    participant.has_anaphylaxis_risk
      ? { key: 'anaphylaxis', icon: 'medical', label: 'Anaphylaxis risk', color: colors.red }
      : null,
    participant.requires_refrigeration
      ? { key: 'refrigeration', icon: 'snow', label: 'Medication refrigeration', color: colors.blue }
      : null,
    participant.high_support_flag
      ? { key: 'support', icon: 'people', label: 'High support', color: colors.orange }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    color: string;
  }> : [];

  useEffect(() => {
    if (!isFinal) return;
    const context = result.scanContext?.name;
    const message = [config.label, participant ? name : null, context, result.message]
      .filter(Boolean)
      .join('. ');
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [config.label, isFinal, name, participant, result.attemptId, result.message, result.scanContext?.name]);

  const handleZone = (
    <View
      style={styles.handleZone}
      accessibilityElementsHidden
      importantForAccessibility="no"
      {...handlePanResponder.panHandlers}
    >
      <View style={styles.dragHandle} />
    </View>
  );

  if (!participant) {
    return (
      <Animated.View style={{ transform: [{ translateY }] }}>
        <View style={[styles.card, styles.cardCompact]} {...cardPanResponder.panHandlers}>
          {handleZone}
          <View style={styles.compactRow}>
            <Ionicons
              name={config.icon}
              size={22}
              color={config.color}
            />
            <Text style={styles.compactMessage} accessibilityLiveRegion={isFinal ? 'assertive' : 'polite'}>
              {result.message || config.label}
            </Text>
            {result.retryable ? (
              <Pressable
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel="Retry scan"
              >
                <Ionicons name="refresh" size={18} color={colors.white} />
                <Text style={styles.actionText}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
    <View
      style={styles.card}
      {...cardPanResponder.panHandlers}
    >
      {handleZone}
      <View style={styles.identityRow}>
        <ParticipantAvatar participant={participant} />

        <View style={styles.identityText}>
          <View style={[styles.outcomeBadge, { backgroundColor: config.color }]}>
            <Ionicons name={config.icon} size={18} color={OUTCOME_FOREGROUND} />
            <Text
              style={styles.outcomeLabel}
              accessibilityLiveRegion={isFinal ? 'assertive' : 'polite'}
            >
              {config.label}
            </Text>
          </View>
          <Text style={styles.name}>{name}</Text>
          {participant?.pronouns ? (
            <Text style={styles.pronouns}>{participant.pronouns}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.confirmationRow}>
        <View style={styles.contextRow}>
          <Ionicons name="location" size={17} color={colors.gray[300]} />
          <Text style={styles.contextText}>
            {result.scanContext?.name || 'Current context'}
          </Text>
        </View>
        {firstScan ? <Text style={styles.firstScan}>{firstScan}</Text> : null}
      </View>

      {result.message ? (
        <View style={styles.messageRow}>
          <Ionicons name="information-circle" size={18} color={config.color} />
          <Text style={styles.message}>{result.message}</Text>
        </View>
      ) : null}

      {alerts.length > 0 ? (
        <View style={styles.alerts} accessibilityLabel="Safety alerts">
          {alerts.map(alert => (
            <View key={alert.key} style={styles.alertItem}>
              <Ionicons name={alert.icon} size={18} color={alert.color} />
              <Text style={styles.alertText}>{alert.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.readyRow}>
          <Ionicons
            name={isFinal ? 'scan' : 'hourglass'}
            size={17}
            color={colors.gray[300]}
          />
          <Text style={styles.readyText}>
            {isFinal ? 'Ready for next attendee' : 'Hold steady'}
          </Text>
        </View>

        <View style={styles.actions}>
          {result.outcome === 'not_scanned' && result.retryable ? (
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry scan"
            >
              <Ionicons name="refresh" size={18} color={colors.white} />
              <Text style={styles.actionText}>Retry</Text>
            </Pressable>
          ) : null}
          {participant ? (
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
              onPress={onDetails}
              accessibilityRole="button"
              accessibilityLabel={`View ${name} details`}
            >
              <Text style={styles.actionText}>Details</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.white} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(15, 23, 42, 0.97)',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    padding: 18,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
    gap: 14,
  },
  handleZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: -14,
    marginBottom: -18,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[500],
  },
  cardCompact: {
    paddingVertical: 14,
    gap: 12,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactMessage: {
    flex: 1,
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  identityText: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 3,
  },
  outcomeBadge: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  outcomeLabel: {
    color: OUTCOME_FOREGROUND,
    fontSize: 14,
    fontWeight: '800',
  },
  name: {
    color: colors.white,
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pronouns: {
    color: colors.gray[300],
    fontSize: 15,
    lineHeight: 20,
  },
  confirmationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  contextRow: {
    minHeight: 30,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  contextText: {
    flex: 1,
    color: colors.gray[200],
    fontSize: 15,
    fontWeight: '600',
  },
  firstScan: {
    color: colors.gray[300],
    fontSize: 13,
    fontWeight: '500',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 11,
  },
  message: {
    flex: 1,
    color: colors.gray[100],
    fontSize: 14,
    lineHeight: 19,
  },
  alerts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  alertItem: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 17,
    paddingHorizontal: 11,
  },
  alertText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.16)',
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  readyRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  readyText: {
    color: colors.gray[300],
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: colors.gray[700],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  actionPressed: {
    opacity: 0.72,
  },
  actionText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
