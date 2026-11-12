import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  ActionMenu,
  Button,
  Container,
  FilterChip,
  SegmentedControl,
  Spinner,
  Screen,
  QuickActionTile,
  Toggle,
} from '../../components/ui';
import { DateTimeField, MultiSelectField, SelectField } from '../../components/forms';
import { ScanFrame, ScannerDock } from '../../components/ScannerChrome';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { resetRoot } from '../../navigation/rootNavigation';
import type { FilterRule, SortRule } from '../../services/participantFilters';
import { scanFrameSize } from '../../services/scannerLayout';
import {
  accountSheetPreview,
  filterSheet,
  kioskSetupSheet,
  linkSheet,
  multiSelectSheet,
  optionsSheet,
  scanContextSheet,
  type SheetOption,
} from '../../navigation/sheetData';
import { useOpenSheet } from '../../navigation/sheetPresenter';
import { overlayTokens, useTheme, useThemePreference, type ThemePreference } from '../../theme';
import type { Participant, ScanContext, SelectOption } from '../../types';
import type { ScannerResult } from '../../services/scannerCore';
import { KioskWelcome } from '../../components/KioskWelcome';

// Sample data only: the gallery never touches the network or the session.
const PEOPLE = [
  'Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Linus Torvalds',
  'Margaret Hamilton', 'Dennis Ritchie', 'Barbara Liskov', 'Ken Thompson', 'Radia Perlman',
  'Tim Berners-Lee', 'Frances Allen', 'Donald Knuth', 'Hedy Lamarr', 'Guido van Rossum',
  'Annie Easley', 'John McCarthy', 'Shafi Goldwasser', 'Vint Cerf', 'Mary Kenneth Keller',
  'Edsger Dijkstra', 'Adele Goldberg', 'Bjarne Stroustrup', 'Sophie Wilson', 'Leslie Lamport',
].map((name, index) => ({
  id: `person-${index}`,
  title: name,
  subtitle: `${name.split(' ')[0].toLowerCase()}@example.com`,
}));

const CONTEXTS: ScanContext[] = [
  { id: 'ctx-door', name: 'Front door', checks_in: true, is_airport: false },
  { id: 'ctx-lunch', name: 'Lunch', checks_in: false, is_airport: false },
  { id: 'ctx-airport', name: 'Airport pickup', checks_in: false, is_airport: true },
];

const SHORT_OPTIONS: SelectOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const LONG_OPTIONS: SelectOption[] = [
  'Australia', 'Canada', 'Germany', 'India', 'Japan', 'Kenya', 'Mexico', 'New Zealand', 'Singapore', 'United Kingdom',
].map((label) => ({ value: label.toLowerCase(), label }));

const UNDO_OPTIONS: SheetOption[] = [
  { value: 'door', label: 'Front door', description: 'Today, 9:41' },
  { value: 'lunch', label: 'Lunch', description: 'Today, 12:30' },
  { value: 'undo-all', label: 'Undo every scan', destructive: true },
  { value: 'locked', label: 'Airport pickup', description: 'Not yours to undo', disabled: true },
];

const SAMPLE_USER = {
  id: 'sample',
  name: 'Sample Organizer',
  email: 'sample@example.com',
  is_organizer: true,
  is_participant: true,
};

const APPEARANCE_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

/**
 * A dev screen showing every drawer and platform control with sample data,
 * to check them on a device (attend://ui-gallery). Only registered in builds
 * made with EXPO_PUBLIC_UI_GALLERY=1, and reachable while signed out.
 */
