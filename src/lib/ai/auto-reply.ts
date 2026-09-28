import { supabaseAdmin } from './admin-client';
import { loadAiConfig } from './config';
import { buildConversationContext } from './context';
import { generateAgentReply } from './orchestrator';
import { loadCatalogCandidatesByIds, sendCatalogCandidates } from './catalog';
import { sendSocialMessageToConversation } from '@/lib/meta/send-message';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import {
  finalizeAiPoints,
  releaseAiPointsQuietly,
  reserveAiPoints,
} from './points/service';
import {
  MAX_GENERATED_AUDIO_DURATION_MS,
  synthesizeOpenAiSpeech,
  uploadAiVoiceNote,
} from './audio';
import { AiError, type AiConfig, type LeadProfilePatch } from './types';
import { saveConversationLeadProfile } from './lead-profile';

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string;
  conversationId: string;
  contactId: string;
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string;
  /** Stable provider-side identifier of the inbound message. */
  sourceMessageExternalId: string;
}

interface ConversationTransport {
  channel_connection_id: string | null;
}

async function sendAutomaticMessage(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversation: ConversationTransport,
  input: {
    conversationId: string;
    messageType: 'text' | 'audio';
    contentText: string;
    mediaUrl?: string | null;
  }
): Promise<{ messageId: string }> {
  if (conversation.channel_connection_id) {
    return sendSocialMessageToConversation(db, accountId, {
      conversationId: input.conversationId,
      messageType: 'text',
      contentText: input.contentText,
      senderType: 'bot',
    });
  }
  return sendMessageToConversation(db, accountId, {
    conversationId: input.conversationId,
    messageType: input.messageType,
    contentText: input.contentText,
    mediaUrl: input.mediaUrl,
    senderType: 'bot',
    pauseFlows: false,
  });
}

function normalizeIntentText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

function explicitlyRequestsHuman(message: string): boolean {
  return /\b(humano|persona|ejecutivo|ejecutiva|asesor|asesora|vendedor|vendedora)\b/.test(
    normalizeIntentText(message)
  );
}

function catalogDeliveryIntroduction(language: AiConfig['language']): string {
  if (language === 'en') {
    return 'Of course. I am sending you the available vehicle photos and details now.';
  }
  if (language === 'pt-BR') {
    return 'Claro. Estou enviando agora as fotos e os detalhes dos veículos disponíveis.';
  }
  return 'Claro. Te envío ahora las fotos y los detalles de los vehículos disponibles.';
}

