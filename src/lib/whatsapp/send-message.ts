// ============================================================
// Outbound message send — the core that both the dashboard's
// `/api/whatsapp/send` route and the public `/api/v1/messages`
// endpoint call.
//
// Given a conversation and message params, this:
//   1. validates the params for the message type,
//   2. loads the conversation + contact + WhatsApp config,
//   3. sends to Meta (with phone-variant retry + contact auto-fix),
//   4. persists the message + updates the conversation,
//   5. pauses any active Flow run for the contact (agent stepped in).
//
// It is transport-agnostic: it takes a `SupabaseClient` and an
// `accountId` and throws `SendMessageError` on failure. The callers
// own auth, rate-limiting, body parsing, and mapping the error to
// their respective response shapes (internal `{ error }` vs the v1
// envelope). Behaviour is identical to the original inline route —
// this is a straight extraction so the public endpoint can reuse it
// without duplicating ~250 lines of Meta plumbing.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  type MediaKind,
} from '@/lib/whatsapp/meta-api';
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';
import type { MessageStatus, MessageTemplate } from '@/types';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import { sendWhatsAppWebMessage } from '@/lib/whatsapp/web-service';
import { whatsappWebAckToStatus } from '@/lib/whatsapp/message-status';
import { prepareOutboundMediaUrl } from '@/lib/storage/private-media-server';

export const MEDIA_KINDS = ['image', 'video', 'document', 'audio'] as const;
export const VALID_MESSAGE_TYPES = [
  'text',
  'template',
  ...MEDIA_KINDS,
] as const;

/**
 * Typed failure with a machine `code` and a suggested HTTP `status`.
 * Callers map it to their own response shape (`toErrorResponse` for
 * the dashboard route, the v1 envelope for the public endpoint).
 */
export class SendMessageError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'SendMessageError';
    this.code = code;
    this.status = status;
  }
}

export interface SendMessageParams {
  conversationId: string;
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  /** Legacy positional body params (only used if messageParams.body unset). */
  templateParams?: string[];
  /** Structured template params (header/body/buttons). */
  templateMessageParams?: unknown;
  replyToMessageId?: string | null;
  /** Persist the real sender identity. Automated responders use `bot`. */
  senderType?: 'agent' | 'bot';
  /** Auth user that authored a human message. Null for bots/integrations. */
  senderId?: string | null;
  /** Human sends pause active Flows; automated sends do not. */
  pauseFlows?: boolean;
}

export interface SendMessageResult {
  /** Our `messages.id` (the persisted row). */
  messageId: string;
  /** Meta's `wamid` for the delivered message. */
  whatsappMessageId: string;
}

/**
 * Send a message in an existing conversation and persist it.
 *
 * `db` may be an RLS-scoped user client (dashboard) or the service-
 * role client (public API) — every query is filtered by `accountId`
 * either way, so tenancy holds regardless of which client is passed.
 */
/**
 * Validate the message-shape params (type, required content, caption
 * cap) independently of any DB state, throwing `SendMessageError` on a
 * bad payload. Exported so a caller can reject a malformed request
 * *before* it finds-or-creates a contact/conversation — otherwise an
 * invalid payload leaves an orphan empty conversation behind. The send
 * core calls this too, so validation can't be skipped.
 */
