import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { nfcService } from '../services/nfc';
import { isExpired, matchDateOfBirth, matchName } from '../services/idCheck/match';
import { validateManualAccess, type MrzAccessFields } from '../services/idCheck/mrz';
import {
  cancelRead,
  hasTrustAnchors,
  isMrzScannerSupported,
  isReaderSupported,
  readDocument,
  scanMrz,
  MrtdError,
  type Access,
  type MrtdResult,
} from '../services/idCheck/reader';
import { setIdCheckActive } from '../services/idCheck/sentryScrub';
import {
  buildIdCheckPayload,
  verdict,
  verdictReasons,
  type CheckResult,
  type Decision,
  type VerdictInput,
} from '../services/idCheck/verdict';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'IdCheck'>;

// Every document detail lives in this component's state and nowhere else: not
// AsyncStorage, SecureStore, the sync queue, a file, or the console. It is all
// dropped when the screen loses focus or the app goes to the background.
type Step =
  | { kind: 'access'; error?: string }
  | { kind: 'manual'; error?: string }
  | { kind: 'ready'; access: Access; error?: string }
  | { kind: 'reading'; access: Access }
  | { kind: 'result'; result: MrtdResult; input: VerdictInput; outcome: CheckResult }
  | { kind: 'recording'; result: MrtdResult; input: VerdictInput; outcome: CheckResult; decision: Decision }
  | { kind: 'recordFailed'; result: MrtdResult; input: VerdictInput; outcome: CheckResult; decision: Decision }
  | { kind: 'recorded'; decision: Decision; outcome: CheckResult };

const EMPTY_MANUAL: MrzAccessFields = { documentNumber: '', dateOfBirth: '', dateOfExpiry: '' };

const DOCUMENT_LABELS: Record<string, string> = { P: 'Passport', I: 'ID card', A: 'ID card', C: 'ID card' };

