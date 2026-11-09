import { participantAfterUndo } from '../scanUndo';
import type { Participant, ScanByContext } from '../../types';

const scan = (id: string, checksIn: boolean): ScanByContext => ({
  scan_context_id: id,
  scan_context_name: id,
  checks_in: checksIn,
  is_airport: false,
  scan_count: 1,
});

const person = (scans: ScanByContext[]): Participant => ({
  participant_event_id: 'pe-1',
  checked_in_at: '2026-11-14T01:00:00Z',
  scans_by_context: scans,
} as Participant);

describe('participantAfterUndo', () => {
  it('drops the context’s scans and the check-in when no check-in scan is left', () => {
    const after = participantAfterUndo(person([scan('checkin', true), scan('dinner', false)]), 'checkin');
    expect(after.scans_by_context?.map((s) => s.scan_context_id)).toEqual(['dinner']);
    expect(after.checked_in_at).toBeNull();
  });

  it('keeps the check-in while another check-in context still has a scan', () => {
    const after = participantAfterUndo(person([scan('door-a', true), scan('door-b', true)]), 'door-a');
    expect(after.checked_in_at).toBe('2026-11-14T01:00:00Z');
  });

  it('clears everything without a context', () => {
    const after = participantAfterUndo(person([scan('checkin', true)]));
    expect(after.scans_by_context).toEqual([]);
    expect(after.checked_in_at).toBeNull();
  });
});
