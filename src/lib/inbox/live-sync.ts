import type { Conversation, Message } from '@/types';
import { sortConversationsByLastMessage } from './conversations';

export interface InboxLiveSyncPayload {
  synced_at: string;
  conversations: Conversation[];
  messages: Message[];
}

/** Merge account-scoped conversation deltas returned by the inbox sync API. */
export function mergeConversationDeltas(
  current: Conversation[],
  incoming: Conversation[]
): Conversation[] {
  if (incoming.length === 0) return current;

  const merged = new Map(
    current.map((conversation) => [conversation.id, conversation])
  );
  for (const conversation of incoming) {
    const existing = merged.get(conversation.id);
    merged.set(
      conversation.id,
      existing
        ? {
            ...existing,
            ...conversation,
            contact: conversation.contact ?? existing.contact,
          }
        : conversation
    );
  }

  return sortConversationsByLastMessage([...merged.values()]);
}

/**
 * Merge newly persisted messages into an open thread. Incoming database rows
 * win over matching optimistic/realtime rows because they carry final status.
 */
export function mergeMessageDeltas(
  current: Message[],
  incoming: Message[]
): Message[] {
  if (incoming.length === 0) return current;

  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) merged.set(message.id, message);

  return [...merged.values()].sort(
    (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at)
  );
}
