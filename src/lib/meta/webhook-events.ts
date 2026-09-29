import type { ConversationChannel, ContentType } from '@/types';
import { metaAttachmentFallbackText } from './social-share';

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

export interface SocialMessageReceipt {
  channel: Exclude<ConversationChannel, 'whatsapp'>;
  channelAccountId: string;
  participantId: string | null;
  status: 'delivered' | 'read';
  messageIds: string[];
  watermark: string | null;
  timestamp: string;
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
  delivery?: {
    mids?: string[];
    watermark?: number;
  };
  read?: {
    mid?: string;
    watermark?: number;
  };
}

interface MessagingSeenChange {
  field?: string;
  value?: {
    sender?: { id?: string };
    recipient?: { id?: string };
    timestamp?: number;
    message_id?: string;
    mid?: string;
    message?: { mid?: string };
  };
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MessagingEnvelope[];
    changes?: MessagingSeenChange[];
  }>;
}

function webhookChannel(
  object?: string
): Exclude<ConversationChannel, 'whatsapp'> | null {
  return object === 'page'
    ? 'facebook'
    : object === 'instagram'
      ? 'instagram'
      : null;
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
  const channel = webhookChannel(body.object);
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
          message.text ?? metaAttachmentFallbackText(channel, attachment?.type),
        mediaUrl: attachment?.payload?.url ?? null,
      });
    }
  }
  return events;
}

export function parseMetaReceiptEvents(
  payload: unknown
): SocialMessageReceipt[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as MetaWebhookPayload;
  const channel = webhookChannel(body.object);
  if (!channel) return [];

  const events: SocialMessageReceipt[] = [];
  for (const entry of body.entry ?? []) {
    if (!entry.id) continue;
    for (const envelope of entry.messaging ?? []) {
      const timestampMs = envelope.timestamp ?? entry.time ?? Date.now();
      if (envelope.delivery) {
        const watermarkMs = envelope.delivery.watermark;
        events.push({
          channel,
          channelAccountId: entry.id,
          participantId: envelope.sender?.id ?? null,
          status: 'delivered',
          messageIds: (envelope.delivery.mids ?? []).filter(Boolean),
          watermark:
            typeof watermarkMs === 'number'
              ? new Date(watermarkMs).toISOString()
              : null,
          timestamp: new Date(timestampMs).toISOString(),
        });
      }
      if (envelope.read) {
        const watermarkMs = envelope.read.watermark;
        events.push({
          channel,
          channelAccountId: entry.id,
          participantId: envelope.sender?.id ?? null,
          status: 'read',
          messageIds: envelope.read.mid ? [envelope.read.mid] : [],
          watermark:
            typeof watermarkMs === 'number'
              ? new Date(watermarkMs).toISOString()
              : null,
          timestamp: new Date(timestampMs).toISOString(),
        });
      }
    }

    // Instagram can deliver `messaging_seen` as a changes event instead of
    // the Messenger-style `messaging[].read` envelope. Accept both forms.
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messaging_seen') continue;
      const value = change.value ?? {};
      const messageId =
        value.message_id ?? value.mid ?? value.message?.mid ?? null;
      const timestampMs = value.timestamp ?? entry.time ?? Date.now();
      events.push({
        channel,
        channelAccountId: entry.id,
        participantId: value.sender?.id ?? null,
        status: 'read',
        messageIds: messageId ? [messageId] : [],
        watermark: new Date(timestampMs).toISOString(),
        timestamp: new Date(timestampMs).toISOString(),
      });
    }
  }
  return events;
}
