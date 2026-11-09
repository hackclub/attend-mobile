import type { ReactNode } from 'react';
import type {
  Conjunction,
  FilterContext,
  FilterRule,
  SavedView,
  SortRule,
} from '../services/participantFilters';
import type { SwitcherGroups } from '../services/eventSwitcher';
import type { Participant, ScanContext } from '../types';
import { createSheetChannel } from './sheetChannel';

// The data each form-sheet route reads, kept apart from the sheets' own
// modules so a screen can open one without loading it.

/** The event switcher. */
export interface SwitchEventSheetData {
  /** The pass it was opened from, marked as current (rather than the event). */
  currentTicketId?: string;
  /**
   * The dev gallery's sample events, shown instead of the user's; picking
   * one calls `onPick` with its name, once the sheet has gone, rather than
   * switching.
   */
  preview?: { groups: SwitcherGroups; currentEventId?: string; onPick: (name: string) => void };
}
export const switchEventSheet = createSheetChannel<SwitchEventSheetData>();

/** The one scan-context picker, for the scanner and for kiosk setup. */
export interface ScanContextSheetData {
  title: string;
  /** The event the contexts belong to. */
  eventName?: string;
  contexts: ScanContext[];
  selectedId?: string | null;
  onSelect: (context: ScanContext) => void;
}
export const scanContextSheet = createSheetChannel<ScanContextSheetData>();

/** The scanner's search / Enter ID sheet. */
export interface ScannerSearchSheetData {
  /** Without roster access it's an attendee-ID field only. */
  canSearchRoster: boolean;
  needsContext: boolean;
  isProcessing: boolean;
  /** Scans the participant or ID; the sheet closes once it resolves. */
  onScanParticipant: (participant: Participant) => Promise<void>;
  onScanId: (identifier: string) => Promise<void>;
  /** Keeps power mode from dimming while someone types. */
  onActivity: () => void;
}
export const scannerSearchSheet = createSheetChannel<ScannerSearchSheetData>();

/** People's filter & sort. */
export interface FilterSheetData {
  rules: FilterRule[];
  onRulesChange: (rules: FilterRule[]) => void;
  conjunction: Conjunction;
  onConjunctionChange: (conjunction: Conjunction) => void;
  sort: SortRule | null;
  onSortChange: (sort: SortRule | null) => void;
  savedViews: SavedView[];
  onSaveView: (name: string) => void;
  onDeleteView: (viewId: string) => void;
  filterContext: FilterContext;
}
export const filterSheet = createSheetChannel<FilterSheetData>();

export interface SheetOption {
  value: string;
  label: string;
  /** A muted second line, only when it adds something to the label. */
  description?: string;
  destructive?: boolean;
  disabled?: boolean;
}

/** A single-choice list: a form's longer select fields, or an action list. */
export interface OptionsSheetData {
  title: string;
  subtitle?: string;
  options: SheetOption[];
  /** Ticked. Leave out for a list of actions. */
  selected?: string | null;
  /** Called after the sheet starts closing. */
  onSelect: (value: string) => void;
  renderOption?: (option: SheetOption) => ReactNode;
}
export const optionsSheet = createSheetChannel<OptionsSheetData>();

export interface MultiSelectSheetItem {
  id: string;
  title: string;
  subtitle?: string | null;
  trailing?: ReactNode;
}

/** A searchable checklist, live: each tick calls onChange. */
export interface MultiSelectSheetData {
  title: string;
  items: MultiSelectSheetItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Singular and plural, e.g. ['participant', 'participants']. */
  noun: [string, string];
  searchPlaceholder?: string;
}
export const multiSelectSheet = createSheetChannel<MultiSelectSheetData>();

/** The message editor's "Add a link". */
export interface LinkSheetData {
  onSubmit: (url: string) => void;
}
export const linkSheet = createSheetChannel<LinkSheetData>();
