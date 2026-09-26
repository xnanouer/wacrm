import type { Contact, Message, Profile } from '@/types';

interface MessageSenderLabelOptions {
  message: Message;
  contact: Contact | null;
  profiles: Profile[];
  assignedAgentId?: string | null;
}

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/**
 * Human-readable author shown at the top of every inbox bubble.
 *
 * New human messages persist `sender_id`, which keeps the attribution stable
 * even after a ticket is transferred. Older rows may not have that field, so
 * they fall back to the current assignee instead of showing an empty label.
 */
export function messageSenderLabel({
  message,
  contact,
  profiles,
  assignedAgentId,
}: MessageSenderLabelOptions): string {
  if (message.sender_type === 'bot') return 'Agente IA';

  if (message.sender_type === 'customer') {
    return nonEmpty(contact?.name) ?? nonEmpty(contact?.phone) ?? 'Cliente';
  }

  const authorId = message.sender_id ?? assignedAgentId;
  const profile = authorId
    ? profiles.find((candidate) => candidate.user_id === authorId)
    : null;

  return nonEmpty(profile?.full_name) ?? 'Ejecutivo';
}
