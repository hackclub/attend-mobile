import {
  applyBasic,
  applySort,
  EMPTY_BASIC,
  getQuickFilter,
  quickFilterCounts,
  searchRoster,
  sectionLetter,
  viewSignature,
} from '../participantFilters';
import type { Participant } from '../../types';

function person(overrides: Partial<Participant>): Participant {
  return {
    participant_event_id: overrides.display_name ?? 'id',
    participant_id: overrides.display_name ?? 'id',
    display_name: '',
    full_name: '',
    email: '',
    status: 'complete',
    checked_in_at: null,
    ...overrides,
  } as Participant;
}

const zoe = person({ display_name: 'Zoë', full_name: 'Zoë Adams', email: 'zoe@example.com' });
const ana = person({ display_name: 'ana', full_name: 'Ana Smith', status: 'awaiting_guardian' });
const ben = person({ display_name: 'Ben', full_name: 'Ben Jones', checked_in_at: '2026-11-14T09:00:00Z' });
const cal = person({ display_name: 'Cal', full_name: 'Cal Ng', checked_in_at: '2026-11-14T10:00:00Z', has_anaphylaxis_risk: true });
const dee = person({ display_name: 'Dee', full_name: 'Dee Roe', status: 'withdrawn' });
const eve = person({ display_name: 'Eve', full_name: 'Eve Fox', status: 'invited' });
const roster = [zoe, ana, ben, cal, dee, eve];

const names = (list: Participant[]) => list.map(p => p.display_name);

describe('applySort', () => {
  it('orders by name, ignoring case and accents, with no sort chosen', () => {
    expect(names(applySort(roster, null))).toEqual(['ana', 'Ben', 'Cal', 'Dee', 'Eve', 'Zoë']);
  });

  it('puts the latest check-in first and keeps everyone else by name', () => {
    expect(names(applySort(roster, { field: 'checked_in_at', direction: 'desc' })))
      .toEqual(['Cal', 'Ben', 'ana', 'Dee', 'Eve', 'Zoë']);
  });

  it('orders by state rank, then name', () => {
    expect(names(applySort(roster, { field: 'status', direction: 'asc' })))
      .toEqual(['Ben', 'Cal', 'Zoë', 'ana', 'Eve', 'Dee']);
  });

  it('falls back to name for a sort field that no longer exists', () => {
    expect(names(applySort([zoe, ana], { field: 'gone', direction: 'desc' }))).toEqual(['ana', 'Zoë']);
  });
});

describe('searchRoster', () => {
  it('matches every word across names and email, ignoring accents', () => {
    expect(names(searchRoster(roster, 'zoe adams'))).toEqual(['Zoë']);
    expect(names(searchRoster(roster, 'SMITH'))).toEqual(['ana']);
    expect(names(searchRoster(roster, 'example.com'))).toEqual(['Zoë']);
    expect(searchRoster(roster, 'nobody')).toEqual([]);
  });

  it('includes withdrawn people', () => {
    expect(names(searchRoster(roster, 'dee'))).toEqual(['Dee']);
  });
});

describe('quick filters', () => {
  it('counts each chip over the same set', () => {
    expect(quickFilterCounts(roster)).toEqual({
      all: 5,
      here: 2,
      not_here: 1,
      incomplete: 2,
      attention: 1,
      withdrawn: 1,
    });
  });

  it('keeps unfinished registrations out of Not here', () => {
    expect(names(roster.filter(getQuickFilter('not_here').test))).toEqual(['Zoë']);
    expect(names(roster.filter(getQuickFilter('incomplete').test))).toEqual(['ana', 'Eve']);
  });

  it('treats an unknown chip as All', () => {
    expect(getQuickFilter('gone').key).toBe('all');
  });
});

describe('applyBasic', () => {
  it('narrows by state and toggles together', () => {
    expect(applyBasic(roster, EMPTY_BASIC)).toBe(roster);
    expect(names(applyBasic(roster, { states: ['here', 'invited'] }))).toEqual(['Ben', 'Cal', 'Eve']);
    const signed = { ...ben, waiver_signed: true };
    expect(names(applyBasic([signed, cal], { states: ['here'], waiver: true }))).toEqual(['Ben']);
    expect(names(applyBasic([signed, cal], { states: [], waiver: false }))).toEqual(['Cal']);
  });
});

describe('sectionLetter', () => {
  it('files accented and non-letter names', () => {
    expect(sectionLetter(zoe)).toBe('Z');
    expect(sectionLetter(person({ display_name: 'Élodie' }))).toBe('E');
    expect(sectionLetter(person({ display_name: '42' }))).toBe('#');
    expect(sectionLetter(person({ display_name: '', full_name: 'Kim Lee' }))).toBe('K');
  });
});

describe('viewSignature', () => {
  it('tells views apart by their basic filters, in any state order', () => {
    const a = viewSignature([], 'and', null, { states: ['here', 'invited'] });
    expect(viewSignature([], 'and', null, { states: ['invited', 'here'] })).toBe(a);
    expect(viewSignature([], 'and', null, EMPTY_BASIC)).not.toBe(a);
    expect(viewSignature([], 'and', null)).toBe(viewSignature([], 'and', null, EMPTY_BASIC));
  });
});
