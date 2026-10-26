import { after, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import { dispatchInboundToFlows } from '@/lib/flows/engine';
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply';
import { transcribeInboundAudio } from '@/lib/ai/inbound-audio';
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver';
import {
  reopenedTicketState,
  resolveReturningAgent,
} from '@/lib/tickets/reopen-assignment';
import { whatsappWebAckToStatus } from '@/lib/whatsapp/message-status';
import { linkedDeviceOutboundState } from '@/lib/whatsapp/linked-device-outbound';
import { prepareOutboundMediaUrl } from '@/lib/storage/private-media-server';
import { isWhatsAppBridgeRequestAuthorized } from '@/lib/whatsapp/bridge-auth';
import { visibleMediaText } from '@/lib/inbox/media-text';

export const maxDuration = 60;

let adminClient: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return adminClient;
}

interface InboundBody {
  accountId: string;
  connectionId: string;
  messageId: string;
  from: string;
  participantJid?: string;
  contactName?: string;
  avatarUrl?: string | null;
  contentType?: string;
  text?: string;
  timestamp?: number;
  quotedMessageId?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  isSticker?: boolean;
  durationMs?: number | null;
  direction?: 'inbound' | 'outbound_device';
  ack?: number | null;
}

export async function POST(request: Request) {
  if (!isWhatsAppBridgeRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as InboundBody;
  if (!body.accountId || !body.connectionId || !body.messageId || !body.from) {
    return NextResponse.json(
      {
        error: 'accountId, connectionId, messageId and from are required.',
      },
      { status: 400 }
    );
  }

  if (body.direction === 'outbound_device') {
    try {
      await ingest(body);
      return NextResponse.json({ persisted: true });
    } catch (error) {
      console.error(
        '[whatsapp-web/inbound] linked-device outbound processing failed:',
        error
      );
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'The linked-device message could not be persisted.',
        },
        { status: 500 }
      );
    }
  }

  after(async () => {
    try {
      await ingest(body);
    } catch (error) {
      console.error('[whatsapp-web/inbound] processing failed:', error);
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}

async function ingest(event: InboundBody) {
  const db = admin();
  const { data: config, error: configError } = await db
    .from('whatsapp_config')
    .select('id, account_id, user_id, default_department_id, provider')
    .eq('id', event.connectionId)
    .eq('account_id', event.accountId)
    .eq('provider', 'whatsapp_web')
    .maybeSingle();
  if (configError || !config) {
    throw new Error('QR WhatsApp configuration not found for this account.');
  }

  const { data: duplicate } = await db
    .from('messages')
    .select('id, media_url, content_text')
    .eq('message_id', event.messageId)
    .maybeSingle();
  if (duplicate) {
    // A WhatsApp Web media event can arrive before its bytes are available.
    // When the worker retries the same message, complete the existing row
    // instead of discarding the recovered attachment as a duplicate.
    const recoveredText = visibleMediaText(
      event.text,
      event.contentType || 'text'
    );
    const shouldRecoverMedia = !duplicate.media_url && Boolean(event.mediaUrl);
    const shouldRecoverText = !duplicate.content_text && Boolean(recoveredText);
    if (shouldRecoverMedia || shouldRecoverText) {
      const { error: recoveryError } = await db
        .from('messages')
        .update({
          ...(shouldRecoverMedia ? { media_url: event.mediaUrl } : {}),
          ...(shouldRecoverText ? { content_text: recoveredText } : {}),
        })
        .eq('id', duplicate.id);
      if (recoveryError) throw recoveryError;
    }
    return;
  }

  const phone = normalizePhone(event.from);
  if (!phone) throw new Error('Inbound phone number is invalid.');
  const participantJid = validParticipantJid(event.participantJid);
  const hasAvatarUpdate = Object.prototype.hasOwnProperty.call(
    event,
    'avatarUrl'
  );
  const avatarUrl = hasAvatarUpdate
    ? normalizeAvatarUrl(event.avatarUrl)
    : undefined;
  const repairedContact = await repairLegacyLidContact(
    db,
    event.accountId,
    participantJid,
    phone,
    event.contactName || phone,
    avatarUrl
  );
  const contactOutcome = repairedContact
    ? { contact: repairedContact, wasCreated: false }
    : await findOrCreateContact(
        db,
        event.accountId,
        config.user_id,
        phone,
        event.contactName || phone,
        avatarUrl
      );
  if (!contactOutcome) throw new Error('Unable to create inbound contact.');

  const conversationOutcome = await findOrCreateConversation(
    db,
    event.accountId,
    config.user_id,
    contactOutcome.contact.id,
    config.id,
    config.default_department_id
  );
  if (!conversationOutcome) throw new Error('Unable to create conversation.');
  const conversation = conversationOutcome.conversation;

  if (
    participantJid &&
    conversation.external_participant_id !== participantJid
  ) {
    await db
      .from('conversations')
      .update({ external_participant_id: participantJid })
      .eq('id', conversation.id);
    conversation.external_participant_id = participantJid;
  }

  let replyToMessageId: string | null = null;
  if (event.quotedMessageId) {
    const { data: quoted } = await db
      .from('messages')
      .select('id')
      .eq('conversation_id', conversation.id)
      .eq('message_id', event.quotedMessageId)
      .maybeSingle();
    replyToMessageId = quoted?.id ?? null;
  }

  const allowed = new Set([
    'text',
    'image',
    'document',
    'audio',
    'video',
    'location',
  ]);
  const contentType = allowed.has(event.contentType || '')
    ? event.contentType!
    : 'text';
  const cleanEventText = visibleMediaText(event.text, contentType);
  const text =
    cleanEventText ||
    (!event.mediaUrl && contentType !== 'text' && contentType !== 'audio'
      ? `[${contentType}]`
      : '');
  const receivedAt = new Date(
    (event.timestamp || Date.now() / 1000) * 1000
  ).toISOString();

  if (event.direction === 'outbound_device') {
    const status = whatsappWebAckToStatus(event.ack ?? 1) ?? 'sent';
    const syncedState = linkedDeviceOutboundState({
      assignedAgentId: conversation.assigned_agent_id,
      contentType,
      text,
      receivedAt,
      unreadCount: conversation.unread_count,
      updatedAt: new Date().toISOString(),
    });
    const { error: outboundError } = await db.from('messages').insert({
      conversation_id: conversation.id,
      sender_type: 'agent',
      sender_id: syncedState.senderId,
      content_type: contentType,
      content_text: text || null,
      media_url: event.mediaUrl || null,
      message_id: event.messageId,
      status,
      created_at: receivedAt,
      reply_to_message_id: replyToMessageId,
    });
    // The app's send request and WhatsApp's linked-device event can race to
    // persist the same outbound message. The unique key proves it is already
    // recorded, so this is an idempotent success rather than an ingest error.
    if (outboundError && outboundError.code !== '23505') throw outboundError;

    const { error: conversationError } = await db
      .from('conversations')
      .update(syncedState.conversationPatch)
      .eq('id', conversation.id);
    if (conversationError) throw conversationError;

    if (conversationOutcome.created) {
      await dispatchWebhookEvent(db, event.accountId, 'conversation.created', {
        conversation_id: conversation.id,
        contact_id: contactOutcome.contact.id,
      });
    }
    return;
  }

  const { count: priorCount } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer');
  const firstInbound = (priorCount ?? 0) === 0;

  const { data: sourceMessage, error: messageError } = await db
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'customer',
      content_type: contentType,
      content_text: text || null,
      media_url: event.mediaUrl || null,
      message_id: event.messageId,
      status: 'delivered',
      created_at: receivedAt,
      reply_to_message_id: replyToMessageId,
    })
    .select('id')
    .single();
  if (messageError || !sourceMessage) {
    throw messageError ?? new Error('Inbound message was not persisted.');
  }

  // A new customer message proves that every earlier outbound message in
  // this thread was read, even when a linked-device ACK was missed while
  // the QR worker was restarting or temporarily disconnected.
  const { error: readReceiptError } = await db
    .from('messages')
    .update({ status: 'read' })
    .eq('conversation_id', conversation.id)
    .in('sender_type', ['agent', 'bot'])
    .in('status', ['sending', 'sent', 'delivered'])
    .lt('created_at', receivedAt);
  if (readReceiptError) {
    console.error(
      '[whatsapp-web/inbound] read receipt fallback failed:',
      readReceiptError
    );
  }

  let effectiveText = text;
  if (contentType === 'audio' && event.mediaUrl) {
    try {
      const signedAudioUrl = await prepareOutboundMediaUrl(
        db,
        event.accountId,
        event.mediaUrl,
        120
      );
      const mediaResponse = await fetch(signedAudioUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      });
      if (!mediaResponse.ok) {
        throw new Error(
          `Inbound audio download failed (${mediaResponse.status}).`
        );
      }
      const buffer = new Uint8Array(await mediaResponse.arrayBuffer());
      const transcript = await transcribeInboundAudio({
        db,
        accountId: event.accountId,
        conversationId: conversation.id,
        contactId: contactOutcome.contact.id,
        actorUserId: config.user_id,
        sourceMessageId: sourceMessage.id,
        sourceMessageExternalId: event.messageId,
        whatsappConfigId: config.id,
        buffer,
        mimeType: event.mediaType || 'audio/ogg',
        durationMs: event.durationMs,
      });
      if (transcript) effectiveText = transcript;
    } catch (error) {
      console.error(
        '[whatsapp-web/inbound] audio transcription failed:',
        error
      );
    }
  }

  await db
    .from('conversations')
    .update({
      last_message_text: effectiveText || `[${contentType}]`,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);

  if (conversationOutcome.created) {
    await dispatchWebhookEvent(db, event.accountId, 'conversation.created', {
      conversation_id: conversation.id,
      contact_id: contactOutcome.contact.id,
    });
  }

  const flow = await dispatchInboundToFlows({
    accountId: event.accountId,
    userId: config.user_id,
    contactId: contactOutcome.contact.id,
    conversationId: conversation.id,
    message: {
      kind: 'text',
      text: effectiveText,
      meta_message_id: event.messageId,
    },
    isFirstInboundMessage: firstInbound,
  });

  const triggers: Array<
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
  > = [];
  if (!flow.consumed) triggers.push('new_message_received', 'keyword_match');
  if (contactOutcome.wasCreated) triggers.unshift('new_contact_created');
  if (firstInbound) triggers.unshift('first_inbound_message');
  for (const triggerType of triggers) {
    void runAutomationsForTrigger({
      accountId: event.accountId,
      triggerType,
      contactId: contactOutcome.contact.id,
      context: {
        message_text: effectiveText,
        conversation_id: conversation.id,
      },
    });
  }

  const hasLeadAttachment =
    (contentType === 'image' || contentType === 'document') &&
    Boolean(event.mediaUrl);
  if (effectiveText.trim() || hasLeadAttachment) {
    await dispatchInboundToAiReply({
      accountId: event.accountId,
      conversationId: conversation.id,
      contactId: contactOutcome.contact.id,
      configOwnerUserId: config.user_id,
      sourceMessageExternalId: event.messageId,
      captureOnly: flow.consumed || !effectiveText.trim(),
    });
  }

  await dispatchWebhookEvent(db, event.accountId, 'message.received', {
    conversation_id: conversation.id,
    contact_id: contactOutcome.contact.id,
    whatsapp_message_id: event.messageId,
    content_type: contentType,
    text: effectiveText,
  });
}