export function IdCheckScreen({ route, navigation }: Props) {
  const { participant, eventId } = route.params;
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { state } = useApp();
  const isGlobalAdmin = !!state.auth.user?.global_admin;

  const [step, setStep] = useState<Step>({ kind: 'access' });
  const [manual, setManual] = useState<MrzAccessFields>(EMPTY_MANUAL);
  // Read from async callbacks (a chip read finishing, AppState changes) that
  // need the current step, not the one they closed over.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const readerSupported = useMemo(() => isReaderSupported(), []);
  const cameraSupported = useMemo(() => isMrzScannerSupported(), []);
  const trustAnchors = useMemo(() => hasTrustAnchors(), []);

  const reset = useCallback(() => {
    cancelRead().catch(() => {});
    setManual(EMPTY_MANUAL);
    setStep({ kind: 'access' });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIdCheckActive(true);
      return () => {
        setIdCheckActive(false);
        reset();
      };
    }, [reset])
  );

  // The system NFC sheet makes the app inactive while it is up, so during a
  // read only a real background counts. Otherwise inactive (app switcher,
  // notification centre) clears too, so the photo isn't left on screen.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const reading = stepRef.current.kind === 'reading';
      if (next === 'background' || (next === 'inactive' && !reading)) {
        reset();
      }
    });
    return () => subscription.remove();
  }, [reset]);

  const legalFirstName = participant.personal?.legal_first_name ?? '';
  const legalLastName = participant.personal?.legal_last_name ?? '';
  const attendDob = participant.personal?.date_of_birth;

  const handleScan = async () => {
    try {
      const scanned = await scanMrz();
      if (scanned) setStep({ kind: 'ready', access: scanned.access });
    } catch (error) {
      setStep({
        kind: 'access',
        error: error instanceof MrtdError ? error.message : 'Could not open the camera.',
      });
    }
  };

  const handleManualContinue = () => {
    const fields = {
      documentNumber: manual.documentNumber.trim().toUpperCase(),
      dateOfBirth: manual.dateOfBirth.trim(),
      dateOfExpiry: manual.dateOfExpiry.trim(),
    };
    const error = validateManualAccess(fields);
    if (error) {
      setStep({ kind: 'manual', error });
      return;
    }
    setStep({ kind: 'ready', access: { mrz: fields } });
  };

  const handleRead = async (access: Access) => {
    // iOS allows one reader session at a time; a badge scan left open would
    // stop the chip read from starting.
    await nfcService.cancelOperation();
    // Set now, not after render: the NFC sheet makes the app inactive almost
    // immediately, and the AppState handler must already see a read.
    const reading: Step = { kind: 'reading', access };
    stepRef.current = reading;
    setStep(reading);
    try {
      const result = await readDocument(access);
      if (stepRef.current.kind !== 'reading') return; // reset while reading
      const input: VerdictInput = {
        checks: result.checks,
        nameMatch: matchName({
          attendFirstName: legalFirstName,
          attendLastName: legalLastName,
          documentSurname: result.surname,
          documentGivenNames: result.givenNames,
          documentNameTruncated: result.nameTruncated,
        }),
        dobMatch: matchDateOfBirth(result.dateOfBirth, attendDob),
        expired: isExpired(result.dateOfExpiry),
      };
      setStep({ kind: 'result', result, input, outcome: verdict(input) });
    } catch (error) {
      if (stepRef.current.kind !== 'reading') return; // reset while reading
      if (error instanceof MrtdError && error.isCancelled) {
        setStep({ kind: 'ready', access });
        return;
      }
      setStep({
        kind: 'ready',
        access,
        error: error instanceof MrtdError ? error.message : 'Could not read the chip. Try again.',
      });
    }
  };

  const handleDecision = async (
    current: Extract<Step, { kind: 'result' | 'recordFailed' }>,
    decision: Decision
  ) => {
    const { result, input, outcome } = current;
    setStep({ kind: 'recording', result, input, outcome, decision });
    try {
      await api.recordIdCheck(
        eventId,
        participant.participant_event_id,
        buildIdCheckPayload({
          decision,
          result: outcome,
          documentType: result.documentType,
          issuingState: result.issuingState,
          input,
        })
      );
      // The document data is no longer needed once the outcome is stored.
      setStep({ kind: 'recorded', decision, outcome });
    } catch {
      // Not queued for later: only the outcome would be stored, but keeping
      // this off the sync queue keeps the path simple to reason about.
      setStep({ kind: 'recordFailed', result, input, outcome, decision });
    }
  };

  const close = () => navigation.goBack();

  if (!isGlobalAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.body}>ID checks are available to global admins only.</Text>
          <SecondaryButton label="Close" onPress={close} styles={styles} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Verify ID</Text>
        <TouchableOpacity onPress={close} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.topClose}>Close</Text>
        </TouchableOpacity>
      </View>

      <Sentry.Mask style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ParticipantHeader
            name={[legalFirstName, legalLastName].filter(Boolean).join(' ') || participant.full_name}
            headshotUrl={participant.headshot_url}
            styles={styles}
          />

          {!readerSupported ? (
            <Notice tone="error" text="This device can't read document chips. ID checks need an iPhone with NFC." styles={styles} />
          ) : null}
          {readerSupported && !trustAnchors ? (
            <Notice
              tone="warning"
              text="This build has no trust list, so no document can be fully verified. Results will be amber at best."
              styles={styles}
            />
          ) : null}
          {!legalFirstName || !legalLastName ? (
            <Notice tone="warning" text="The Attend record has no legal name, so the name can't be matched." styles={styles} />
          ) : null}

          {step.kind === 'access' && readerSupported ? (
            <View style={styles.section}>
              <Text style={styles.stepTitle}>1. Scan the document</Text>
              <Text style={styles.body}>
                Scan the lines of {'<<<'} characters at the bottom of the photo page, or on the back of an ID card.
                This unlocks the chip. Only chipped passports and ID cards (with the chip symbol) can be checked.
              </Text>
              {step.error ? <Notice tone="error" text={step.error} styles={styles} /> : null}
              {cameraSupported ? (
                <PrimaryButton icon="scan-outline" label="Scan document" onPress={handleScan} styles={styles} colors={colors} />
              ) : null}
              <SecondaryButton label="Enter details by hand" onPress={() => setStep({ kind: 'manual' })} styles={styles} />
            </View>
          ) : null}

          {step.kind === 'manual' ? (
            <View style={styles.section}>
              <Text style={styles.stepTitle}>1. Enter the document details</Text>
              <Text style={styles.body}>Copy them from the document. Dates are YYMMDD, for example 080314.</Text>
              <LabelledInput
                label="Document number"
                value={manual.documentNumber}
                onChangeText={(documentNumber) => setManual((m) => ({ ...m, documentNumber }))}
                autoCapitalize="characters"
                styles={styles}
                colors={colors}
              />
              <LabelledInput
                label="Date of birth (YYMMDD)"
                value={manual.dateOfBirth}
                onChangeText={(dateOfBirth) => setManual((m) => ({ ...m, dateOfBirth }))}
                keyboardType="number-pad"
                maxLength={6}
                styles={styles}
                colors={colors}
              />
              <LabelledInput
                label="Expiry date (YYMMDD)"
                value={manual.dateOfExpiry}
                onChangeText={(dateOfExpiry) => setManual((m) => ({ ...m, dateOfExpiry }))}
                keyboardType="number-pad"
                maxLength={6}
                styles={styles}
                colors={colors}
              />
              {step.error ? <Notice tone="error" text={step.error} styles={styles} /> : null}
              <PrimaryButton icon="arrow-forward" label="Continue" onPress={handleManualContinue} styles={styles} colors={colors} />
              <SecondaryButton label="Back" onPress={() => setStep({ kind: 'access' })} styles={styles} />
            </View>
          ) : null}

          {step.kind === 'ready' || step.kind === 'reading' ? (
            <View style={styles.section}>
              <Text style={styles.stepTitle}>2. Read the chip</Text>
              <Text style={styles.body}>
                Place the top of the iPhone flat on the document: on the photo page or cover of a passport, or the
                middle of an ID card. Hold still until the read finishes.
              </Text>
              {step.kind === 'ready' && step.error ? <Notice tone="error" text={step.error} styles={styles} /> : null}
              {step.kind === 'reading' ? (
                <View style={styles.reading}>
                  <ActivityIndicator color={colors.text.accent} />
                  <Text style={styles.body}>Reading...</Text>
                </View>
              ) : (
                <>
                  <PrimaryButton icon="radio-outline" label="Read chip" onPress={() => handleRead(step.access)} styles={styles} colors={colors} />
                  <SecondaryButton label="Scan a different document" onPress={reset} styles={styles} />
                </>
              )}
            </View>
          ) : null}

          {step.kind === 'result' || step.kind === 'recording' || step.kind === 'recordFailed' ? (
            <ResultView
              step={step}
              headshotUrl={participant.headshot_url}
              onDecision={(decision) => {
                if (step.kind === 'result' || step.kind === 'recordFailed') handleDecision(step, decision);
              }}
              onRestart={reset}
              styles={styles}
              colors={colors}
            />
          ) : null}

          {step.kind === 'recorded' ? (
            <View style={styles.section}>
              <OutcomeBanner outcome={step.outcome} title={step.decision === 'confirmed' ? 'Identity confirmed' : 'Identity rejected'} styles={styles} colors={colors} />
              <Text style={styles.body}>The outcome was added to the participant&apos;s notes. No document data was stored.</Text>
              <PrimaryButton icon="checkmark" label="Done" onPress={close} styles={styles} colors={colors} />
            </View>
          ) : null}
        </ScrollView>
      </Sentry.Mask>
    </SafeAreaView>
  );
}

