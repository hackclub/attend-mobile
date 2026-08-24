import type { Participant } from '../types';

export type ParticipantUpdate = Partial<Participant> & Pick<Participant, 'participant_event_id'>;

export function mergeParticipant(
  current: Participant | undefined,
  incoming: ParticipantUpdate
): Participant {
  const definedIncoming = Object.fromEntries(
    Object.entries(incoming).filter(([, value]) => value !== undefined)
  ) as ParticipantUpdate;

  return { ...(current ?? {}), ...definedIncoming } as Participant;
}

export function mergeParticipants(
  current: Participant[],
  incoming: Participant[]
): Participant[] {
  const byRegistration = new Map(
    current.map(item => [item.participant_event_id, item])
  );

  for (const item of incoming) {
    byRegistration.set(
      item.participant_event_id,
      mergeParticipant(byRegistration.get(item.participant_event_id), item)
    );
  }

  return [...byRegistration.values()];
}

export class ParticipantIndex {
  private readonly byIdentifier = new Map<string, Participant>();
  private readonly byNfcToken = new Map<string, Participant>();

  constructor(participants: Participant[]) {
    for (const participant of participants) {
      this.byIdentifier.set(participant.participant_id, participant);
      this.byIdentifier.set(participant.participant_event_id, participant);
      if (participant.nfc_badge_token) {
        this.byNfcToken.set(participant.nfc_badge_token, participant);
      }
    }
  }

  find(identifier: string): Participant | undefined {
    return this.byIdentifier.get(identifier);
  }

  findByNfcToken(token: string): Participant | undefined {
    return this.byNfcToken.get(token);
  }
}
