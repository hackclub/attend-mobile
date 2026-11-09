import type { BadgeColor, StatusType } from './ui';
import type { StatusTone } from './forms';
import { CHANNEL_LABELS } from '../services/statusDisplay';
import type { MessageStatus } from '../types';

// How the redesign shows a broadcast's status: the console's badge colour per
// status, and the StatusIndicator type for a StatusTone.

export const MESSAGE_STATUS_BADGE: Record<MessageStatus, BadgeColor> = {
  draft: 'grey',
  scheduled: 'blue',
  sending: 'blue',
  completed: 'green',
  failed: 'red',
  cancelled: 'grey',
};

export function statusType(tone: StatusTone | undefined): StatusType {
  if (!tone) return 'info';
  return tone === 'progress' ? 'in-progress' : tone;
}

/** ['email', 'push'] -> "Email, Push". */
export function channelList(channels: string[]): string {
  return channels.map(c => CHANNEL_LABELS[c] ?? c).join(', ');
}
