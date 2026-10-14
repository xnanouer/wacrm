import type { SupabaseClient } from '@supabase/supabase-js';

import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  reopenedTicketState,
  resolveReturningAgent,
} from '@/lib/tickets/reopen-assignment';
import { decrypt } from '@/lib/whatsapp/encryption';
import { fetchSocialParticipant } from '@/lib/meta/api';
import {
  parseMetaMessagingEvents,
  parseMetaReceiptEvents,
  type SocialInboundMessage,
  type SocialMessageReceipt,
} from './webhook-events';
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver';

interface ConnectionRow {
  id: string;
  account_id: string;
  channel: 'facebook' | 'instagram';
  external_account_id: string;
  display_name: string;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
}

export async function processMetaWebhook(payload: unknown): Promise<void> {
  const admin = supabaseAdmin();
  const receipts = parseMetaReceiptEvents(payload);
  for (const receipt of receipts) {
    try {
      await processReceiptEvent(admin, receipt);
    } catch (error) {
      console.error('[meta webhook] receipt event failed:', {
        channel: receipt.channel,
        account: receipt.channelAccountId,
        status: receipt.status,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  const events = parseMetaMessagingEvents(payload);
  for (const event of events) {
    try {
      await processInboundEvent(admin, event);
    } catch (error) {
      console.error('[meta webhook] inbound event failed:', {
        channel: event.channel,
        account: event.channelAccountId,
        messageId: event.messageId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }
}

function nextSocialStatus(
  current: string,
  incoming: SocialMessageReceipt['status']
): SocialMessageReceipt['status'] | null {
  if (current === 'failed' || current === 'read') return null;
  if (incoming === 'read') return 'read';
  return current === 'sending' || current === 'sent' ? 'delivered' : null;
}

async function processReceiptEvent(
  admin: SupabaseClient,
  receipt: SocialMessageReceipt
): Promise<void> {
  const { data: connection } = await admin
    .from('channel_connections')
    .select('id, account_id')
    .eq('channel', receipt.channel)
    .eq('external_account_id', receipt.channelAccountId)
    .eq('status', 'connected')
    .maybeSingle();
  if (!connection || !receipt.participantId) return;

  const { data: conversation } = await admin
    .from('conversations')
    .select('id')
    .eq('account_id', connection.account_id)
    .eq('channel_connection_id', connection.id)
    .eq('external_participant_id', receipt.participantId)
    .maybeSingle();
  if (!conversation) return;

  let query = admin
    .from('messages')
    .select('id, message_id, status')
    .eq('conversation_id', conversation.id)
    .in('sender_type', ['agent', 'bot']);
  if (receipt.messageIds.length > 0) {
    query = query.in('message_id', receipt.messageIds);
  } else if (receipt.watermark) {
    query = query.lte('created_at', receipt.watermark);
  } else {
    return;
  }

  const { data: messages, error } = await query;
  if (error)
    throw new Error(`No se pudieron leer los estados: ${error.message}`);

  for (const message of messages ?? []) {
    const nextStatus = nextSocialStatus(message.status, receipt.status);
    if (!nextStatus) continue;
    const { error: updateError } = await admin
      .from('messages')
      .update({ status: nextStatus })
      .eq('id', message.id)
      .eq('status', message.status);
    if (updateError) {
      console.error(
        '[meta webhook] message status update failed:',
        updateError
      );
      continue;
    }
    await dispatchWebhookEvent(
      admin,
      connection.account_id,
      'message.status_updated',
      {
        conversation_id: conversation.id,
        meta_message_id: message.message_id,
        channel: receipt.channel,
        status: nextStatus,
      }
    );
  }
}

async function processInboundEvent(
  admin: SupabaseClient,
  event: SocialInboundMessage
): Promise<void> {
  const { data: connection, error: connectionError } = await admin
    .from('channel_connections')
    .select(
      'id, account_id, channel, external_account_id, display_name, metadata, created_by_user_id'
    )
    .eq('channel', event.channel)
    .eq('external_account_id', event.channelAccountId)
    .eq('status', 'connected')
    .maybeSingle();
  if (connectionError || !connection) {
    console.warn(
      `[meta webhook] no connected ${event.channel} account for ${event.channelAccountId}`
    );
    return;
  }
  const typedConnection = connection as ConnectionRow;

  const { data: secret, error: secretError } = await admin
    .from('channel_connection_secrets')
    .select('access_token')
    .eq('connection_id', typedConnection.id)
    .eq('account_id', typedConnection.account_id)
    .maybeSingle();
  if (secretError || !secret?.access_token) {
    throw new Error('La conexión no tiene una credencial activa');
  }
  const accessToken = decrypt(secret.access_token);

  let participant: {
    name?: string;
    username?: string;
    avatarUrl?: string;
  } = {};
  try {
    participant = await fetchSocialParticipant({
      channel: event.channel,
      participantId: event.participantId,
      accessToken,
    });
  } catch (error) {
    console.warn(
      `[meta webhook] profile ${event.participantId} unavailable:`,
      error instanceof Error ? error.message : error
    );
  }

  const identity = await findOrCreateIdentity(
    admin,
    typedConnection,
    event.participantId,
    participant
  );
  const conversation = await findOrCreateConversation(
    admin,
    typedConnection,
    identity.contactId,
    event
  );

  const { data: existing } = await admin
    .from('messages')
    .select('id')
    .eq('conversation_id', conversation.id)
    .eq('message_id', event.messageId)
    .maybeSingle();
  if (existing) return;

  const { error: messageError } = await admin.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: event.contentType,
    content_text: event.text,
    media_url: event.mediaUrl,
    message_id: event.messageId,
    status: 'delivered',
    created_at: event.timestamp,
  });
  if (messageError) {
    if (messageError.code === '23505') return;
    throw new Error(`No se pudo guardar el mensaje: ${messageError.message}`);
  }

  const { error: updateError } = await admin
    .from('conversations')
    .update({
      last_message_text: event.text || `[${event.contentType}]`,
      last_message_at: event.timestamp,
      unread_count: (conversation.unread_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);
  if (updateError) {
    console.error('[meta webhook] conversation update failed:', updateError);
  }

  await dispatchWebhookEvent(
    admin,
    typedConnection.account_id,
    'message.received',
    {
      conversation_id: conversation.id,
      contact_id: identity.contactId,
      channel: event.channel,
      meta_message_id: event.messageId,
      content_type: event.contentType,
      text: event.text,
    }
  );

  let configOwnerUserId = typedConnection.created_by_user_id;
  if (!configOwnerUserId) {
    const { data: account } = await admin
      .from('accounts')
      .select('owner_user_id')
      .eq('id', typedConnection.account_id)
      .maybeSingle();
    configOwnerUserId = account?.owner_user_id ?? null;
  }
  if (configOwnerUserId) {
    await dispatchInboundToAiReply({
      accountId: typedConnection.account_id,
      conversationId: conversation.id,
      contactId: identity.contactId,
      configOwnerUserId,
      sourceMessageExternalId: event.messageId,
    });
  }
}

async function findOrCreateIdentity(
  admin: SupabaseClient,
  connection: ConnectionRow,
  participantId: string,
  participant: { name?: string; username?: string; avatarUrl?: string }
): Promise<{ contactId: string }> {
  const { data: existing } = await admin
    .from('contact_channel_identities')
    .select('id, contact_id')
    .eq('account_id', connection.account_id)
    .eq('channel', connection.channel)
    .eq('channel_connection_id', connection.id)
    .eq('external_participant_id', participantId)
    .maybeSingle();
  const displayName =
    participant.name ||
    (participant.username ? `@${participant.username}` : null) ||
    `Cliente de ${connection.channel === 'facebook' ? 'Facebook' : 'Instagram'}`;

  if (existing) {
    await Promise.all([
      admin
        .from('contact_channel_identities')
        .update({
          display_name: displayName,
          username: participant.username ?? null,
          avatar_url: participant.avatarUrl ?? null,
        })
        .eq('id', existing.id),
      admin
        .from('contacts')
        .update({
          name: displayName,
          avatar_url: participant.avatarUrl ?? null,
          source: connection.channel,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.contact_id)
        .eq('account_id', connection.account_id),
    ]);
    return { contactId: existing.contact_id };
  }

  let auditUserId = connection.created_by_user_id;
  if (!auditUserId) {
    const { data: account } = await admin
      .from('accounts')
      .select('owner_user_id')
      .eq('id', connection.account_id)
      .single();
    auditUserId = account?.owner_user_id ?? null;
  }
  if (!auditUserId) throw new Error('La empresa no tiene usuario propietario');

  // `contacts.phone` is still required by the WhatsApp-era schema. Social
  // identities use a digit-free channel label; phone_normalized becomes an
  // empty string and is excluded from the partial phone uniqueness index.
  const { data: contact, error: contactError } = await admin
    .from('contacts')
    .insert({
      account_id: connection.account_id,
      user_id: auditUserId,
      phone: connection.channel,
      name: displayName,
      avatar_url: participant.avatarUrl ?? null,
      source: connection.channel,
    })
    .select('id')
    .single();
  if (contactError || !contact) {
    throw new Error(`No se pudo crear el contacto: ${contactError?.message}`);
  }

  const { data: createdIdentity, error: identityError } = await admin
    .from('contact_channel_identities')
    .insert({
      account_id: connection.account_id,
      contact_id: contact.id,
      channel: connection.channel,
      channel_connection_id: connection.id,
      external_participant_id: participantId,
      display_name: displayName,
      username: participant.username ?? null,
      avatar_url: participant.avatarUrl ?? null,
    })
    .select('contact_id')
    .single();
  if (identityError || !createdIdentity) {
    if (identityError?.code === '23505') {
      await admin.from('contacts').delete().eq('id', contact.id);
      const { data: raced } = await admin
        .from('contact_channel_identities')
        .select('contact_id')
        .eq('account_id', connection.account_id)
        .eq('channel', connection.channel)
        .eq('channel_connection_id', connection.id)
        .eq('external_participant_id', participantId)
        .single();
      if (raced) return { contactId: raced.contact_id };
    }
    throw new Error(`No se pudo crear la identidad: ${identityError?.message}`);
  }
  return { contactId: createdIdentity.contact_id };
}

async function findOrCreateConversation(
  admin: SupabaseClient,
  connection: ConnectionRow,
  contactId: string,
  event: SocialInboundMessage
): Promise<{ id: string; unread_count: number; created: boolean }> {
  const { data: existing } = await admin
    .from('conversations')
    .select('id, unread_count, status, assigned_agent_id, department_id')
    .eq('account_id', connection.account_id)
    .eq('channel', connection.channel)
    .eq('channel_connection_id', connection.id)
    .eq('external_participant_id', event.participantId)
    .maybeSingle();
  if (existing) {
    if (existing.status === 'closed' || existing.status === 'waiting') {
      const reopenedState =
        existing.status === 'closed'
          ? reopenedTicketState(
              await resolveReturningAgent(admin, {
                accountId: connection.account_id,
                assignedAgentId: existing.assigned_agent_id,
                departmentId: existing.department_id,
              })
            )
          : {
              status: 'open' as const,
              assigned_agent_id: existing.assigned_agent_id,
            };
      await admin
        .from('conversations')
        .update({
          ...reopenedState,
          closed_at: null,
          closed_by_user_id: null,
          waiting_since: null,
          status_changed_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
    return {
      id: existing.id,
      unread_count: existing.unread_count ?? 0,
      created: false,
    };
  }

  const { data: account } = await admin
    .from('accounts')
    .select('owner_user_id')
    .eq('id', connection.account_id)
    .single();
  const auditUserId = connection.created_by_user_id || account?.owner_user_id;
  if (!auditUserId) throw new Error('La empresa no tiene usuario propietario');

  const { data: department } = await admin
    .from('departments')
    .select('id')
    .eq('account_id', connection.account_id)
    .eq('is_active', true)
    .order('position')
    .limit(1)
    .maybeSingle();
  const { data: created, error } = await admin
    .from('conversations')
    .insert({
      account_id: connection.account_id,
      user_id: auditUserId,
      contact_id: contactId,
      status: 'pending',
      channel: connection.channel,
      channel_connection_id: connection.id,
      external_conversation_id: event.participantId,
      external_participant_id: event.participantId,
      department_id: department?.id ?? null,
      unread_count: 0,
    })
    .select('id, unread_count')
    .single();
  if (error || !created) {
    if (error?.code === '23505') {
      const { data: raced } = await admin
        .from('conversations')
        .select('id, unread_count')
        .eq('account_id', connection.account_id)
        .eq('channel', connection.channel)
        .eq('channel_connection_id', connection.id)
        .eq('external_participant_id', event.participantId)
        .single();
      if (raced)
        return {
          ...raced,
          unread_count: raced.unread_count ?? 0,
          created: false,
        };
    }
    throw new Error(`No se pudo crear la conversación: ${error?.message}`);
  }

  await dispatchWebhookEvent(
    admin,
    connection.account_id,
    'conversation.created',
    {
      conversation_id: created.id,
      contact_id: contactId,
      channel: connection.channel,
    }
  );
  return {
    id: created.id,
    unread_count: created.unread_count ?? 0,
    created: true,
  };
}
