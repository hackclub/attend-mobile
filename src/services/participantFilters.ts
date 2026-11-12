import type { Participant, ScanContext } from '../types';
import {
  isActiveParticipant,
  participantState,
  PARTICIPANT_STATE_RANK,
  type ParticipantState,
} from './participantStatus';

export type FilterFieldType = 'boolean' | 'select' | 'text';

export type FilterOperator =
  | 'is_true'
  | 'is_false'
  | 'is'
  | 'is_not'
  | 'is_empty'
  | 'is_not_empty'
  | 'contains'
  | 'not_contains';

export interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value?: string;
}

export type Conjunction = 'and' | 'or';

export interface SortRule {
  field: string;
  direction: 'asc' | 'desc';
}

export interface SavedView {
  id: string;
  name: string;
  rules: FilterRule[];
  conjunction: Conjunction;
  sort: SortRule | null;
  /** Absent in views saved before the sheet had a basic section. */
  basic?: BasicFilters;
}

/**
 * The filter sheet's one-tap section, always combined with AND: a set of
 * states (empty is any) and Any/Yes/No toggles (absent is any).
 */
export interface BasicFilters {
  states: ParticipantState[];
  waiver?: boolean;
  nfc?: boolean;
  inbound?: boolean;
}

export const EMPTY_BASIC: BasicFilters = { states: [] };

export interface FilterContext {
  scanContexts: ScanContext[];
  participants: Participant[];
}

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FilterFieldType;
  getValue: (p: Participant) => boolean | string | null | undefined;
  // Static options, or derive from context (scan contexts, values seen in data)
  getOptions?: (ctx: FilterContext) => FieldOption[];
  // Override for fields where a participant has multiple values (e.g. scans)
  test?: (p: Participant, operator: FilterOperator, value: string | undefined, ctx: FilterContext) => boolean;
}

const TRAVEL_MODE_OPTIONS: FieldOption[] = [
  { value: 'plane', label: '✈️ Plane' },
  { value: 'train', label: '🚂 Train' },
  { value: 'car', label: '🚗 Car' },
  { value: 'bus', label: '🚌 Bus' },
  { value: 'other', label: 'Other' },
];

