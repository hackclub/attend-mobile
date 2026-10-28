import type { StatusTone } from '../components/forms';

// The console's status mappings (Admin::IncidentsHelper, the messages views),
// so a status reads with the same icon and tone on a phone as on the web.

export const INCIDENT_STATUS_TONES: Record<string, StatusTone> = {
  open: 'warning',
  in_review: 'progress',
  closed: 'success',
  resolved: 'success',
};

export const MESSAGE_STATUS_TONES: Record<string, StatusTone> = {
  draft: 'stopped',
  scheduled: 'pending',
  sending: 'progress',
  completed: 'success',
  failed: 'error',
  cancelled: 'stopped',
};

export const DELIVERY_STATUS_TONES: Record<string, StatusTone> = {
  pending: 'pending',
  sending: 'progress',
  delivered: 'success',
  failed: 'error',
};

export const INCIDENT_CATEGORY_COLORS: Record<string, string> = {
  safeguarding: '#A633D6',
  medical: '#EC3750',
  behavior: '#338EDA',
};

export const CHANNEL_COLORS: Record<string, string> = {
  slack: '#A633D6',
  email: '#338EDA',
  sms: '#33D6A6',
  push: '#FF8C37',
};

/** "in_review" -> "In review", like Ruby's String#humanize. */
export function humanize(value?: string | null): string {
  if (!value) return '';
  const spaced = value.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** "in_review" -> "In Review", like humanize.titleize. */
export function titleize(value?: string | null): string {
  return humanize(value).replace(/\b\w/g, c => c.toUpperCase());
}

export const CHANNEL_LABELS: Record<string, string> = {
  slack: 'Slack',
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
};
