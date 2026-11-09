import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { ParticipantAvatar } from './ParticipantAvatar';
import { Badge, Button, StatusGlyph, type BadgeColor, type StatusType } from './ui';
import type { ScannerOutcome, ScannerResult } from '../services/scannerCore';
import { useTheme, type ThemeTokens } from '../theme';

interface ScannerResultCardProps {
  result: ScannerResult;
  // Omitted for a role whose participant records the API refuses: without it
  // the card shows no Details button rather than a link into a 403.
  onDetails?: () => void;
  onRetry: () => void;
  onClear: () => void;
  /** Undo a fresh scan. Only offered for the 'scanned' outcome. */
  onUndo?: () => void;
  undoing?: boolean;
  /** "85 of 129": the context's progress, after the context name. */
  progress?: string | null;
}

const OUTCOME: Record<ScannerOutcome, { label: string; status: StatusType }> = {
  confirming: { label: 'Confirming', status: 'in-progress' },
  scanned: { label: 'Scanned', status: 'success' },
  already_scanned: { label: 'Already Scanned', status: 'warning' },
  // Saved to the offline queue: deliberately not success-coloured, since
  // nothing has been confirmed. The detail line comes from result.message.
  queued: { label: 'Saved offline', status: 'pending' },
  not_scanned: { label: 'Not Scanned', status: 'error' },
};

