import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Sentry from '@sentry/react-native';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { haptics } from '../services/haptics';
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
import { useTheme, type ThemeTokens } from '../theme';
import { Button, Container, Flashbar, Icon, KeyValue, TextField, type IconName } from '../components/ui';
import { BiometricGate } from '../components/BiometricGate';
import type { AppStackParamList } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'IdCheck'>;

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

// The ID check shows the participant's legal name, date of birth and
// photo, so it sits behind the same biometric gate as participant details.
// It's opened from an unlocked detail view, so normally the gate passes
// straight through; it locks again if the app is backgrounded meanwhile.
export function IdCheckScreen(props: Props) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.flex, { backgroundColor: tokens.shaded }]}>
      <BiometricGate
        reason="Authenticate to check this participant's ID"
        onCancel={() => props.navigation.goBack()}
      >
        <IdCheckFlow {...props} />
      </BiometricGate>
    </View>
  );
}

function IdCheckFlow({ route, navigation }: Props) {
  const { participant, eventId } = route.params;
  const { tokens, type, spacing } = useTheme();
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
      const outcome = verdict(input);
      haptics.notify(outcome === 'green' ? 'success' : outcome === 'amber' ? 'warning' : 'error');
      setStep({ kind: 'result', result, input, outcome });
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
      <SafeAreaView style={styles.flex}>
        <View style={[styles.centered, { padding: spacing.xxl, gap: spacing.lg }]}>
          <Text style={[type.body, { color: tokens.text2 }]}>ID checks are available to global admins only.</Text>
          <Button title="Close" onPress={close} fullWidth />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      {/* A full-screen modal, so Cancel is the way out (and Android's back). */}
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
        <Button title="Cancel" variant="link" onPress={close} style={styles.cancel} />
        <Text style={[type.h1, { color: tokens.textH }]} accessibilityRole="header">
          Verify ID
        </Text>
      </View>

      <Sentry.Mask style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { padding: spacing.lg, gap: spacing.lg }]}
          keyboardShouldPersistTaps="handled"
        >
          <ParticipantHeader
            name={[legalFirstName, legalLastName].filter(Boolean).join(' ') || participant.full_name}
            headshotUrl={participant.headshot_url}
          />

          {!readerSupported ? (
            <Flashbar type="error" message="This device can't read document chips. ID checks need an iPhone with NFC." />
          ) : null}
          {readerSupported && !trustAnchors ? (
            <Flashbar
              type="warning"
              message="This build has no trust list, so no document can be fully verified. Results will be amber at best."
            />
          ) : null}
          {!legalFirstName || !legalLastName ? (
            <Flashbar type="warning" message="The Attend record has no legal name, so the name can't be matched." />
          ) : null}

          {step.kind === 'access' && readerSupported ? (
            <Container title="1. Scan the document">
              <View style={styles.section}>
                <Text style={[type.body, { color: tokens.text2 }]}>
                  Scan the lines of {'<<<'} characters at the bottom of the photo page, or on the back of an ID card.
                  This unlocks the chip. Only chipped passports and ID cards (with the chip symbol) can be checked.
                </Text>
                {step.error ? <Flashbar type="error" message={step.error} /> : null}
                {cameraSupported ? (
                  <Button title="Scan document" variant="primary" icon="camera" fullWidth onPress={handleScan} />
                ) : null}
                <Button title="Enter details by hand" fullWidth onPress={() => setStep({ kind: 'manual' })} />
              </View>
            </Container>
          ) : null}

          {step.kind === 'manual' ? (
            <Container title="1. Enter the document details">
              <View style={styles.section}>
                <Text style={[type.body, { color: tokens.text2 }]}>
                  Copy them from the document. Dates are YYMMDD, for example 080314.
                </Text>
                <PrivateField
                  label="Document number"
                  value={manual.documentNumber}
                  onChangeText={(documentNumber) => setManual((m) => ({ ...m, documentNumber }))}
                  autoCapitalize="characters"
                />
                <PrivateField
                  label="Date of birth (YYMMDD)"
                  value={manual.dateOfBirth}
                  onChangeText={(dateOfBirth) => setManual((m) => ({ ...m, dateOfBirth }))}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <PrivateField
                  label="Expiry date (YYMMDD)"
                  value={manual.dateOfExpiry}
                  onChangeText={(dateOfExpiry) => setManual((m) => ({ ...m, dateOfExpiry }))}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                {step.error ? <Flashbar type="error" message={step.error} /> : null}
                <Button
                  title="Continue"
                  variant="primary"
                  icon="chevron-right"
                  iconPosition="end"
                  fullWidth
                  onPress={handleManualContinue}
                />
                <Button title="Back" fullWidth onPress={() => setStep({ kind: 'access' })} />
              </View>
            </Container>
          ) : null}

          {step.kind === 'ready' || step.kind === 'reading' ? (
            <Container title="2. Read the chip">
              <View style={styles.section}>
                <Text style={[type.body, { color: tokens.text2 }]}>
                  Place the top of the iPhone flat on the document: on the photo page or cover of a passport, or the
                  middle of an ID card. Hold still until the read finishes.
                </Text>
                {step.kind === 'ready' && step.error ? <Flashbar type="error" message={step.error} /> : null}
                {step.kind === 'reading' ? (
                  <Busy label="Reading..." />
                ) : (
                  <>
                    <Button
                      title="Read chip"
                      variant="primary"
                      icon="nfc"
                      fullWidth
                      onPress={() => handleRead(step.access)}
                    />
                    <Button title="Scan a different document" fullWidth onPress={reset} />
                  </>
                )}
              </View>
            </Container>
          ) : null}

          {step.kind === 'result' || step.kind === 'recording' || step.kind === 'recordFailed' ? (
            <ResultView
              step={step}
              headshotUrl={participant.headshot_url}
              onDecision={(decision) => {
                if (step.kind === 'result' || step.kind === 'recordFailed') handleDecision(step, decision);
              }}
              onRestart={reset}
            />
          ) : null}

          {step.kind === 'recorded' ? (
            <View style={styles.section}>
              <OutcomeBanner
                outcome={step.outcome}
                title={step.decision === 'confirmed' ? 'Identity confirmed' : 'Identity rejected'}
              />
              <Text style={[type.body, { color: tokens.text2 }]}>
                The outcome was added to the participant&apos;s notes. No document data was stored.
              </Text>
              <Button title="Done" variant="primary" icon="check" fullWidth onPress={close} />
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
}: {
  step: Extract<Step, { kind: 'result' | 'recording' | 'recordFailed' }>;
  headshotUrl?: string | null;
  onDecision: (decision: Decision) => void;
  onRestart: () => void;
}) {
  const { tokens, type } = useTheme();
  const { result, input, outcome } = step;
  const reasons = verdictReasons(input);
  const busy = step.kind === 'recording';
  const title = { green: 'Document verified', amber: 'Check carefully', red: 'Do not accept' }[outcome];

  return (
    <View style={styles.section}>
      <OutcomeBanner outcome={outcome} title={title} reasons={reasons} />

      <Container title="3. Compare the photos">
        <View style={styles.section}>
          <Text style={[type.body, { color: tokens.text2 }]}>
            Compare the chip photo with the Attend photo and with the person in front of you. You decide; nothing is
            matched automatically.
          </Text>
          <View style={styles.photos}>
            <Photo label="Chip" uri={result.photoJpegBase64 ? `data:image/jpeg;base64,${result.photoJpegBase64}` : null} />
            <Photo label="Attend" uri={headshotUrl ?? null} />
          </View>
        </View>
      </Container>

      <Container>
        <KeyValue
          layout="stacked"
          label="Document"
          value={`${result.issuingState} ${DOCUMENT_LABELS[result.documentType] ?? 'document'}`}
        />
        <KeyValue layout="stacked" label="Name on chip" value={`${result.givenNames} ${result.surname}`.trim()} />
        <KeyValue
          layout="stacked"
          label="Chip"
          value={`${result.checks.accessProtocol}, active auth ${result.checks.activeAuth}, chip auth ${result.checks.chipAuth}`}
        />
      </Container>

      {step.kind === 'recordFailed' ? <Flashbar type="error" message="Check not recorded. Try again." /> : null}

      {busy ? (
        <Busy label="Recording..." />
      ) : step.kind === 'recordFailed' ? (
        <Button title="Retry" variant="primary" icon="refresh" fullWidth onPress={() => onDecision(step.decision)} />
      ) : (
        <>
          {/* A red result can only be recorded as a rejection. */}
          {outcome !== 'red' ? (
            <Button
              title="Confirm identity"
              variant="primary"
              icon="check-circle"
              fullWidth
              onPress={() => onDecision('confirmed')}
            />
          ) : null}
          <Button title="Reject" icon="x-circle" fullWidth onPress={() => onDecision('rejected')} />
          <Button title="Start again" variant="link" fullWidth onPress={onRestart} />
        </>
      )}
    </View>
  );
}