const VISA_STATUS_OPTIONS: FieldOption[] = [
  { value: 'not_required', label: 'Not required' },
  { value: 'pending', label: 'Pending' },
  { value: 'applied', label: 'Applied' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
];

const STATUS_OPTIONS: FieldOption[] = [
  { value: 'invited', label: 'Invited' },
  { value: 'in_progress', label: 'Registering' },
  { value: 'awaiting_guardian', label: 'Awaiting parent' },
  { value: 'complete', label: 'Complete' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'rejected', label: 'Rejected' },
];

function optionsFromData(
  ctx: FilterContext,
  getValue: (p: Participant) => string | null | undefined,
): FieldOption[] {
  const seen = new Set<string>();
  for (const p of ctx.participants) {
    const v = getValue(p);
    if (v) seen.add(v);
  }
  return [...seen].sort().map(value => ({ value, label: value }));
}

export const FILTER_FIELDS: FieldDef[] = [
  {
    key: 'checked_in',
    label: 'Checked in',
    type: 'boolean',
    getValue: p => !!p.checked_in_at,
  },
  {
    key: 'scan_context',
    label: 'Scanned at',
    type: 'select',
    getValue: () => null,
    getOptions: ctx => {
      const options = new Map<string, string>();
      // Participant scan data covers the gap while the contexts API call is in flight
      for (const p of ctx.participants) {
        for (const s of p.scans_by_context ?? []) {
          options.set(s.scan_context_id, `${s.is_airport ? '✈️ ' : ''}${s.scan_context_name}`);
        }
      }
      for (const c of ctx.scanContexts) {
        options.set(c.id, `${c.is_airport ? '✈️ ' : ''}${c.name}`);
      }
      return [...options].map(([value, label]) => ({ value, label }));
    },
    test: (p, operator, value) => {
      const anyScans = !!p.scans_by_context?.length;
      if (operator === 'is_empty') return !anyScans;
      if (operator === 'is_not_empty') return anyScans;
      const scanned = !!value && !!p.scans_by_context?.some(s => s.scan_context_id === value);
      return operator === 'is_not' ? !scanned : scanned;
    },
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    getValue: p => p.status,
    // Every status Attend has, labelled, rather than the raw values seen in
    // the active roster (which never offered Withdrawn or Rejected).
    getOptions: () => STATUS_OPTIONS,
  },
  {
    key: 'has_travel_inbound',
    label: 'Has inbound travel',
    type: 'boolean',
    getValue: p => !!p.travel_inbound,
  },
  {
    key: 'has_travel_outbound',
    label: 'Has outbound travel',
    type: 'boolean',
    getValue: p => !!p.travel_outbound,
  },
  {
    key: 'travel_mode_inbound',
    label: 'Travel in',
    type: 'select',
    getValue: p => p.travel_inbound?.mode,
    getOptions: () => TRAVEL_MODE_OPTIONS,
  },
  {
    key: 'travel_mode_outbound',
    label: 'Travel out',
    type: 'select',
    getValue: p => p.travel_outbound?.mode,
    getOptions: () => TRAVEL_MODE_OPTIONS,
  },
  {
    key: 'visa_status',
    label: 'Visa status',
    type: 'select',
    getValue: p => p.travel_inbound?.visa_status,
    getOptions: () => VISA_STATUS_OPTIONS,
  },
  {
    key: 'unaccompanied_minor',
    label: 'Unaccompanied minor',
    type: 'boolean',
    getValue: p =>
      !!p.travel_inbound?.is_unaccompanied_minor || !!p.travel_outbound?.is_unaccompanied_minor,
  },
  {
    key: 'waiver_signed',
    label: 'Waiver signed',
    type: 'boolean',
    getValue: p => p.waiver_signed,
  },
  {
    key: 'anaphylaxis_risk',
    label: 'Anaphylaxis risk',
    type: 'boolean',
    getValue: p => p.has_anaphylaxis_risk,
  },
  {
    key: 'high_support',
    label: 'High support',
    type: 'boolean',
    getValue: p => p.high_support_flag,
  },
  {
    key: 'requires_refrigeration',
    label: 'Requires refrigeration',
    type: 'boolean',
    getValue: p => p.requires_refrigeration,
  },
  {
    key: 'cross_contamination_risk',
    label: 'Cross-contamination risk',
    type: 'boolean',
    getValue: p => p.cross_contamination_risk,
  },
  {
    key: 'can_leave_unaccompanied',
    label: 'Can leave unaccompanied',
    type: 'boolean',
    getValue: p => p.can_leave_unaccompanied,
  },
  {
    key: 'diet_type',
    label: 'Diet',
    type: 'select',
    getValue: p => p.diet_type,
    getOptions: ctx => optionsFromData(ctx, p => p.diet_type),
  },
  // No allergy, medical-condition or medication text filters: that free text
  // is not kept in the offline roster (see participantCache.ts). Saved views
  // that still name those keys skip the rule, since getField() finds nothing.
  {
    key: 'nfc_badge',
    label: 'NFC badge assigned',
    type: 'boolean',
    getValue: p => !!p.nfc_badge_assigned,
  },
  {
    key: 'name',
    label: 'Name',
    type: 'text',
    // Both names: a surname may only be in the full name.
    getValue: p => [p.display_name, p.full_name].filter(Boolean).join(' '),
  },
  {
    key: 'email',
    label: 'Email',
    type: 'text',
    getValue: p => p.email,
  },
  {
    key: 'pronouns',
    label: 'Pronouns',
    type: 'text',
    getValue: p => p.pronouns,
  },
];

export function getField(key: string): FieldDef | undefined {
  return FILTER_FIELDS.find(f => f.key === key);
}

export const OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  boolean: ['is_true', 'is_false'],
  select: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  text: ['contains', 'not_contains', 'is_empty', 'is_not_empty'],
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is_true: 'is yes',
  is_false: 'is no',
  is: 'is',
  is_not: 'is not',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  contains: 'contains',
  not_contains: 'does not contain',
};

export function operatorNeedsValue(operator: FilterOperator): boolean {
  return operator === 'is' || operator === 'is_not' || operator === 'contains' || operator === 'not_contains';
}

export function ruleIsComplete(rule: FilterRule): boolean {
  if (!getField(rule.field)) return false;
  if (!operatorNeedsValue(rule.operator)) return true;
  return rule.value !== undefined && rule.value !== '';
}