export function UiGallery() {
  const { tokens, type, spacing, radii } = useTheme();
  const { preference, setPreference } = useThemePreference();
  const openSheet = useOpenSheet();
  const navigation = useNavigation();
  const [lastAction, setLastAction] = useState('Nothing yet');
  const [scannerPreview, setScannerPreview] = useState(false);
  const [kioskWelcomePreview, setKioskWelcomePreview] = useState(false);
  // What the real drawers do after closing (reset the root, open the
  // kiosk) stands in as a reset to this screen, to check the app still
  // takes touches afterwards.
  const resetHere = (action: string) => {
    resetRoot(navigation, { index: 0, routes: [{ name: 'UiGallery' }] });
    setLastAction(action);
  };
  const claimAccount = accountSheetPreview.useOpener({
    user: SAMPLE_USER,
    onSignOut: () => resetHere('Signed out'),
  });
  const claimKiosk = kioskSetupSheet.useOpener({
    scanContextId: CONTEXTS[0].id,
    scanContextName: CONTEXTS[0].name,
    preview: { onStart: () => resetHere('Started kiosk') },
  });
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [filterConjunction, setFilterConjunction] = useState<'and' | 'or'>('and');
  const [filterSort, setFilterSort] = useState<SortRule | null>(null);
  const claimFilter = filterSheet.useOpener({
    rules: filterRules,
    onRulesChange: setFilterRules,
    conjunction: filterConjunction,
    onConjunctionChange: setFilterConjunction,
    sort: filterSort,
    onSortChange: setFilterSort,
    savedViews: [],
    onSaveView: (name) => setLastAction(`Saved view ${name}`),
    onDeleteView: () => {},
    filterContext: { scanContexts: CONTEXTS, participants: [] },
  });

  // Sheets
  const [picked, setPicked] = useState<string[]>(PEOPLE.slice(0, 2).map((person) => person.id));
  const [undo, setUndo] = useState<string | null>('door');
  const [link, setLink] = useState('');
  const [context, setContext] = useState<string | null>(CONTEXTS[0].id);
  const claimMultiSelect = multiSelectSheet.useOpener({
    title: 'Add participants',
    items: PEOPLE,
    selected: picked,
    onChange: setPicked,
    noun: ['participant', 'participants'],
    searchPlaceholder: 'Search by name or email',
  });
  const claimOptions = optionsSheet.useOpener({
    title: 'Undo a scan',
    subtitle: 'Sample Person',
    options: UNDO_OPTIONS,
    selected: undo,
    onSelect: setUndo,
  });
  const claimLink = linkSheet.useOpener({ onSubmit: setLink });
  const claimContext = scanContextSheet.useOpener({
    title: 'Scan context',
    eventName: 'Sample Hackathon',
    contexts: CONTEXTS,
    selectedId: context,
    onSelect: (next) => setContext(next.id),
  });

  // Controls
  const [toggleOn, setToggleOn] = useState(true);
  const [toggleOff, setToggleOff] = useState(false);
  const [view, setView] = useState<'arrivals' | 'departures'>('arrivals');
  const [conjunction, setConjunction] = useState<'and' | 'or'>('and');
  const [chartShown, setChartShown] = useState(true);
  const [short, setShort] = useState<string | null>('medium');
  const [long, setLong] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [date, setDate] = useState<Date | null>(null);
  const [laterDate, setLaterDate] = useState<Date | null>(() => new Date());
  const [chip, setChip] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const minimumDate = useMemo(() => new Date(), []);

  const label = (text: string) => (
    <Text style={[type.small, { color: tokens.text2 }]}>{text}</Text>
  );

  if (scannerPreview) return <ScannerPreview onClose={() => setScannerPreview(false)} />;
  if (kioskWelcomePreview) return <KioskWelcomePreview onClose={() => setKioskWelcomePreview(false)} />;

  return (
    <Screen title="UI gallery" contentContainerStyle={{ gap: spacing.lg }}>
      <Text style={[type.body, { color: tokens.text2 }]}>
        Sample data only. Last action: {lastAction}
      </Text>

      <Container title="Appearance">
        <SegmentedControl<ThemePreference>
          options={APPEARANCE_OPTIONS}
          value={preference}
          onChange={setPreference}
          accessibilityLabel="Theme"
        />
      </Container>

      <Container title="Drawers">
        <View style={styles.stack}>
          <Button
            title="Account"
            onPress={() => {
              claimAccount();
              openSheet('AccountSheet');
            }}
          />
          <Button
            title={`Filter and sort (${filterRules.length} filters${filterSort ? `, by ${filterSort.field}` : ''})`}
            onPress={() => {
              claimFilter();
              openSheet('FilterSheet');
            }}
          />
          <Button
            title="Kiosk setup"
            onPress={() => {
              claimKiosk();
              openSheet('KioskSetupSheet');
            }}
          />
          <Button title="Scanner layout" onPress={() => setScannerPreview(true)} />
          <Button title="Kiosk welcome" onPress={() => setKioskWelcomePreview(true)} />
        </View>
      </Container>

      <Container title="Cards">
        <View style={styles.stack}>
          <View style={styles.row}>
            <QuickActionTile icon="chat" tint="sky" label="Messages" subLabel="2 unread" onPress={() => {}} />
            <QuickActionTile icon="shield-exclamation" tint="red" label="Report an incident" onPress={() => {}} />
          </View>
          <View style={[styles.placeholder, { borderColor: tokens.box, borderRadius: radii.container }]}>
            <Text style={[type.h3, { color: tokens.textH }]}>A dashed placeholder</Text>
          </View>
        </View>
      </Container>

      <Container title="Sheets">
        <View style={styles.stack}>
          <Button
            title={`List with search (${picked.length} picked)`}
            onPress={() => {
              claimMultiSelect();
              openSheet('MultiSelectSheet');
            }}
          />
          <Button
            title={`Options (${undo ?? 'none'})`}
            onPress={() => {
              claimOptions();
              openSheet('OptionsSheet');
            }}
          />
          <Button
            title={`Single choice (${CONTEXTS.find((c) => c.id === context)?.name ?? 'none'})`}
            onPress={() => {
              claimContext();
              openSheet('ScanContextSheet');
            }}
          />
          <Button
            title="Text field"
            onPress={() => {
              claimLink();
              openSheet('LinkSheet');
            }}
          />
          {link ? label(`Link: ${link}`) : null}
        </View>
      </Container>

      <Container title="Switches">
        <View style={styles.stack}>
          <View style={styles.row}>
            <Text style={[type.body, styles.fill, { color: tokens.text }]}>On</Text>
            <Toggle value={toggleOn} onValueChange={setToggleOn} accessibilityLabel="On" />
          </View>
          <View style={styles.row}>
            <Text style={[type.body, styles.fill, { color: tokens.text }]}>Off</Text>
            <Toggle value={toggleOff} onValueChange={setToggleOff} accessibilityLabel="Off" />
          </View>
          <View style={styles.row}>
            <Text style={[type.body, styles.fill, { color: tokens.text }]}>Disabled, on</Text>
            <Toggle value onValueChange={() => {}} accessibilityLabel="Disabled, on" disabled />
          </View>
          <View style={styles.row}>
            <Text style={[type.body, styles.fill, { color: tokens.text }]}>Disabled, off</Text>
            <Toggle value={false} onValueChange={() => {}} accessibilityLabel="Disabled, off" disabled />
          </View>
        </View>
      </Container>

      <Container title="Segmented buttons">
        <View style={styles.stack}>
          <SegmentedControl
            options={[
              { value: 'arrivals', label: 'Arrivals', count: 14 },
              { value: 'departures', label: 'Departures', count: 3 },
            ]}
            value={view}
            onChange={setView}
            accessibilityLabel="Travel"
            role="tab"
          />
          <SegmentedControl
            options={[
              { value: 'and', label: 'All' },
              { value: 'or', label: 'Any' },
            ]}
            value={conjunction}
            onChange={setConjunction}
            accessibilityLabel="Match"
          />
        </View>
      </Container>

      <Container title="Menus">
        <View style={styles.stack}>
          <View style={styles.row}>
            <Text style={[type.body, styles.fill, { color: tokens.text }]}>Actions, a title and a tick</Text>
            <ActionMenu
              accessibilityLabel="More"
              title="Sample menu"
              actions={[
                { key: 'edit', title: 'Edit', onSelect: () => setLastAction('Edit') },
                {
                  key: 'chart',
                  title: 'Show chart',
                  checked: chartShown,
                  onSelect: () => setChartShown((shown) => !shown),
                },
                { key: 'disabled', title: 'Not available', disabled: true, onSelect: () => {} },
                { key: 'delete', title: 'Delete', destructive: true, onSelect: () => setLastAction('Delete') },
              ]}
            />
          </View>
          {label('A short select (a menu)')}
          <SelectField title="Priority" value={short} options={SHORT_OPTIONS} onChange={setShort} />
          {label('A long select (the options sheet)')}
          <SelectField title="Country" value={long} options={LONG_OPTIONS} onChange={setLong} />
          {label('A multi-select (the list sheet)')}
          <MultiSelectField
            title="Staff"
            items={PEOPLE}
            selected={multi}
            onChange={setMulti}
            noun={['person', 'people']}
          />
        </View>
      </Container>

      <Container title="Date and time">
        <View style={styles.stack}>
          {label('Not set')}
          <DateTimeField value={date} onChange={setDate} />
          {label('Set, from today on')}
          <DateTimeField value={laterDate} onChange={setLaterDate} minimumDate={minimumDate} />
        </View>
      </Container>

      <Container title="Filter chips">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <FilterChip label="All events" selected={chip === null} onPress={() => setChip(null)} />
          {['Sample Hackathon', 'Spring Jam', 'Summer Camp'].map((name) => (
            <FilterChip key={name} label={name} selected={chip === name} onPress={() => setChip(name)} />
          ))}
        </ScrollView>
      </Container>

      <Container title="Progress">
        <View style={styles.stack}>
          <View style={[styles.row, { gap: spacing.lg }]}>
            <Spinner size="small" color={tokens.accent} />
            <Spinner size="large" color={tokens.accent} />
          </View>
          <Button
            title="Loading button"
            variant="primary"
            loading={loading}
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 2000);
            }}
          />
        </View>
      </Container>
    </Screen>
  );
}