async function prepareAudioReply(args: {
  db: ReturnType<typeof supabaseAdmin>;
  config: AiConfig;
  accountId: string;
  conversationId: string;
  contactId: string;
  actorUserId: string;
  sourceMessageExternalId: string;
  sourceMessageId: string | null;
  whatsappConfigId: string | null;
  channelConnectionId: string | null;
  text: string;
}): Promise<string | null> {
  let reservation;
  try {
    reservation = await reserveAiPoints({
      accountId: args.accountId,
      action: 'audio_generation',
      idempotencyKey: `audio-reply:${args.sourceMessageExternalId}`,
      actorUserId: args.actorUserId,
      estimatedDurationMs: MAX_GENERATED_AUDIO_DURATION_MS,
      aiConfigId: args.config.id,
      conversationId: args.conversationId,
      contactId: args.contactId,
      whatsappConfigId: args.whatsappConfigId,
      channelConnectionId: args.channelConnectionId,
      sourceMessageId: args.sourceMessageId,
      metadata: { surface: 'automatic_audio_reply' },
    });
  } catch (error) {
    console.error('[ai auto-reply] audio points were not authorized:', error);
    return null;
  }

  let speechCompleted = false;
  let actualDurationMs = MAX_GENERATED_AUDIO_DURATION_MS;
  try {
    const speech = await synthesizeOpenAiSpeech({
      config: args.config,
      text: args.text,
    });
    speechCompleted = true;
    actualDurationMs = speech.durationMs;
    const publicUrl = await uploadAiVoiceNote(
      args.db,
      args.accountId,
      speech.buffer
    );
    await finalizeAiPoints(reservation.operationId, {
      actualDurationMs: speech.durationMs,
      metadata: { outcome: 'audio_generated' },
    });
    return publicUrl;
  } catch (error) {
    if (speechCompleted) {
      try {
        await finalizeAiPoints(reservation.operationId, {
          actualDurationMs,
          metadata: { outcome: 'audio_generated_but_not_prepared' },
        });
      } catch (finalizeError) {
        console.error(
          '[ai auto-reply] failed to finalize completed speech generation:',
          finalizeError
        );
      }
    } else {
      await releaseAiPointsQuietly(
        reservation.operationId,
        'audio_generation_failed'
      );
    }
    console.error('[ai auto-reply] audio preparation failed:', error);
    return null;
  }
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff)
 *   - the per-conversation reply cap is reached
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs
): Promise<void> {
  const {
    accountId,
    conversationId,
    contactId,
    configOwnerUserId,
    sourceMessageExternalId,
  } = args;

  try {
    const db = supabaseAdmin();

    const config = await loadAiConfig(db, accountId);
    if (
      !config ||
      !config.autoReplyEnabled ||
      config.operatingMode !== 'automatic'
    ) {
      return;
    }

    // Deterministic, user-configured responders win over the LLM — the
    // caller already excludes messages a Flow consumed. Message-level
    // automations (`new_message_received` / `keyword_match`) are
    // dispatched independently for this same inbound and may send their
    // own reply, so if the account has any active one we stand down to
    // avoid double-texting the customer. (Relationship triggers like
    // `first_inbound_message` don't count — they're not per-message
    // auto-responders.)
    const { data: autoResponders } = await db
      .from('automations')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .in('trigger_type', ['new_message_received', 'keyword_match'])
      .limit(1);
    if (autoResponders && autoResponders.length > 0) return;

    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select(
        'assigned_agent_id, ai_autoreply_disabled, ai_reply_count, ai_state, human_requested_at, whatsapp_config_id, channel_connection_id, channel'
      )
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (convErr || !conv) return;
    if (conv.ai_autoreply_disabled) return; // handed off / turned off here
    if (conv.human_requested_at) return;

    let coverageMode: 'manual' | 'after_hours' | null = null;
    if (conv.assigned_agent_id) {
      if (conv.ai_state === 'ai_active' && config.manualAiDelegationEnabled) {
        coverageMode = 'manual';
      } else if (
        config.afterHoursCoverageEnabled &&
        config.afterHoursBehavior === 'automatic'
      ) {
        const { data: unavailable, error: availabilityError } = await db.rpc(
          'is_user_unavailable_for_ai',
          {
            p_account_id: accountId,
            p_user_id: conv.assigned_agent_id,
            p_at: new Date().toISOString(),
          }
        );
        if (availabilityError || unavailable !== true) return;
        if (config.afterHoursScope === 'selected') {
          const { data: coveredUser, error: coveredUserError } = await db
            .from('ai_after_hours_users')
            .select('user_id')
            .eq('account_id', accountId)
            .eq('ai_config_id', config.id)
            .eq('user_id', conv.assigned_agent_id)
            .maybeSingle();
          if (coveredUserError || !coveredUser) return;
        }
        coverageMode = 'after_hours';
      } else {
        return;
      }
    }
    // Cheap early-out; the authoritative cap check is the atomic claim
    // below (this read can race a concurrent inbound).
    if (
      !coverageMode &&
      config.autoReplyMaxPerConversation !== null &&
      conv.ai_reply_count >= config.autoReplyMaxPerConversation
    ) {
      return;
    }

    const { data: allowedConnections } = await db
      .from('ai_agent_connections')
      .select('whatsapp_config_id, channel_connection_id')
      .eq('account_id', accountId)
      .eq('ai_config_id', config.id)
      .eq('is_enabled', true);
    if (
      allowedConnections?.length &&
      !allowedConnections.some(
        (connection) =>
          (conv.whatsapp_config_id &&
            connection.whatsapp_config_id === conv.whatsapp_config_id) ||
          (conv.channel_connection_id &&
            connection.channel_connection_id === conv.channel_connection_id)
      )
    ) {
      return;
    }

    const messages = await buildConversationContext(db, conversationId);
    if (messages.length === 0) return;

    const { data: sourceMessage } = await db
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('message_id', sourceMessageExternalId)
      .maybeSingle();

    let reservation;
    try {
      reservation = await reserveAiPoints({
        accountId,
        action: 'automatic_text_reply',
        idempotencyKey: `automatic:${sourceMessageExternalId}`,
        actorUserId: configOwnerUserId,
        aiConfigId: config.id,
        conversationId,
        contactId,
        whatsappConfigId: conv.whatsapp_config_id,
        channelConnectionId: conv.channel_connection_id,
        sourceMessageId: sourceMessage?.id ?? null,
        metadata: {
          surface:
            coverageMode === 'after_hours'
              ? 'after_hours_coverage'
              : coverageMode === 'manual'
                ? 'manual_ai_delegation'
                : 'inbound_auto_reply',
        },
      });
    } catch (error) {
      if (
        coverageMode === 'after_hours' &&
        error instanceof AiError &&
        error.code === 'ai_insufficient_points'
      ) {
        const staticMessage = config.outOfHoursMessage.trim();
        if (
          config.afterHoursNoPointsBehavior === 'static_message' &&
          staticMessage
        ) {
          await sendAutomaticMessage(db, accountId, conv, {
            conversationId,
            messageType: 'text',
            contentText: staticMessage,
          });
        }
        await db
          .from('conversations')
          .update({
            ai_state: 'waiting_for_human',
            ai_autoreply_disabled: true,
            ai_pause_reason: 'insufficient_points',
            ai_paused_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
          .eq('account_id', accountId);
        await db.from('ticket_events').insert({
          account_id: accountId,
          conversation_id: conversationId,
          event_type: 'ai_no_points',
          metadata: { behavior: config.afterHoursNoPointsBehavior },
        });
        return;
      }
      throw error;
    }

    // Claim the per-conversation slot before paying the provider. The point
    // reservation is released if another inbound already took the last slot.
    const { data: claimed, error: claimErr } = coverageMode
      ? await db.rpc('claim_ai_coverage_reply_slot', {
          p_conversation_id: conversationId,
          p_mode: coverageMode,
          p_max_replies: config.autoReplyMaxPerConversation,
        })
      : await db.rpc('claim_ai_reply_slot', {
          conversation_id: conversationId,
          max_replies: config.autoReplyMaxPerConversation,
        });
    if (claimErr || claimed !== true) {
      await releaseAiPointsQuietly(
        reservation.operationId,
        claimErr ? 'reply_slot_claim_failed' : 'reply_limit_reached'
      );
      if (
        !claimErr &&
        coverageMode === 'after_hours' &&
        config.afterHoursNoPointsBehavior === 'static_message' &&
        config.outOfHoursMessage.trim()
      ) {
        const { data: stoppedConversation } = await db
          .from('conversations')
          .select('ai_pause_reason')
          .eq('id', conversationId)
          .eq('account_id', accountId)
          .maybeSingle();
        if (stoppedConversation?.ai_pause_reason === 'coverage_points_limit') {
          await sendAutomaticMessage(db, accountId, conv, {
            conversationId,
            messageType: 'text',
            contentText: config.outOfHoursMessage.trim(),
          });
        }
      }
      return;
    }

    let providerCompleted = false;
    let text = '';
    let handoff = false;
    let replyMode: 'text' | 'audio' = 'text';
    let catalogMatches: Array<{ id: string; label: string }> = [];
    let leadProfilePatch: LeadProfilePatch = {};
    try {
      const runtimeConfig = coverageMode
        ? {
            ...config,
            additionalInstructions: [
              config.additionalInstructions,
              'Estás cubriendo temporalmente una conversación asignada a un ejecutivo humano.',
              'Preséntate siempre como el asistente virtual de la empresa. Nunca te hagas pasar por el ejecutivo asignado ni digas que eres esa persona.',
              'Resuelve lo que puedas con la información autorizada y deriva solo cuando sea realmente necesario o el cliente pida una persona.',
            ]
              .filter(Boolean)
              .join('\n'),
          }
        : config;
      const result = await generateAgentReply({
        db,
        accountId,
        config: runtimeConfig,
        messages,
        mode: 'auto_reply',
        conversationId,
        contactId,
      });
      text = result.text;
      handoff = result.handoff;
      replyMode = result.replyMode;
      catalogMatches = result.catalogMatches;
      leadProfilePatch = result.leadProfilePatch ?? {};

      // A valid catalog match is actionable by Nexora itself. Do not hand the
      // customer to a person merely because the model failed to realize the
      // matching vehicle cards (including their real photos) are sent next.
      // An explicit request to speak with a person still takes precedence.
      const latestCustomerMessage =
        [...messages].reverse().find((message) => message.role === 'user')
          ?.content ?? '';
      const catalogDeliveryReady =
        config.catalogAiAutoSend &&
        catalogMatches.length > 0 &&
        Boolean(conv.whatsapp_config_id || conv.channel_connection_id);
      if (
        catalogDeliveryReady &&
        !explicitlyRequestsHuman(latestCustomerMessage) &&
        (handoff || !text.trim())
      ) {
        handoff = false;
        replyMode = 'text';
        text = catalogDeliveryIntroduction(config.language);
      }

      providerCompleted = true;
      await finalizeAiPoints(reservation.operationId, {
        metadata: {
          outcome: handoff ? 'handoff' : 'reply_generated',
          catalog_candidates: result.catalogMatches.length,
        },
      });
    } catch (error) {
      if (!providerCompleted) {
        await releaseAiPointsQuietly(
          reservation.operationId,
          'provider_request_failed'
        );
      }
      throw error;
    }

    if (
      config.permissions.classify_leads &&
      Object.keys(leadProfilePatch).length > 0
    ) {
      try {
        await saveConversationLeadProfile({
          db,
          accountId,
          conversationId,
          contactId,
          sourceMessageId: sourceMessage?.id ?? null,
          patch: leadProfilePatch,
        });
      } catch (error) {
        // Capturing the profile must never prevent a valid customer reply.
        console.error('[ai auto-reply] lead profile save failed:', error);
      }
    }

    if (handoff || !text) {
      // Never leave the customer in silence when the model requests a human.
      // The prompt asks for a short transition sentence, while this localized
      // fallback also covers older/custom prompts that emit only the marker.
      const handoffText =
        text ||
        (config.language === 'en'
          ? 'Thanks. I will ask a team member to continue with you here.'
          : config.language === 'pt-BR'
            ? 'Obrigado. Vou pedir para alguém da equipe continuar com você por aqui.'
            : 'Gracias. Voy a pedir apoyo a un ejecutivo para continuar contigo por aquí.');
      await sendAutomaticMessage(db, accountId, conv, {
        conversationId,
        messageType: 'text',
        contentText: handoffText,
      });

      await db
        .from('conversations')
        .update({
          ai_autoreply_disabled: true,
          ai_state: 'waiting_for_human',
          ai_pause_reason: 'handoff',
          ai_paused_at: new Date().toISOString(),
          human_requested_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('account_id', accountId);
      await db.from('ticket_events').insert({
        account_id: accountId,
        conversation_id: conversationId,
        event_type: 'ai_waiting_human',
        note: 'La IA solicitó apoyo del equipo.',
        metadata: { reason: 'handoff' },
      });
      return;
    }

    let audioUrl: string | null = null;
    if (
      replyMode === 'audio' &&
      config.audioEnabled &&
      config.permissions.generate_audio &&
      config.provider === 'openai' &&
      !conv.channel_connection_id
    ) {
      audioUrl = await prepareAudioReply({
        db,
        config,
        accountId,
        conversationId,
        contactId,
        actorUserId: configOwnerUserId,
        sourceMessageExternalId,
        sourceMessageId: sourceMessage?.id ?? null,
        whatsappConfigId: conv.whatsapp_config_id,
        channelConnectionId: conv.channel_connection_id,
        text,
      });
    }

    const sentReply = await sendAutomaticMessage(db, accountId, conv, {
      conversationId,
      messageType: audioUrl ? 'audio' : 'text',
      contentText: text,
      mediaUrl: audioUrl,
    });

    await db
      .from('conversations')
      .update({
        ai_state:
          coverageMode === 'after_hours'
            ? 'ai_after_hours'
            : coverageMode === 'manual'
              ? 'ai_active'
              : 'idle',
        last_ai_reply_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('account_id', accountId);

    if (
      config.catalogAiAutoSend &&
      catalogMatches.length > 0 &&
      (conv.whatsapp_config_id || conv.channel_connection_id)
    ) {
      try {
        // Re-read immediately before dispatch. A unit hidden, sold or
        // unapproved during generation is therefore never sent.
        const candidates = await loadCatalogCandidatesByIds(
          db,
          accountId,
          catalogMatches.map((candidate) => candidate.id)
        );
        if (candidates.length > 0) {
          await sendCatalogCandidates({
            db,
            accountId,
            conversationId,
            contactId,
            actorUserId: configOwnerUserId,
            channel:
              conv.channel === 'facebook' || conv.channel === 'instagram'
                ? conv.channel
                : 'whatsapp',
            whatsappConfigId: conv.whatsapp_config_id,
            channelConnectionId: conv.channel_connection_id,
            introductionText: text,
            introMessageId: sentReply.messageId,
            candidates,
            senderType: 'bot',
            source: 'nexora_ai',
          });
        }
      } catch (error) {
        // The introductory AI reply has already been delivered. Do not
        // duplicate it if one of the catalog cards fails.
        console.error('[ai auto-reply] catalog dispatch failed:', error);
      }
    }
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err);
  }
}