function outcomeColor(status: StatusType, tokens: ThemeTokens): string {
  switch (status) {
    case 'success': return tokens.success;
    case 'warning': return tokens.warning;
    case 'error': return tokens.error;
    case 'in-progress': return tokens.info;
    default: return tokens.inactive;
  }
}

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
  onUndo,
  undoing = false,
  progress,
}: ScannerResultCardProps) {
  const { tokens, type, radii } = useTheme();
  const config = OUTCOME[result.outcome];
  const color = outcomeColor(config.status, tokens);
  const participant = result.participant;
  const name = participant?.display_name || participant?.full_name || 'Attendee not identified';
  const firstScan = result.outcome === 'already_scanned' ? formattedFirstScan(result.firstScannedAt) : null;
  const isFinal = result.outcome !== 'confirming';
  const [translateY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    translateY.setValue(0);
  }, [result.attemptId, translateY]);

  const settleBack = useCallback(() => {
    Animated.spring(translateY, { toValue: 0, bounciness: 4, useNativeDriver: true }).start();
  }, [translateY]);

  const dismiss = useCallback(() => {
    Animated.timing(translateY, { toValue: 320, duration: 150, useNativeDriver: true }).start(() => {
      translateY.setValue(0);
      onClear();
    });
  }, [onClear, translateY]);

  const releaseOrSettle = useCallback((dy: number, vy: number) => {
    if (dy > 64 || vy > 0.7) dismiss();
    else settleBack();
  }, [dismiss, settleBack]);

  // Claims the gesture on touch-start so the surrounding ScrollView can't
  // steal the vertical drag, and refuses to hand it back mid-swipe.
  const handlePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => releaseOrSettle(gesture.dy, gesture.vy),
    onPanResponderTerminate: settleBack,
    onPanResponderTerminationRequest: () => false,
  }), [releaseOrSettle, settleBack, translateY]);

  const cardPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
    ),
    onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => releaseOrSettle(gesture.dy, gesture.vy),
    onPanResponderTerminate: settleBack,
    onPanResponderTerminationRequest: () => false,
  }), [releaseOrSettle, settleBack, translateY]);

  const alerts: { key: string; label: string; color: BadgeColor }[] = participant ? [
    participant.has_anaphylaxis_risk ? { key: 'anaphylaxis', label: 'Anaphylaxis', color: 'red' as const } : null,
    participant.requires_refrigeration
      ? { key: 'refrigeration', label: 'Medication refrigeration', color: 'blue' as const }
      : null,
    participant.high_support_flag ? { key: 'support', label: 'High support', color: 'yellow' as const } : null,
  ].filter((alert): alert is NonNullable<typeof alert> => !!alert) : [];

  useEffect(() => {
    if (!isFinal) return;
    const message = [config.label, participant ? name : null, result.scanContext?.name, result.message]
      .filter(Boolean)
      .join('. ');
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [config.label, isFinal, name, participant, result.attemptId, result.message, result.scanContext?.name]);

  const frame = [
    styles.card,
    { backgroundColor: tokens.bg, borderColor: tokens.box, borderRadius: radii.container },
  ];

  const handleZone = (
    <View
      style={styles.handleZone}
      accessibilityElementsHidden
      importantForAccessibility="no"
      {...handlePanResponder.panHandlers}
    >
      <View style={[styles.dragHandle, { backgroundColor: tokens.div }]} />
    </View>
  );

  if (!participant) {
    return (
      <Animated.View style={{ transform: [{ translateY }] }}>
        <View style={frame} {...cardPanResponder.panHandlers}>
          {handleZone}
          <View style={styles.compactRow}>
            <StatusGlyph type={config.status} color={color} size={20} />
            <Text
              style={[type.body, styles.flex, { color: tokens.text }]}
              accessibilityLiveRegion={isFinal ? 'assertive' : 'polite'}
            >
              {result.outcome === 'queued'
                ? `${config.label}. ${result.message}`
                : result.message || config.label}
            </Text>
            {result.retryable ? (
              <Button title="Retry" icon="refresh" onPress={onRetry} accessibilityLabel="Retry scan" />
            ) : null}
          </View>
        </View>
      </Animated.View>
    );
  }

  const meta = [result.scanContext?.name, progress, firstScan].filter(Boolean).join(' · ');
  const canUndo = !!onUndo && result.outcome === 'scanned';
  const canRetry = result.outcome === 'not_scanned' && result.retryable;

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      <View style={frame} {...cardPanResponder.panHandlers}>
        {handleZone}
        <View style={styles.identityRow}>
          <ParticipantAvatar participant={participant} size={48} />
          <View style={styles.flex}>
            <View style={styles.nameRow}>
              <Text style={[type.h2, styles.name, { color: tokens.textH }]}>{name}</Text>
              {participant.pronouns ? (
                <Text style={[type.body, { color: tokens.muted }]}>{participant.pronouns}</Text>
              ) : null}
            </View>
            <View style={styles.statusRow}>
              <StatusGlyph type={config.status} color={color} />
              <Text style={[type.body, styles.flex, { color: tokens.muted }]}>
                <Text
                  style={[type.label, { color }]}
                  accessibilityLiveRegion={isFinal ? 'assertive' : 'polite'}
                >
                  {config.label}
                </Text>
                {meta ? ` · ${meta}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {result.message ? (
          <Text style={[type.body, { color: tokens.text2 }]}>{result.message}</Text>
        ) : null}

        {alerts.length > 0 ? (
          <View style={styles.alerts} accessibilityLabel="Safety alerts">
            {alerts.map((alert) => <Badge key={alert.key} label={alert.label} color={alert.color} />)}
          </View>
        ) : null}

        {canUndo || canRetry || onDetails ? (
          <View style={styles.actions}>
            {canRetry ? (
              <Button
                title="Retry"
                icon="refresh"
                onPress={onRetry}
                accessibilityLabel="Retry scan"
                style={styles.flex}
              />
            ) : null}
            {canUndo ? (
              <Button
                title="Undo"
                onPress={onUndo}
                loading={undoing}
                accessibilityLabel={`Undo ${name}'s scan`}
                style={styles.flex}
              />
            ) : null}
            {onDetails ? (
              <Button
                title="Details"
                variant="primary"
                onPress={onDetails}
                accessibilityLabel={`View ${name} details`}
                style={styles.flex}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
  },
  handleZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 2,
  },
  dragHandle: { width: 36, height: 5, borderRadius: 3 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Pronouns sit on the name's baseline and wrap under it when there's no room.
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  name: { flexShrink: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  alerts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
});