/**
 * The scanner's layout without a camera: the context pill at the top, the
 * frame at its real size and the bottom row, over the dark camera stage.
 */
function ScannerPreview({ onClose }: { onClose: () => void }) {
  const { type } = useTheme();
  const { width, height } = useWindowDimensions();
  const { isRegular } = useResponsiveLayout();
  const [torchOn, setTorchOn] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [powerMode, setPowerMode] = useState(true);
  const size = scanFrameSize(width, height, isRegular);
  return (
    <SafeAreaView style={styles.scanner} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={styles.scannerHeader}>
        <View style={styles.scannerPill}>
          <Text style={[type.body, { color: overlayTokens.onMuted }]} numberOfLines={1}>Sample Hackathon</Text>
          <Text style={[type.body, { color: overlayTokens.onMuted }]}>›</Text>
          <Text style={[type.label, { color: overlayTokens.on }]} numberOfLines={1}>Front door</Text>
        </View>
        <Button title="Close" variant="link" onPress={onClose} />
      </View>
      {powerMode ? (
        <View style={styles.powerNote}>
          <Text style={[type.small, { color: overlayTokens.on }]}>Power mode</Text>
        </View>
      ) : null}
      <View style={styles.scannerStage}>
        <ScanFrame size={size} accessibilityLabel={`Scan frame, ${size} points`} />
        <Text style={[type.small, { color: overlayTokens.onMuted }]}>
          Frame {size} of {Math.round(width)} wide
        </Text>
      </View>
      <View style={styles.scannerDock}>
        <ScannerDock
          torchOn={torchOn}
          onTorch={() => setTorchOn((on) => !on)}
          facing={facing}
          onFlipCamera={() => {
            setTorchOn(false);
            setFacing((f) => (f === 'back' ? 'front' : 'back'));
          }}
          menuActions={[
            { key: 'power-mode', title: 'Power mode', checked: powerMode, onSelect: () => setPowerMode((on) => !on) },
            { key: 'kiosk', title: 'Kiosk mode', onSelect: () => {} },
          ]}
          searchTitle="Search"
          onSearch={() => {}}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scanner: { flex: 1, backgroundColor: overlayTokens.cameraStage },
  scannerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  scannerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    flexShrink: 1,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: overlayTokens.cameraControl,
  },
  powerNote: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginRight: 16,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: overlayTokens.cameraControl,
  },
  scannerStage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  scannerDock: { paddingHorizontal: 10, paddingBottom: 12 },
  stack: { gap: 12 },
  placeholder: { borderWidth: 1, borderStyle: 'dashed', padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fill: { flex: 1 },
  chips: { gap: 8 },
});

