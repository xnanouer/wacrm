import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { MetaApiError, sendSocialImage, sendSocialText } from '@/lib/meta/api';
import { prepareOutboundMediaUrl } from '@/lib/storage/private-media-server';
import { decrypt } from '@/lib/whatsapp/encryption';

export class SocialSendError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'SocialSendError';
  }
}

interface SocialConversation {
  id: string;
  contact_id: string;
  channel: 'facebook' | 'instagram';
  channel_connection_id: string;
  external_participant_id: string;
  first_response_at: string | null;
}

/**
 * Send a text or image reply through the Facebook Page or Instagram
 * professional account attached to an existing social conversation.
 */
export async function sendSocialMessageToConversation(
  db: SupabaseClient,
  accountId: string,
  input: {
    conversationId: string;
    messageType: string;
    contentText?: string | null;
    mediaUrl?: string | null;
    replyToMessageId?: string | null;
    senderId?: string | null;
    senderType?: 'agent' | 'bot';
  }
): Promise<{ messageId: string; metaMessageId: string }> {
  const text = input.contentText?.trim();
  const mediaUrl = input.mediaUrl?.trim();
  if (
    (input.messageType !== 'text' && input.messageType !== 'image') ||
    (input.messageType === 'text' && !text) ||
    (input.messageType === 'image' && !mediaUrl)
  ) {
    throw new SocialSendError(
      'Facebook e Instagram admiten respuestas de texto o imagen.',
      400
    );
  }

  const { data, error } = await db
    .from('conversations')
    .select(
      'id, contact_id, channel, channel_connection_id, external_participant_id, first_response_at'
    )
    .eq('id', input.conversationId)
    .eq('account_id', accountId)
    .single();
  if (error || !data) {
    throw new SocialSendError('Conversación no encontrada.', 404);
  }
  if (
    !['facebook', 'instagram'].includes(data.channel) ||
    !data.channel_connection_id ||
    !data.external_participant_id
  ) {
    throw new SocialSendError(
      'La conversación no pertenece a un canal social.',
      400
    );
  }
  const conversation = data as SocialConversation;

  if (input.replyToMessageId) {
    const { data: parent } = await db
      .from('messages')
      .select('id')
      .eq('id', input.replyToMessageId)
      .eq('conversation_id', conversation.id)
      .maybeSingle();
    if (!parent) {
      throw new SocialSendError(
        'El mensaje citado no pertenece a esta conversación.',
        400
      );
    }
  }

  const admin = supabaseAdmin();
  const { data: connection, error: connectionError } = await admin
    .from('channel_connections')
    .select('id, external_account_id, status')
    .eq('id', conversation.channel_connection_id)
    .eq('account_id', accountId)
    .eq('channel', conversation.channel)
    .maybeSingle();
  if (connectionError || !connection || connection.status !== 'connected') {
    throw new SocialSendError(
      `El canal de ${conversation.channel === 'facebook' ? 'Facebook' : 'Instagram'} no está conectado.`,
      409
    );
  }

  const { data: secret, error: secretError } = await admin
    .from('channel_connection_secrets')
    .select('access_token')
    .eq('connection_id', connection.id)
    .eq('account_id', accountId)
    .maybeSingle();
  if (secretError || !secret?.access_token) {
    throw new SocialSendError(
      'La credencial de este canal no está disponible.',
      409
    );
  }

  const senderType = input.senderType ?? 'agent';
  const senderId = senderType === 'agent' ? input.senderId || null : null;
  const accessToken = decrypt(secret.access_token);

  const persistMessage = async (message: {
    metaMessageId: string;
    contentType: 'text' | 'image';
    contentText: string | null;
    mediaUrl: string | null;
    replyToMessageId?: string | null;
  }): Promise<string> => {
    const { data: saved, error: saveError } = await db
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        sender_type: senderType,
        sender_id: senderId,
        content_type: message.contentType,
        content_text: message.contentText,
        media_url: message.mediaUrl,
        message_id: message.metaMessageId,
        status: 'sent',
        reply_to_message_id: message.replyToMessageId || null,
      })
      .select('id')
      .single();
    if (saveError || !saved) {
      console.error('[social send] message persistence failed:', saveError);
      throw new SocialSendError(
        'Meta envió el mensaje, pero no se pudo guardar en el CRM.',
        500
      );
    }
    return saved.id;
  };

  let metaMessageId: string;
  let messageId: string;
  try {
    if (input.messageType === 'text') {
      const result = await sendSocialText({
        channel: conversation.channel,
        channelAccountId: connection.external_account_id,
        participantId: conversation.external_participant_id,
        accessToken,
        text: text!,
      });
      metaMessageId = result.messageId;
      messageId = await persistMessage({
        metaMessageId,
        contentType: 'text',
        contentText: text!,
        mediaUrl: null,
        replyToMessageId: input.replyToMessageId,
      });
    } else {
      // Meta's social attachment payload has no WhatsApp-style caption.
      // Persist the caption as its own text message so the CRM mirrors the
      // two messages the customer actually receives.
      if (text) {
        const captionResult = await sendSocialText({
          channel: conversation.channel,
          channelAccountId: connection.external_account_id,
          participantId: conversation.external_participant_id,
          accessToken,
          text,
        });
        await persistMessage({
          metaMessageId: captionResult.messageId,
          contentType: 'text',
          contentText: text,
          mediaUrl: null,
          replyToMessageId: input.replyToMessageId,
        });
      }

      const deliveryUrl = await prepareOutboundMediaUrl(
        db,
        accountId,
        mediaUrl!
      );
      const result = await sendSocialImage({
        channel: conversation.channel,
        channelAccountId: connection.external_account_id,
        participantId: conversation.external_participant_id,
        accessToken,
        imageUrl: deliveryUrl,
      });
      metaMessageId = result.messageId;
      messageId = await persistMessage({
        metaMessageId,
        contentType: 'image',
        contentText: null,
        mediaUrl: mediaUrl!,
      });
    }
  } catch (sendError) {
    if (sendError instanceof SocialSendError) throw sendError;
    const detail =
      sendError instanceof MetaApiError
        ? sendError.message
        : 'Meta no pudo entregar el mensaje';
    throw new SocialSendError(`Error de Meta: ${detail}`, 502);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await db
    .from('conversations')
    .update({
      last_message_text:
        text || (input.messageType === 'image' ? '[imagen]' : null),
      last_message_at: now,
      first_response_at: conversation.first_response_at ?? now,
      updated_at: now,
    })
    .eq('id', conversation.id);
  if (updateError) {
    console.error('[social send] conversation update failed:', updateError);
  }

  return { messageId, metaMessageId };
}
