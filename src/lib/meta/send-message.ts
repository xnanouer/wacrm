import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { MetaApiError, sendSocialText } from '@/lib/meta/api';
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
 * Send a text reply through the Facebook Page or Instagram professional
 * account attached to an existing social conversation.
 */
export async function sendSocialMessageToConversation(
  db: SupabaseClient,
  accountId: string,
  input: {
    conversationId: string;
    messageType: string;
    contentText?: string | null;
    replyToMessageId?: string | null;
  }
): Promise<{ messageId: string; metaMessageId: string }> {
  const text = input.contentText?.trim();
  if (input.messageType !== 'text' || !text) {
    throw new SocialSendError(
      'Facebook e Instagram admiten solo respuestas de texto en esta versión.',
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

  let metaMessageId: string;
  try {
    const result = await sendSocialText({
      channel: conversation.channel,
      channelAccountId: connection.external_account_id,
      participantId: conversation.external_participant_id,
      accessToken: decrypt(secret.access_token),
      text,
    });
    metaMessageId = result.messageId;
  } catch (sendError) {
    const detail =
      sendError instanceof MetaApiError
        ? sendError.message
        : 'Meta no pudo entregar el mensaje';
    throw new SocialSendError(`Error de Meta: ${detail}`, 502);
  }

  const { data: message, error: messageError } = await db
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'agent',
      content_type: 'text',
      content_text: text,
      message_id: metaMessageId,
      status: 'sent',
      reply_to_message_id: input.replyToMessageId || null,
    })
    .select('id')
    .single();
  if (messageError || !message) {
    console.error('[social send] message persistence failed:', messageError);
    throw new SocialSendError(
      'Meta envió el mensaje, pero no se pudo guardar en el CRM.',
      500
    );
  }

  const now = new Date().toISOString();
  const { error: updateError } = await db
    .from('conversations')
    .update({
      last_message_text: text,
      last_message_at: now,
      first_response_at: conversation.first_response_at ?? now,
      updated_at: now,
    })
    .eq('id', conversation.id);
  if (updateError) {
    console.error('[social send] conversation update failed:', updateError);
  }

  return { messageId: message.id, metaMessageId };
}