function ResultView({
  step,
  headshotUrl,
  onDecision,
  onRestart,
  styles,
  colors,
}: {
  step: Extract<Step, { kind: 'result' | 'recording' | 'recordFailed' }>;
  headshotUrl?: string | null;
  onDecision: (decision: Decision) => void;
  onRestart: () => void;
  styles: Styles;
  colors: ThemeColors;
}) {
  const { result, input, outcome } = step;
  const reasons = verdictReasons(input);
  const busy = step.kind === 'recording';
  const title = { green: 'Document verified', amber: 'Check carefully', red: 'Do not accept' }[outcome];

  return (
    <View style={styles.section}>
      <OutcomeBanner outcome={outcome} title={title} styles={styles} colors={colors} />
      {reasons.length > 0 ? (
        <View style={styles.reasons}>
          {reasons.map((reason) => (
            <Text key={reason} style={styles.reason}>{'•'} {reason}</Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.stepTitle}>3. Compare the photos</Text>
      <Text style={styles.body}>
        Compare the chip photo with the Attend photo and with the person in front of you. You decide; nothing is
        matched automatically.
      </Text>
      <View style={styles.photos}>
        <Photo label="Chip" uri={result.photoJpegBase64 ? `data:image/jpeg;base64,${result.photoJpegBase64}` : null} styles={styles} />
        <Photo label="Attend" uri={headshotUrl ?? null} styles={styles} />
      </View>

      <View style={styles.details}>
        <Detail label="Document" value={`${result.issuingState} ${DOCUMENT_LABELS[result.documentType] ?? 'document'}`} styles={styles} />
        <Detail label="Name on chip" value={`${result.givenNames} ${result.surname}`.trim()} styles={styles} />
        <Detail label="Chip" value={`${result.checks.accessProtocol}, active auth ${result.checks.activeAuth}, chip auth ${result.checks.chipAuth}`} styles={styles} />
      </View>

      {step.kind === 'recordFailed' ? <Notice tone="error" text="Check not recorded. Try again." styles={styles} /> : null}

      {busy ? (
        <View style={styles.reading}>
          <ActivityIndicator color={colors.text.accent} />
          <Text style={styles.body}>Recording...</Text>
        </View>
      ) : step.kind === 'recordFailed' ? (
        <PrimaryButton icon="refresh" label="Retry" onPress={() => onDecision(step.decision)} styles={styles} colors={colors} />
      ) : (
        <>
          {/* A red result can only be recorded as a rejection. */}
          {outcome !== 'red' ? (
            <PrimaryButton icon="checkmark-circle-outline" label="Confirm identity" onPress={() => onDecision('confirmed')} styles={styles} colors={colors} />
          ) : null}
          <SecondaryButton label="Reject" destructive onPress={() => onDecision('rejected')} styles={styles} />
          <SecondaryButton label="Start again" onPress={onRestart} styles={styles} />
        </>
      )}
    </View>
  );
}

function ParticipantHeader({ name, headshotUrl, styles }: { name: string; headshotUrl?: string | null; styles: Styles }) {
  return (
    <View style={styles.participant}>
      {headshotUrl ? <Image source={{ uri: headshotUrl }} style={styles.participantPhoto} /> : null}
      <View style={styles.flex}>
        <Text style={styles.participantLabel}>Checking</Text>
        <Text style={styles.participantName}>{name}</Text>
      </View>
    </View>
  );
}

// React Native's Image, not expo-image: expo-image caches to disk, and the chip
// photo must stay in memory.
function Photo({ label, uri, styles }: { label: string; uri: string | null; styles: Styles }) {
  return (
    <View style={styles.photoColumn}>
      {uri ? (
        <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
      ) : (
        <View style={[styles.photo, styles.photoMissing]}>
          <Text style={styles.reason}>No photo</Text>
        </View>
      )}
      <Text style={styles.photoLabel}>{label}</Text>
    </View>
  );
}

function OutcomeBanner({ outcome, title, styles, colors }: { outcome: CheckResult; title: string; styles: Styles; colors: ThemeColors }) {
  const fill = { green: colors.green, amber: colors.orange, red: colors.red }[outcome];
  const icon = { green: 'shield-checkmark', amber: 'alert-circle', red: 'close-circle' }[outcome] as keyof typeof Ionicons.glyphMap;
  return (
    <View style={[styles.banner, { backgroundColor: fill }]}>
      <Ionicons name={icon} size={24} color={colors.gray[900]} />
      <Text style={styles.bannerText}>{title}</Text>
    </View>
  );
}

function Notice({ tone, text, styles }: { tone: 'error' | 'warning'; text: string; styles: Styles }) {
  return (
    <View style={[styles.notice, tone === 'error' ? styles.noticeError : styles.noticeWarning]}>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function Detail({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function LabelledInput({
  label,
  styles,
  colors,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; styles: Styles; colors: ThemeColors }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.detailLabel}>{label}</Text>
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor={colors.text.muted}
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
        textContentType="none"
      />
    </View>
  );
}

function PrimaryButton({
  icon,
  label,
  onPress,
  styles,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  styles: Styles;
  colors: ThemeColors;
}) {
  return (
    <TouchableOpacity style={styles.primaryButton} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={colors.white} />
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({
  label,
  onPress,
  destructive,
  styles,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  styles: Styles;
}) {
  return (
    <TouchableOpacity style={styles.secondaryButton} onPress={onPress} accessibilityRole="button">
      <Text style={[styles.secondaryButtonText, destructive && styles.destructiveText]}>{label}</Text>
    </TouchableOpacity>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  topTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.35,
    color: colors.text.primary,
  },
  topClose: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.accent,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  participant: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  participantPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.gray[200],
  },
  participantLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  participantName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  section: {
    gap: 12,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text.primary,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text.secondary,
  },
  reading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  notice: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  noticeError: {
    borderColor: colors.status.error,
    backgroundColor: colors.red + '1A',
  },
  noticeWarning: {
    borderColor: colors.status.warning,
    backgroundColor: colors.orange + '1A',
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 19,
    color: colors.text.primary,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 15,
  },
  bannerText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.gray[900],
  },
  reasons: {
    gap: 4,
  },
  reason: {
    fontSize: 14,
    lineHeight: 19,
    color: colors.text.secondary,
  },
  photos: {
    flexDirection: 'row',
    gap: 12,
  },
  photoColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  photo: {
    width: '100%',
    aspectRatio: 0.78,
    borderRadius: 12,
    backgroundColor: colors.gray[200],
  },
  photoMissing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  details: {
    padding: 14,
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  detailRow: {
    gap: 2,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  detailValue: {
    fontSize: 15,
    color: colors.text.primary,
  },
  inputGroup: {
    gap: 6,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 13,
    fontSize: 16,
    color: colors.text.primary,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[300],
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: colors.red,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[300],
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  destructiveText: {
    color: colors.text.accent,
  },
});