export function validateSendMessageParams(params: {
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  templateName?: string | null;
}): void {
  const { messageType, contentText, mediaUrl, templateName } = params;

  if (!messageType) {
    throw new SendMessageError('bad_request', 'message_type is required', 400);
  }

  const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(messageType);

  if (!(VALID_MESSAGE_TYPES as readonly string[]).includes(messageType)) {
    throw new SendMessageError(
      'bad_request',
      `Unsupported message_type "${messageType}"`,
      400
    );
  }

  if (messageType === 'text' && !contentText) {
    throw new SendMessageError(
      'bad_request',
      'content_text is required for text messages',
      400
    );
  }

  if (messageType === 'template' && !templateName) {
    throw new SendMessageError(
      'bad_request',
      'template_name is required for template messages',
      400
    );
  }

  if (isMediaKind && !mediaUrl) {
    throw new SendMessageError(
      'bad_request',
      `media_url is required for ${messageType} messages`,
      400
    );
  }

  // Meta caps media captions at 1024 chars (audio carries none).
  if (
    isMediaKind &&
    messageType !== 'audio' &&
    typeof contentText === 'string' &&
    contentText.length > 1024
  ) {
    throw new SendMessageError(
      'bad_request',
      'Caption exceeds the 1024-character limit',
      400
    );
  }
}