function evaluateRule(p: Participant, rule: FilterRule, ctx: FilterContext): boolean {
  const field = getField(rule.field);
  if (!field) return true;
  if (field.test) return field.test(p, rule.operator, rule.value, ctx);

  const raw = field.getValue(p);

  if (field.type === 'boolean') {
    return rule.operator === 'is_false' ? !raw : !!raw;
  }

  const str = typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
  switch (rule.operator) {
    case 'is':
      return str === rule.value;
    case 'is_not':
      return str !== rule.value;
    case 'is_empty':
      return str === '';
    case 'is_not_empty':
      return str !== '';
    case 'contains':
      return str.toLowerCase().includes((rule.value ?? '').toLowerCase());
    case 'not_contains':
      return !str.toLowerCase().includes((rule.value ?? '').toLowerCase());
    default:
      return true;
  }
}

export function applyFilters(
  participants: Participant[],
  rules: FilterRule[],
  conjunction: Conjunction,
  ctx: FilterContext,
): Participant[] {
  const active = rules.filter(ruleIsComplete);
  if (active.length === 0) return participants;
  return participants.filter(p =>
    conjunction === 'and'
      ? active.every(rule => evaluateRule(p, rule, ctx))
      : active.some(rule => evaluateRule(p, rule, ctx)),
  );
}

export interface SortFieldDef {
  key: string;
  label: string;
  /** Orders two people; the name breaks ties. */
  compare: (a: Participant, b: Participant) => number;
}

/**
 * Text for matching and ordering names: accents and case don't count, so
 * "Zoë" sorts and searches with "Zoe".
 */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function displayName(p: Participant): string {
  return p.display_name || p.full_name || '';
}

export function compareNames(a: Participant, b: Participant): number {
  return (
    normalizeText(displayName(a)).localeCompare(normalizeText(displayName(b)))
    || normalizeText(a.full_name).localeCompare(normalizeText(b.full_name))
    || (a.participant_event_id ?? '').localeCompare(b.participant_event_id ?? '')
  );
}

function checkInTime(p: Participant): number {
  const time = p.checked_in_at ? new Date(p.checked_in_at).getTime() : NaN;
  return Number.isNaN(time) ? 0 : time;
}

export const SORT_FIELDS: SortFieldDef[] = [
  { key: 'name', label: 'Name', compare: () => 0 },
  {
    key: 'checked_in_at',
    label: 'Check-in time',
    compare: (a, b) => checkInTime(a) - checkInTime(b),
  },
  {
    key: 'status',
    label: 'Status',
    compare: (a, b) => PARTICIPANT_STATE_RANK[participantState(a)] - PARTICIPANT_STATE_RANK[participantState(b)],
  },
  {
    key: 'email',
    label: 'Email',
    compare: (a, b) => normalizeText(a.email).localeCompare(normalizeText(b.email)),
  },
];

/** The order with no sort chosen: by name, A to Z. */
export const DEFAULT_SORT: SortRule = { field: 'name', direction: 'asc' };

export function getSortField(key: string): SortFieldDef | undefined {
  return SORT_FIELDS.find(f => f.key === key);
}

/**
 * Sorts by the chosen field, then by name A to Z, so people with the same
 * status or no check-in stay alphabetical. No sort is by name.
 */
export function applySort(participants: Participant[], sort: SortRule | null): Participant[] {
  const rule = sort && getSortField(sort.field) ? sort : DEFAULT_SORT;
  const field = getSortField(rule.field)!;
  const dir = rule.direction === 'desc' ? -1 : 1;
  const byName = rule.field === 'name';
  return [...participants].sort((a, b) => {
    if (byName) return dir * compareNames(a, b);
    return dir * field.compare(a, b) || compareNames(a, b);
  });
}

