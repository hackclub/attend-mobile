import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, StyleSheet, Text, View } from 'react-native';
import {
  Flashbar,
  Icon,
  PressableSurface,
  SheetHeader,
  SHEET_INSET,
  TextField,
  useSheetBottomPadding,
} from '../../components/ui';
import { useParticipants } from '../../hooks/useParticipants';
import { scannerSearchSheet } from '../../navigation/sheetData';
import { useCloseSheet } from '../../navigation/sheetPresenter';
import { useTheme } from '../../theme';
import type { Participant } from '../../types';
import { useSheetData } from './useSheetData';

// A query that reads as an attendee/participant-event ID rather than a name or
// email: one unbroken run of hex/dash characters (UUIDs) or 8+ alphanumerics.
export function looksLikeAttendeeId(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.includes('@') || /\s/.test(trimmed)) return false;
  return /^[0-9a-fA-F-]{16,}$/.test(trimmed) || /^[A-Za-z0-9_-]{8,}$/.test(trimmed);
}

/**
 * The scanner's Search (or, without roster access, Enter ID) sheet: find an
 * attendee by name or email, or type or paste their ID, and scan them in the
 * scanner's context. The camera stays running under it, paused.
 */
export function ScannerSearchSheet() {
  const { tokens, type, spacing } = useTheme();
  const bottomPadding = useSheetBottomPadding();
  const close = useCloseSheet();
  const data = useSheetData(scannerSearchSheet);
  const { search, clearSearch, searchResults, isSearching } = useParticipants();
  const [query, setQuery] = useState('');

  const canSearchRoster = data?.canSearchRoster ?? false;
  const onActivity = data?.onActivity;

  const handleChange = useCallback((text: string) => {
    onActivity?.();
    setQuery(text);
    // Without roster access there is nothing to look up as you type; the
    // sheet is a plain attendee-ID field, and scanning by ID still works.
    if (!canSearchRoster) return;
    if (text.length >= 2) void search(text);
    else clearSearch();
  }, [canSearchRoster, clearSearch, onActivity, search]);

  if (!data) return null;
  const { needsContext, isProcessing, onScanParticipant, onScanId } = data;
  const idCandidate = looksLikeAttendeeId(query) ? query.trim() : null;

  const scan = async (run: () => Promise<void>) => {
    if (isProcessing || needsContext) return;
    Keyboard.dismiss();
    await run();
    close();
  };

  const results = canSearchRoster ? searchResults ?? [] : [];
  const emptyText = !canSearchRoster
    ? "Your role on this event doesn't include participant records, so scan or paste an attendee ID."
    : query.length === 0
      ? 'Search by name or email, or paste an attendee ID'
      : query.length < 2
        ? 'Type at least 2 characters'
        : isSearching
          ? 'Searching'
          : 'No attendees found';

  return (
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={{ paddingBottom: bottomPadding }}
      data={results}
      keyExtractor={(item, index) => item.participant_event_id || item.participant_id || `attendee-${index}`}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      stickyHeaderIndices={[0]}
      ListHeaderComponent={(
        <View style={{ backgroundColor: tokens.bg, paddingBottom: spacing.sm }}>
          <SheetHeader title={canSearchRoster ? 'Find an attendee' : 'Enter an attendee ID'} />
          <View style={[styles.inset, { gap: spacing.md }]}>
            {needsContext ? (
              <Flashbar
                type="warning"
                message={'Choose a context before scanning. Close this and pick one from '
                  + 'the context picker — what you type here is kept.'}
              />
            ) : null}
            <TextField
              icon="search"
              placeholder={canSearchRoster ? 'Name, email, or attendee ID' : 'Attendee ID'}
              value={query}
              onChangeText={handleChange}
              clearable
              onSubmitEditing={() => {
                if (idCandidate) void scan(() => onScanId(idCandidate));
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType={idCandidate ? 'go' : 'search'}
              autoFocus
            />
          </View>
          {idCandidate ? (
            <ResultRow
              title="Scan as attendee ID"
              detail={idCandidate}
              busy={isProcessing}
              blocked={needsContext}
              onPress={() => void scan(() => onScanId(idCandidate))}
            />
          ) : null}
        </View>
      )}
      renderItem={({ item }) => (
        <ResultRow
          title={item.display_name || item.full_name}
          // Name and pronouns only: this list is read at the door, over the
          // scanner's shoulder, so no contact details.
          detail={item.pronouns || undefined}
          blocked={needsContext}
          onPress={() => void scan(() => onScanParticipant(item as Participant))}
        />
      )}
      ListEmptyComponent={idCandidate ? undefined : (
        <View style={styles.empty}>
          {isSearching ? <ActivityIndicator color={tokens.muted} /> : null}
          <Text style={[type.body, styles.emptyText, { color: tokens.muted }]}>{emptyText}</Text>
        </View>
      )}
    />
  );
}

function ResultRow({
  title,
  detail,
  busy,
  blocked,
  onPress,
}: {
  title: string;
  detail?: string;
  busy?: boolean;
  blocked: boolean;
  onPress: () => void;
}) {
  const { tokens, type } = useTheme();
  return (
    <PressableSurface
      onPress={onPress}
      disabled={blocked || busy}
      rippleColor={tokens.text}
      contentStyle={[styles.row, { borderBottomColor: tokens.div2 }, blocked && styles.blocked]}
      accessibilityRole="button"
      accessibilityLabel={`Scan ${title}`}
      accessibilityState={{ disabled: blocked || !!busy, busy: !!busy }}
    >
      <View style={styles.rowText}>
        <Text style={[type.label, { color: tokens.textH }]} numberOfLines={1}>{title}</Text>
        {detail ? (
          <Text style={[type.body, { color: tokens.text2 }]} numberOfLines={1}>{detail}</Text>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator color={tokens.success} size="small" />
      ) : (
        <View style={styles.rowAction}>
          <Text style={[type.label, { color: tokens.success }]}>Scan</Text>
          <Icon name="chevron-right" size={18} color={tokens.success} />
        </View>
      )}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  inset: { paddingHorizontal: SHEET_INSET },
  row: {
    minHeight: 64,
    paddingHorizontal: SHEET_INSET,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  rowAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  blocked: { opacity: 0.5 },
  empty: { paddingVertical: 32, paddingHorizontal: SHEET_INSET, alignItems: 'center', gap: 8 },
  emptyText: { textAlign: 'center' },
});