export async function sendMessageToConversation(
  db: SupabaseClient,
  accountId: string,
  params: SendMessageParams
): Promise<SendMessageResult> {
  const {
    conversationId,
    messageType,
    contentText,
    mediaUrl,
    filename,
    templateName,
    templateLanguage,
    templateParams,
    templateMessageParams,
    replyToMessageId,
    senderType = 'agent',
    senderId,
    pauseFlows = true,
  } = params;

  if (!conversationId) {
    throw new SendMessageError(
      'bad_request',
      'conversation_id is required',
      400
    );
  }

  validateSendMessageParams({
    messageType,
    contentText,
    mediaUrl,
    templateName,
  });

  const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(messageType);

  // Conversation + contact, account-scoped.
  const { data: conversation, error: convError } = await db
    .from('conversations')
    .select('*, contact:contacts(*)')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .single();

  if (convError || !conversation) {
    throw new SendMessageError('not_found', 'Conversation not found', 404);
  }

  const contact = conversation.contact;
  if (!contact?.phone) {
    throw new SendMessageError(
      'bad_request',
      'Contact phone number not found',
      400
    );
  }

  const sanitizedPhone = sanitizePhoneForMeta(contact.phone);
  if (!isValidE164(sanitizedPhone)) {
    throw new SendMessageError(
      'bad_request',
      'Invalid phone number format',
      400
    );
  }

  // WhatsApp config, account-scoped.
  const configResult = conversation.whatsapp_config_id
    ? await db
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', accountId)
        .eq('id', conversation.whatsapp_config_id)
        .maybeSingle()
    : await db
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', accountId)
        .eq('status', 'connected')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
  const { data: config, error: configError } = configResult;

  if (configError || !config) {
    throw new SendMessageError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    );
  }

  const provider = config.provider ?? 'cloud_api';
  let accessToken: string | null = null;
  if (provider === 'cloud_api') {
    if (!config.access_token || !config.phone_number_id) {
      throw new SendMessageError(
        'whatsapp_not_configured',
        'Meta Cloud API credentials are incomplete.',
        400
      );
    }
    accessToken = decrypt(config.access_token);

    // Self-heal legacy CBC ciphertexts. Fire-and-forget; idempotent.
    if (isLegacyFormat(config.access_token)) {
      void db
        .from('whatsapp_config')
        .update({ access_token: encrypt(accessToken) })
        .eq('id', config.id)
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) {
            console.warn(
              '[send-message] access_token GCM upgrade failed:',
              error.message
            );
          }
        });
    }
  }

  // Resolve the reply target to its Meta message_id. The parent must
  // belong to this same conversation — otherwise a caller could quote
  // messages they can't see by guessing UUIDs.
  let contextMessageId: string | undefined;
  if (replyToMessageId) {
    const { data: parent, error: parentError } = await db
      .from('messages')
      .select('message_id, conversation_id')
      .eq('id', replyToMessageId)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (parentError || !parent) {
      throw new SendMessageError(
        'bad_request',
        'reply_to_message_id not found in this conversation',
        400
      );
    }
    if (!parent.message_id) {
      console.warn(
        '[send-message] reply target has no Meta message_id; sending without context'
      );
    } else {
      contextMessageId = parent.message_id;
    }
  }

  // Template row (for header + button components). isMessageTemplate
  // guards against a malformed local row crashing the send-builder.
  let templateRow: MessageTemplate | null = null;
  if (provider === 'cloud_api' && messageType === 'template' && templateName) {
    const { data } = await db
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .eq('name', templateName)
      .eq('language', templateLanguage || 'en_US')
      .maybeSingle();
    if (data && !isMessageTemplate(data)) {
      throw new SendMessageError(
        'template_malformed',
        'Template row is malformed locally — run "Sync from Meta" in Settings to repair it.',
        500
      );
    }
    templateRow = data ?? null;
  }

  const deliveryMediaUrl =
    isMediaKind && mediaUrl
      ? await prepareOutboundMediaUrl(db, accountId, mediaUrl)
      : null;
  if (templateRow?.header_media_url) {
    templateRow = {
      ...templateRow,
      header_media_url: await prepareOutboundMediaUrl(
        db,
        accountId,
        templateRow.header_media_url
      ),
    };
  }

  const attempt = async (phone: string): Promise<string> => {
    if (messageType === 'template') {
      const result = await sendTemplateMessage({
        phoneNumberId: config.phone_number_id!,
        accessToken: accessToken!,
        to: phone,
        templateName: templateName!,
        language: templateLanguage || 'en_US',
        template: templateRow ?? undefined,
        messageParams: templateMessageParams ?? undefined,
        params: templateParams || [],
        contextMessageId,
      });
      return result.messageId;
    }
    if (isMediaKind) {
      const result = await sendMediaMessage({
        phoneNumberId: config.phone_number_id!,
        accessToken: accessToken!,
        to: phone,
        kind: messageType as MediaKind,
        link: deliveryMediaUrl!,
        caption: contentText || undefined,
        filename: filename || undefined,
        contextMessageId,
      });
      return result.messageId;
    }
    const result = await sendTextMessage({
      phoneNumberId: config.phone_number_id!,
      accessToken: accessToken!,
      to: phone,
      text: contentText!,
      contextMessageId,
    });
    return result.messageId;
  };

  // Send via Meta — retry across phone-number variants if Meta rejects
  // with "recipient not in allowed list"; persist a working variant
  // back to the contact so the next send goes straight through.
  let waMessageId = '';
  let initialMessageStatus: MessageStatus = 'sent';
  let workingPhone = sanitizedPhone;
  if (provider === 'whatsapp_web') {
    if (messageType === 'template') {
      throw new SendMessageError(
        'unsupported_transport',
        'Las plantillas aprobadas pertenecen a Meta Cloud API y no se usan en la conexión QR.',
        400
      );
    }
    try {
      const result = await sendWhatsAppWebMessage({
        accountId,
        connectionId: config.id,
        to: sanitizedPhone,
        messageType,
        text: contentText,
        mediaUrl: deliveryMediaUrl,
        filename,
        quotedMessageId: contextMessageId,
        participantJid: conversation.external_participant_id,
      });
      waMessageId = result.messageId;
      initialMessageStatus =
        whatsappWebAckToStatus(result.ack ?? 1) ?? initialMessageStatus;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new SendMessageError(
        'whatsapp_transport_error',
        `No se pudo enviar por WhatsApp QR: ${message}`,
        502
      );
    }
  } else
    try {
      const variants = phoneVariants(sanitizedPhone);
      let lastError: unknown = null;

      for (const variant of variants) {
        try {
          waMessageId = await attempt(variant);
          workingPhone = variant;
          lastError = null;
          break;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!isRecipientNotAllowedError(message)) {
            throw err;
          }
          lastError = err;
          console.warn(
            `[send-message] variant "${variant}" rejected by Meta, trying next…`
          );
        }
      }

      if (lastError) throw lastError;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown Meta API error';
      console.error(
        '[send-message] Meta send failed for all variants:',
        message
      );
      throw new SendMessageError(
        'meta_error',
        `Meta API error: ${message}`,
        502
      );
    }

  if (workingPhone !== sanitizedPhone) {
    console.log(
      `[send-message] Auto-corrected contact phone: ${sanitizedPhone} → ${workingPhone}`
    );
    await db
      .from('contacts')
      .update({ phone: workingPhone })
      .eq('id', contact.id);
  }

  // Persist the sent message. Field names MUST match the messages
  // schema (see 001_initial_schema.sql).
  const { data: insertedMessageRecord, error: msgError } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: senderType,
      sender_id: senderType === 'agent' ? senderId || null : null,
      content_type: messageType,
      content_text: contentText || null,
      media_url: mediaUrl || null,
      template_name: templateName || null,
      message_id: waMessageId,
      status: initialMessageStatus,
      reply_to_message_id: replyToMessageId || null,
    })
    .select()
    .single();

  let messageRecord = insertedMessageRecord;
  if (msgError?.code === '23505' && waMessageId) {
    // The linked-device event can persist an outbound QR message before this
    // request resumes. Reuse that row instead of reporting a false failure
    // after WhatsApp already accepted the message.
    const { data: existingMessage, error: existingError } = await db
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('message_id', waMessageId)
      .maybeSingle();
    if (!existingError && existingMessage) {
      messageRecord = existingMessage;
    }
  }

  if (msgError && !messageRecord) {
    console.error('[send-message] error inserting sent message:', msgError);
    throw new SendMessageError(
      'db_error',
      `Message sent to Meta but failed to save to DB: ${msgError.message}`,
      500
    );
  }

  if (!messageRecord) {
    throw new SendMessageError(
      'db_error',
      'Message sent to WhatsApp but its local record could not be recovered.',
      500
    );
  }

  await db
    .from('conversations')
    .update({
      last_message_text: contentText || `[${messageType}]`,
      last_message_at: new Date().toISOString(),
      first_response_at:
        conversation.first_response_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  // A real human message is an immediate takeover signal. This preserves the
  // assignee but stops both manual and after-hours AI coverage, preventing a
  // delayed inbound job from replying alongside the executive.
  if (
    senderType === 'agent' &&
    ['ai_active', 'ai_after_hours', 'waiting_for_human'].includes(
      conversation.ai_state
    )
  ) {
    const takeoverAt = new Date().toISOString();
    const { error: takeoverError } = await db
      .from('conversations')
      .update({
        ai_state: 'human_active',
        ai_autoreply_disabled: true,
        ai_pause_reason: 'human_message',
        ai_paused_at: takeoverAt,
        last_human_takeover_at: takeoverAt,
        human_takeover_by: conversation.assigned_agent_id ?? null,
        manual_ai_activated_at: null,
        manual_ai_activated_by: null,
      })
      .eq('id', conversationId)
      .eq('account_id', accountId);
    if (takeoverError) {
      console.error('[ai coverage] pause-on-human-send failed:', takeoverError);
    }
  }

  // Pause any active Flow run for this contact — the agent stepping in
  // is the strongest "yield, human is here" signal. Best-effort.
  if (pauseFlows) {
    try {
      const { error: pauseErr } = await supabaseAdmin()
        .from('flow_runs')
        .update({
          status: 'paused_by_agent',
          ended_at: new Date().toISOString(),
          end_reason: 'agent_replied',
        })
        .eq('account_id', accountId)
        .eq('contact_id', contact.id)
        .eq('status', 'active');
      if (pauseErr) {
        console.error('[flows] pause-on-agent-send failed:', pauseErr.message);
      }
    } catch (err) {
      console.error(
        '[flows] pause-on-agent-send threw:',
        err instanceof Error ? err.message : err
      );
    }
  }

  return { messageId: messageRecord.id, whatsappMessageId: waMessageId };
}
