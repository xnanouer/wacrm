import type { Conversation, Message } from '@/types';
import { sortConversationsByLastMessage } from './conversations';

export interface InboxLiveSyncPayload {
  synced_at: string;
  conversations: Conversation[];
  messages: Message[];
}

const OPTIMISTIC_MESSAGE_PREFIX = 'temp-';
const OPTIMISTIC_RECONCILE_WINDOW_MS = 2 * 60 * 1000;

function sameOptionalText(left?: string, right?: string): boolean {
  return (left ?? '') === (right ?? '');
}

/** Match a persisted outbound row with the optimistic bubble that sent it. */
export function isMatchingOptimisticMessage(
  optimistic: Message,
  persisted: Message
): boolean {
  if (!optimistic.id.startsWith(OPTIMISTIC_MESSAGE_PREFIX)) return false;
  if (persisted.id.startsWith(OPTIMISTIC_MESSAGE_PREFIX)) return false;
  if (optimistic.conversation_id !== persisted.conversation_id) return false;
  if (optimistic.sender_type !== persisted.sender_type) return false;
  if (optimistic.content_type !== persisted.content_type) return false;
  if (!sameOptionalText(optimistic.content_text, persisted.content_text)) {
    return false;
  }
  if (!sameOptionalText(optimistic.media_url, persisted.media_url)) {
    return false;
  }
  if (!sameOptionalText(optimistic.template_name, persisted.template_name)) {
    return false;
  }
  if (
    !sameOptionalText(
      optimistic.reply_to_message_id,
      persisted.reply_to_message_id
    )
  ) {
    return false;
  }

  const optimisticAt = Date.parse(optimistic.created_at);
  const persistedAt = Date.parse(persisted.created_at);
  return (
    Number.isFinite(optimisticAt) &&
    Number.isFinite(persistedAt) &&
    Math.abs(optimisticAt - persistedAt) <= OPTIMISTIC_RECONCILE_WINDOW_MS
  );
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
  for (const message of incoming) {
    if (!merged.has(message.id)) {
      const optimisticMatches = [...merged.values()]
        .filter((candidate) => isMatchingOptimisticMessage(candidate, message))
        .sort(
          (left, right) =>
            Math.abs(
              Date.parse(left.created_at) - Date.parse(message.created_at)
            ) -
            Math.abs(
              Date.parse(right.created_at) - Date.parse(message.created_at)
            )
        );
      const optimistic = optimisticMatches[0];
      if (optimistic) merged.delete(optimistic.id);
    }
    merged.set(message.id, message);
  }

  return [...merged.values()].sort(
    (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at)
  );
}