const SAMPLE_ATTENDEE = {
  participant_id: 'sample',
  participant_event_id: 'sample',
  display_name: 'Ingo Wolf',
  full_name: 'Ingo Wolf',
  email: 'sample@example.com',
  status: 'confirmed',
} as Participant;

/**
 * Kiosk mode's scan answer (KioskWelcome) over a stand-in camera, with a
 * button per outcome; each shows for as long as the kiosk would show it.
 */
function KioskWelcomePreview({ onClose }: { onClose: () => void }) {
  const { tokens, type } = useTheme();
  const { width, height } = useWindowDimensions();
  const [result, setResult] = useState<ScannerResult | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const size = Math.min(width - 48, height * 0.42, 280);
  const origin = { x: (width - size) / 2, y: height * 0.3, width: size, height: size };

  const show = (outcome: ScannerResult['outcome'], message?: string) => {
    clearTimeout(timer.current);
    setResult({
      attemptId: `${outcome}-${Date.now()}`,
      rawData: 'sample',
      source: 'qr',
      outcome,
      participant: outcome === 'not_scanned' ? undefined : SAMPLE_ATTENDEE,
      message,
      retryable: false,
    });
    if (outcome !== 'confirming') timer.current = setTimeout(() => setResult(null), 2500);
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tokens.bg }]}>
      <Text style={[type.h1, { color: tokens.textH, textAlign: 'center', marginTop: height * 0.3 - 56 }]}>
        Scan your QR code
      </Text>
      <View
        style={{
          position: 'absolute',
          left: origin.x,
          top: origin.y,
          width: size,
          height: size,
          borderRadius: 24,
          backgroundColor: overlayTokens.cameraStage,
        }}
      />
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: 48, gap: 8 }}>
        <Button title="Scanned" onPress={() => show('scanned')} />
        <Button title="Already scanned" onPress={() => show('already_scanned')} />
        <Button title="Saved offline" onPress={() => show('queued')} />
        <Button title="Not scanned" onPress={() => show('not_scanned', 'This QR code isn’t for this event.')} />
        <Button title="Close" variant="link" onPress={onClose} />
      </View>
      <KioskWelcome result={result} origin={origin} />
    </View>
  );
}
