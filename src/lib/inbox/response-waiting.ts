import type { Conversation } from '@/types';

export const RESPONSE_WARNING_MINUTES = 10;

export function isConversationAwaitingReply(
  conversation: Conversation,
  now = Date.now()
): boolean {
  if (conversation.status === 'closed' || !conversation.last_message_at) {
    return false;
  }

  const customerSpokeLast =
    conversation.last_message_sender_type === 'customer' ||
    (!conversation.last_message_sender_type && conversation.unread_count > 0);

  if (!customerSpokeLast) return false;

  const lastMessageAt = new Date(conversation.last_message_at).getTime();
  if (!Number.isFinite(lastMessageAt)) return false;

  return now - lastMessageAt >= RESPONSE_WARNING_MINUTES * 60_000;
}

export function getWaitingMinutes(
  conversation: Conversation,
  now = Date.now()
): number {
  if (!conversation.last_message_at) return 0;
  const lastMessageAt = new Date(conversation.last_message_at).getTime();
  if (!Number.isFinite(lastMessageAt)) return 0;
  return Math.max(0, Math.floor((now - lastMessageAt) / 60_000));
}
