import type { ConversationChannel, ContentType } from '@/types';

export interface SocialInboundMessage {
  channel: Exclude<ConversationChannel, 'whatsapp'>;
  channelAccountId: string;
  participantId: string;
  messageId: string;
  timestamp: string;
  contentType: ContentType;
  text: string | null;
  mediaUrl: string | null;
}

interface MessagingEnvelope {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_self?: boolean;
    attachments?: Array<{
      type?: string;
      payload?: { url?: string };
    }>;
  };
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MessagingEnvelope[];
  }>;
}

function attachmentType(value?: string): ContentType {
  if (value === 'image') return 'image';
  if (value === 'video') return 'video';
  if (value === 'audio') return 'audio';
  if (value === 'file') return 'document';
  return 'text';
}

export function parseMetaMessagingEvents(
  payload: unknown
): SocialInboundMessage[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as MetaWebhookPayload;
  const channel =
    body.object === 'page'
      ? 'facebook'
      : body.object === 'instagram'
        ? 'instagram'
        : null;
  if (!channel) return [];

  const events: SocialInboundMessage[] = [];
  for (const entry of body.entry ?? []) {
    if (!entry.id) continue;
    for (const envelope of entry.messaging ?? []) {
      const message = envelope.message;
      if (
        !message?.mid ||
        message.is_echo ||
        message.is_self ||
        !envelope.sender?.id
      ) {
        continue;
      }
      const attachment = message.attachments?.[0];
      const type = attachmentType(attachment?.type);
      const timestampMs = envelope.timestamp ?? entry.time ?? Date.now();
      events.push({
        channel,
        channelAccountId: entry.id,
        participantId: envelope.sender.id,
        messageId: message.mid,
        timestamp: new Date(timestampMs).toISOString(),
        contentType: type,
        text:
          message.text ?? (attachment?.type ? `[${attachment.type}]` : null),
        mediaUrl: attachment?.payload?.url ?? null,
      });
    }
  }
  return events;
}
