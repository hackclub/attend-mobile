import type { Participant, ScanContext } from '../types';

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
}

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
  { value: 'not_required', label: 'Not Required' },
  { value: 'pending', label: 'Pending' },
  { value: 'applied', label: 'Applied' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
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
    label: 'Checked In',
    type: 'boolean',
    getValue: p => !!p.checked_in_at,
  },
  {
    key: 'scan_context',
    label: 'Scanned At',
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
    getOptions: ctx => optionsFromData(ctx, p => p.status),
  },
  {
    key: 'has_travel_inbound',
    label: 'Has Inbound Travel',
    type: 'boolean',
    getValue: p => !!p.travel_inbound,
  },
  {
    key: 'has_travel_outbound',
    label: 'Has Outbound Travel',
    type: 'boolean',
    getValue: p => !!p.travel_outbound,
  },
  {
    key: 'travel_mode_inbound',
    label: 'Travel In',
    type: 'select',
    getValue: p => p.travel_inbound?.mode,
    getOptions: () => TRAVEL_MODE_OPTIONS,
  },
  {
    key: 'travel_mode_outbound',
    label: 'Travel Out',
    type: 'select',
    getValue: p => p.travel_outbound?.mode,
    getOptions: () => TRAVEL_MODE_OPTIONS,
  },
  {
    key: 'visa_status',
    label: 'Visa Status',
    type: 'select',
    getValue: p => p.travel_inbound?.visa_status,
    getOptions: () => VISA_STATUS_OPTIONS,
  },
  {
    key: 'unaccompanied_minor',
    label: 'Unaccompanied Minor',
    type: 'boolean',
    getValue: p =>
      !!p.travel_inbound?.is_unaccompanied_minor || !!p.travel_outbound?.is_unaccompanied_minor,
  },
  {
    key: 'waiver_signed',
    label: 'Waiver Signed',
    type: 'boolean',
    getValue: p => p.waiver_signed,
  },
  {
    key: 'anaphylaxis_risk',
    label: 'Anaphylaxis Risk',
    type: 'boolean',
    getValue: p => p.has_anaphylaxis_risk,
  },
  {
    key: 'high_support',
    label: 'High Support',
    type: 'boolean',
    getValue: p => p.high_support_flag,
  },
  {
    key: 'requires_refrigeration',
    label: 'Requires Refrigeration',
    type: 'boolean',
    getValue: p => p.requires_refrigeration,
  },
  {
    key: 'cross_contamination_risk',
    label: 'Cross-Contamination Risk',
    type: 'boolean',
    getValue: p => p.cross_contamination_risk,
  },
  {
    key: 'can_leave_unaccompanied',
    label: 'Can Leave Unaccompanied',
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
  {
    key: 'allergies',
    label: 'Allergies',
    type: 'text',
    getValue: p => p.allergies,
  },
  {
    key: 'medical_conditions',
    label: 'Medical Conditions',
    type: 'text',
    getValue: p => p.medical_conditions,
  },
  {
    key: 'medications',
    label: 'Medications',
    type: 'text',
    getValue: p => p.medications,
  },
  {
    key: 'nfc_badge',
    label: 'NFC Badge Assigned',
    type: 'boolean',
    getValue: p => !!p.nfc_badge_assigned,
  },
  {
    key: 'name',
    label: 'Name',
    type: 'text',
    getValue: p => p.display_name,
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
  getSortValue: (p: Participant) => string | number;
}

export const SORT_FIELDS: SortFieldDef[] = [
  {
    key: 'name',
    label: 'Name',
    getSortValue: p => (p.display_name || '').toLowerCase(),
  },
  {
    key: 'checked_in_at',
    label: 'Check-in Time',
    getSortValue: p => (p.checked_in_at ? new Date(p.checked_in_at).getTime() : 0),
  },
  {
    key: 'email',
    label: 'Email',
    getSortValue: p => (p.email || '').toLowerCase(),
  },
  {
    key: 'status',
    label: 'Status',
    getSortValue: p => p.status || '',
  },
];

export function getSortField(key: string): SortFieldDef | undefined {
  return SORT_FIELDS.find(f => f.key === key);
}

export function applySort(participants: Participant[], sort: SortRule | null): Participant[] {
  if (!sort) return participants;
  const field = getSortField(sort.field);
  if (!field) return participants;
  const dir = sort.direction === 'desc' ? -1 : 1;
  return [...participants].sort((a, b) => {
    const av = field.getSortValue(a);
    const bv = field.getSortValue(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

export function newRuleId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Signature used to match the working filter state against saved/preset views
export function viewSignature(rules: FilterRule[], conjunction: Conjunction, sort: SortRule | null): string {
  return JSON.stringify({
    r: rules.map(r => ({ f: r.field, o: r.operator, v: operatorNeedsValue(r.operator) ? r.value ?? null : null })),
    c: rules.length > 1 ? conjunction : 'and',
    s: sort ? { f: sort.field, d: sort.direction } : null,
  });
}

export const PRESET_VIEWS: SavedView[] = [
  {
    id: 'preset-everyone',
    name: 'Everyone',
    rules: [],
    conjunction: 'and',
    sort: null,
  },
  {
    id: 'preset-checked-in',
    name: 'Checked In',
    rules: [{ id: 'preset-rule-checked-in', field: 'checked_in', operator: 'is_true' }],
    conjunction: 'and',
    sort: { field: 'checked_in_at', direction: 'desc' },
  },
  {
    id: 'preset-not-checked-in',
    name: 'Not Checked In',
    rules: [{ id: 'preset-rule-not-checked-in', field: 'checked_in', operator: 'is_false' }],
    conjunction: 'and',
    sort: null,
  },
];