function validParticipantJid(value: unknown): string | null {
  return typeof value === 'string' && /^[^@\s]+@(c\.us|lid)$/i.test(value)
    ? value
    : null;
}

function normalizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 3000) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

interface ContactIdentityRow {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
  [key: string]: unknown;
}

async function updateContactIdentity(
  db: SupabaseClient,
  contact: ContactIdentityRow,
  name: string,
  avatarUrl: string | null | undefined
): Promise<ContactIdentityRow> {
  const patch: Record<string, string | null> = {};
  if (name && contact.name !== name) patch.name = name;
  if (avatarUrl !== undefined && contact.avatar_url !== avatarUrl) {
    patch.avatar_url = avatarUrl;
  }
  if (Object.keys(patch).length === 0) return contact;

  const { data, error } = await db
    .from('contacts')
    .update(patch)
    .eq('id', contact.id)
    .select()
    .single();
  if (error) throw error;
  return data as ContactIdentityRow;
}

async function repairLegacyLidContact(
  db: SupabaseClient,
  accountId: string,
  participantJid: string | null,
  realPhone: string,
  name: string,
  avatarUrl: string | null | undefined
) {
  if (!participantJid?.toLowerCase().endsWith('@lid')) return null;

  const legacyLid = normalizePhone(participantJid.split('@')[0] || '');
  if (!legacyLid || legacyLid === realPhone) return null;

  const { data: realContact } = await db
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq('phone_normalized', realPhone)
    .maybeSingle();
  if (realContact) {
    return updateContactIdentity(db, realContact, name, avatarUrl);
  }

  const { data: legacyContact } = await db
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq('phone_normalized', legacyLid)
    .maybeSingle();
  if (!legacyContact) return null;

  const { data: repaired, error } = await db
    .from('contacts')
    .update({
      phone: realPhone,
      ...(name ? { name } : {}),
      ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
    })
    .eq('id', legacyContact.id)
    .select()
    .single();
  if (error) throw error;
  return repaired;
}