function ParticipantHeader({ name, headshotUrl }: { name: string; headshotUrl?: string | null }) {
  const { tokens, type } = useTheme();
  return (
    <Container>
      <View style={styles.participant}>
        {/* React Native's Image (memory cache only), as for the photos below. */}
        {headshotUrl ? (
          <Image source={{ uri: headshotUrl }} style={[styles.participantPhoto, { backgroundColor: tokens.div2 }]} />
        ) : null}
        <View style={styles.flex}>
          <Text style={[type.label, { color: tokens.text2 }]}>Checking</Text>
          <Text style={[type.h2, { color: tokens.textH }]}>{name}</Text>
        </View>
      </View>
    </Container>
  );
}

// React Native's Image, not expo-image: expo-image caches to disk, and the chip
// photo must stay in memory.
function Photo({ label, uri }: { label: string; uri: string | null }) {
  const { tokens, type, radii } = useTheme();
  const frame = [styles.photo, { borderRadius: radii.item, backgroundColor: tokens.div2 }];
  return (
    <View style={styles.photoColumn}>
      {uri ? (
        <Image source={{ uri }} style={frame} resizeMode="cover" />
      ) : (
        <View style={[frame, styles.photoMissing]}>
          <Text style={[type.body, { color: tokens.muted }]}>No photo</Text>
        </View>
      )}
      <Text style={[type.label, { color: tokens.text2 }]}>{label}</Text>
    </View>
  );
}