/** The letter a name-sorted row files under: A–Z, or # for anything else. */
export function sectionLetter(p: Participant): string {
  const first = normalizeText(displayName(p)).charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/**
 * Searches the roster on the phone: every word typed has to appear in the
 * preferred name, full name or email, ignoring accents and case. Covers
 * withdrawn and rejected people too (the Withdrawn chip finds them).
 */
export function searchRoster(participants: Participant[], query: string): Participant[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return participants;
  return participants.filter(p => {
    const haystack = normalizeText(`${p.display_name ?? ''} ${p.full_name ?? ''} ${p.email ?? ''}`);
    return words.every(word => haystack.includes(word));
  });
}

// ---------------------------------------------------------------------------
// Quick filters: the chip row over the list. They apply after search and the
// sheet's filters, and their counts are taken over that same set, so the
// numbers always add up to what the list shows.

export type QuickFilter = 'all' | 'here' | 'not_here' | 'incomplete' | 'attention' | 'withdrawn';

function needsAttention(p: Participant): boolean {
  return !!(p.has_anaphylaxis_risk || p.high_support_flag || p.requires_refrigeration);
}

export interface QuickFilterDef {
  key: QuickFilter;
  label: string;
  test: (p: Participant) => boolean;
  /** The list's empty state with this chip on and nothing else narrowing it. */
  empty: string;
}

export const QUICK_FILTERS: QuickFilterDef[] = [
  {
    key: 'all',
    label: 'All',
    test: isActiveParticipant,
    empty: 'No participants yet. Pull to refresh.',
  },
  {
    key: 'here',
    label: 'Here',
    test: p => isActiveParticipant(p) && !!p.checked_in_at,
    empty: 'Nobody has checked in yet.',
  },
  {
    // Registered and expected, but not arrived. Unfinished registrations
    // aren't expected at the door, so they're under Incomplete instead.
    key: 'not_here',
    label: 'Not here',
    test: p => participantState(p) === 'not_here',
    empty: 'Everyone who finished registering is here.',
  },
  {
    key: 'incomplete',
    label: 'Incomplete',
    test: p => {
      const state = participantState(p);
      return state === 'invited' || state === 'registering' || state === 'awaiting_parent';
    },
    empty: 'Everyone has finished registering.',
  },
  {
    key: 'attention',
    label: 'Needs attention',
    test: p => isActiveParticipant(p) && needsAttention(p),
    empty: 'Nobody has an anaphylaxis risk, high support needs or refrigerated medication.',
  },
  {
    key: 'withdrawn',
    label: 'Withdrawn',
    test: p => !isActiveParticipant(p),
    empty: 'Nobody has withdrawn or been rejected.',
  },
];

export function getQuickFilter(key: string | null | undefined): QuickFilterDef {
  return QUICK_FILTERS.find(f => f.key === key) ?? QUICK_FILTERS[0];
}

export function quickFilterCounts(participants: Participant[]): Record<QuickFilter, number> {
  const counts = Object.fromEntries(QUICK_FILTERS.map(f => [f.key, 0])) as Record<QuickFilter, number>;
  for (const p of participants) {
    for (const filter of QUICK_FILTERS) {
      if (filter.test(p)) counts[filter.key] += 1;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// The sheet's basic section.

/** The states the sheet offers; withdrawn and rejected are the Withdrawn chip. */
export const BASIC_STATES: ParticipantState[] = ['here', 'not_here', 'awaiting_parent', 'registering', 'invited'];

export type BasicToggle = 'waiver' | 'nfc' | 'inbound';

export const BASIC_TOGGLES: { key: BasicToggle; label: string; test: (p: Participant) => boolean }[] = [
  { key: 'waiver', label: 'Waiver signed', test: p => !!p.waiver_signed },
  { key: 'nfc', label: 'NFC badge', test: p => !!p.nfc_badge_assigned },
  { key: 'inbound', label: 'Inbound travel', test: p => !!p.travel_inbound },
];

export function basicFilterCount(basic: BasicFilters): number {
  return (basic.states.length > 0 ? 1 : 0)
    + BASIC_TOGGLES.filter(t => basic[t.key] !== undefined).length;
}

export function applyBasic(participants: Participant[], basic: BasicFilters): Participant[] {
  if (basicFilterCount(basic) === 0) return participants;
  const states = new Set(basic.states);
  return participants.filter(p => {
    // An inactive person isn't in any of the offered states, so a state
    // filter leaves them out; they're the Withdrawn chip's.
    if (states.size > 0 && !states.has(participantState(p))) return false;
    return BASIC_TOGGLES.every(t => basic[t.key] === undefined || t.test(p) === basic[t.key]);
  });
}

export function newRuleId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Signature used to match the working filter state against saved/preset views
export function viewSignature(
  rules: FilterRule[],
  conjunction: Conjunction,
  sort: SortRule | null,
  basic: BasicFilters = EMPTY_BASIC,
): string {
  return JSON.stringify({
    r: rules.map(r => ({ f: r.field, o: r.operator, v: operatorNeedsValue(r.operator) ? r.value ?? null : null })),
    c: rules.length > 1 ? conjunction : 'and',
    s: sort ? { f: sort.field, d: sort.direction } : null,
    b: {
      s: [...basic.states].sort(),
      ...Object.fromEntries(BASIC_TOGGLES.map(t => [t.key, basic[t.key] ?? null])),
    },
  });
}