async function findOrCreateContact(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  phone: string,
  name: string,
  avatarUrl: string | null | undefined
) {
  const existing = await findExistingContact(db, accountId, phone);
  if (existing) {
    const contact = await updateContactIdentity(db, existing, name, avatarUrl);
    return { contact, wasCreated: false };
  }

  const { data, error } = await db
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: userId,
      phone,
      name,
      ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
    })
    .select()
    .single();
  if (error && isUniqueViolation(error)) {
    const raced = await findExistingContact(db, accountId, phone);
    return raced ? { contact: raced, wasCreated: false } : null;
  }
  if (error || !data) return null;
  return { contact: data, wasCreated: true };
}

async function findOrCreateConversation(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  contactId: string,
  configId: string,
  defaultDepartmentId: string | null
) {
  const { data: existing } = await db
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('whatsapp_config_id', configId)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'closed' || existing.status === 'waiting') {
      const reopenedState =
        existing.status === 'closed'
          ? reopenedTicketState(
              await resolveReturningAgent(db, {
                accountId,
                assignedAgentId: existing.assigned_agent_id,
                departmentId: existing.department_id,
              })
            )
          : {
              status: 'open' as const,
              assigned_agent_id: existing.assigned_agent_id,
            };
      const { data: reopened } = await db
        .from('conversations')
        .update({
          ...reopenedState,
          closed_at: null,
          closed_by_user_id: null,
          waiting_since: null,
          status_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      return reopened ? { conversation: reopened, created: false } : null;
    }
    return { conversation: existing, created: false };
  }

  let departmentId = defaultDepartmentId;
  if (!departmentId) {
    const { data: department } = await db
      .from('departments')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();
    departmentId = department?.id ?? null;
  }

  const { data, error } = await db
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
      status: 'pending',
      assigned_agent_id: null,
      department_id: departmentId,
      whatsapp_config_id: configId,
    })
    .select()
    .single();
  if (error && isUniqueViolation(error)) {
    const { data: raced } = await db
      .from('conversations')
      .select('*')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('whatsapp_config_id', configId)
      .maybeSingle();
    return raced ? { conversation: raced, created: false } : null;
  }
  if (error || !data) return null;
  return { conversation: data, created: true };
}