function outcomeColors(outcome: CheckResult, t: ThemeTokens): { bg: string; fg: string; icon: IconName } {
  switch (outcome) {
    case 'green':
      return { bg: t.badgeGreen, fg: t.onStatusFill, icon: 'check-circle' };
    case 'amber':
      return { bg: t.warningFill, fg: t.onWarningFill, icon: 'exclamation' };
    case 'red':
      return { bg: t.badgeRed, fg: t.onStatusFill, icon: 'x-circle' };
  }
}

function OutcomeBanner({ outcome, title, reasons }: { outcome: CheckResult; title: string; reasons?: string[] }) {
  const { tokens, type, radii } = useTheme();
  const { bg, fg, icon } = outcomeColors(outcome, tokens);
  return (
    <View
      style={[styles.banner, { backgroundColor: bg, borderRadius: radii.flash }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <View style={styles.bannerHead}>
        <Icon name={icon} size={24} color={fg} />
        <Text style={[type.h2, styles.flex, { color: fg }]}>{title}</Text>
      </View>
      {reasons && reasons.length > 0 ? (
        <View style={styles.reasons}>
          {reasons.map((reason) => (
            <Text key={reason} style={[type.body, { color: fg }]}>
              {'•'} {reason}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Busy({ label }: { label: string }) {
  const { tokens, type } = useTheme();
  return (
    <View style={styles.busy} accessibilityLiveRegion="polite">
      <ActivityIndicator color={tokens.accent} />
      <Text style={[type.body, { color: tokens.text2 }]}>{label}</Text>
    </View>
  );
}

// Document details must never be offered to autofill or a keyboard's
// suggestions, so every hint that could store them is off.
function PrivateField(props: React.ComponentProps<typeof TextField> & { label: string }) {
  return (
    <TextField
      {...props}
      autoCorrect={false}
      autoComplete="off"
      importantForAutofill="no"
      textContentType="none"
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center' },
  cancel: { marginLeft: -12, marginTop: 4 },
  content: { paddingBottom: 48 },
  participant: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  participantPhoto: { width: 48, height: 48, borderRadius: 24 },
  section: { gap: 12 },
  busy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12 },
  banner: { padding: 16, gap: 8 },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reasons: { gap: 4 },
  photos: { flexDirection: 'row', gap: 12 },
  photoColumn: { flex: 1, alignItems: 'center', gap: 6 },
  photo: { width: '100%', aspectRatio: 0.78 },
  photoMissing: { alignItems: 'center', justifyContent: 'center' },
});
