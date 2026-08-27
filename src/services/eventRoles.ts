import type { EventRole } from '../types';

export interface EventRoleDetails {
  label: string;
  summary: string;
}

// Mirrors EventRoleAssignment::ROLE_DETAILS on the server, plus the two
// standings the events API reports in the same field but which aren't stored
// roles: a global admin, and a member of the event's series.
const ROLE_DETAILS: Record<EventRole, EventRoleDetails> = {
  global_admin: {
    label: 'Global Admin',
    summary: 'Full access to every event.',
  },
  series_member: {
    label: 'Series Organizer',
    summary: 'Full control of every event in this series.',
  },
  event_admin: {
    label: 'Event Admin',
    summary: 'Full control of this event.',
  },
  ops: {
    label: 'Ops',
    summary: 'Day-to-day logistics and operations.',
  },
  limited: {
    label: 'Limited',
    summary: 'Day-to-day logistics, without addresses or exact birthdays.',
  },
  safeguarding_lead: {
    label: 'Safeguarding Lead',
    summary: 'Welfare, medical, and safeguarding.',
  },
  read_only: {
    label: 'Read Only',
    summary: 'View-only access — cannot make changes.',
  },
};

// A role this build doesn't know about returns null rather than throwing or
// inventing a label: the server can add roles without shipping a new app, and
// every caller renders nothing when there's nothing to say.
export function eventRoleDetails(role?: string | null): EventRoleDetails | null {
  if (!role) return null;
  return ROLE_DETAILS[role as EventRole] ?? null;
}

export function eventRoleLabel(role?: string | null): string | null {
  return eventRoleDetails(role)?.label ?? null;
}
