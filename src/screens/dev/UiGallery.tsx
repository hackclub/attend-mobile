import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionMenu,
  Button,
  Container,
  FilterChip,
  SegmentedControl,
  Spinner,
  Screen,
  Toggle,
} from '../../components/ui';
import { DateTimeField, MultiSelectField, SelectField } from '../../components/forms';
import { ScanFrame, ScannerDock } from '../../components/ScannerChrome';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { resetRoot } from '../../navigation/rootNavigation';
import { groupSwitcherEvents } from '../../services/eventSwitcher';
import type { FilterRule, SortRule } from '../../services/participantFilters';
import { scanFrameSize } from '../../services/scannerLayout';
import {
  accountSheetPreview,
  filterSheet,
  kioskSetupSheet,
  switchEventSheet,
  linkSheet,
  multiSelectSheet,
  optionsSheet,
  scanContextSheet,
  type SheetOption,
} from '../../navigation/sheetData';
import { useOpenSheet } from '../../navigation/sheetPresenter';
import { overlayTokens, useTheme, useThemePreference, type ThemePreference } from '../../theme';
import type { Event, ScanContext, SelectOption, Ticket } from '../../types';

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

const DAY = 86_400_000;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
const sampleEvent = (id: string, name: string, startIn: number, days: number, role?: string): Event => ({
  id,
  name,
  slug: id,
  starts_at: isoDay(startIn),
  ends_at: isoDay(startIn + days),
  location_city: 'Sydney',
  role,
});
const sampleTicket = (event: Event): Ticket => ({
  id: `ticket-${event.id}`,
  participant_id: 'sample',
  status: 'confirmed',
  display_status: 'Confirmed',
  confirmed: true,
  checked_in: false,
  attendee_name: 'Sample Person',
  qr_payload: 'attend://checkin/sample',
  short_code: 'SAMPLE',
  onboarding_url: 'https://example.com',
  event,
});

// The switcher's sample events: two organized (one running, the current
// one), one attended, and one of each that has ended.
const SWITCHER_GROUPS = groupSwitcherEvents(
  [
    sampleEvent('hackathon', 'Sample Hackathon', -1, 2, 'event_admin'),
    sampleEvent('spring-jam', 'Spring Jam', 30, 1, 'event_admin'),
    sampleEvent('winter-build', 'Winter Build', -60, 2, 'event_admin'),
  ],
  [sampleTicket(sampleEvent('summer-camp', 'Summer Camp', 60, 3)), sampleTicket(sampleEvent('autumn-jam', 'Autumn Jam', -120, 1))]
);

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
  const { tokens, type, spacing } = useTheme();
  const { preference, setPreference } = useThemePreference();
  const openSheet = useOpenSheet();
  const navigation = useNavigation();
  const [lastAction, setLastAction] = useState('Nothing yet');
  const [scannerPreview, setScannerPreview] = useState(false);
  // What the real drawers do after closing (reset the root, open the
  // kiosk) stands in as a reset to this screen, to check the app still
  // takes touches afterwards.
  const resetHere = (action: string) => {
    resetRoot(navigation, { index: 0, routes: [{ name: 'UiGallery' }] });
    setLastAction(action);
  };
  const claimSwitcher = switchEventSheet.useOpener({
    preview: {
      groups: SWITCHER_GROUPS,
      currentEventId: 'hackathon',
      onPick: (name) => resetHere(`Switched to ${name}`),
    },
  });
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
            title="Switch event"
            onPress={() => {
              claimSwitcher();
              openSheet('SwitchEventSheet');
            }}
          />
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
  const [powerMode, setPowerMode] = useState(true);
  const size = scanFrameSize(width, height, isRegular);
  return (
    <SafeAreaView style={styles.scanner} edges={['top', 'bottom', 'left', 'right']}>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fill: { flex: 1 },
  chips: { gap: 8 },
});
