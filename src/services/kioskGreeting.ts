import type { Participant } from '../types';

/** The name a kiosk greets someone by: the first word of the name they go by. */
export function firstName(participant?: Pick<Participant, 'display_name' | 'full_name'>): string {
  const name = (participant?.display_name || participant?.full_name || '').trim();
  return name.split(/\s+/)[0] ?? '';
}
