import { NextResponse } from 'next/server';

import { loadAiConfig } from '@/lib/ai/config';
import { buildConversationContext } from '@/lib/ai/context';
import { generateAgentReply } from '@/lib/ai/orchestrator';
import {
  finalizeAiPoints,
  releaseAiPointsQuietly,
  reserveAiPoints,
} from '@/lib/ai/points/service';
import { AiError } from '@/lib/ai/types';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Generate a tenant-scoped suggestion. It never sends the message. */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const userLimit = checkRateLimit(`ai-draft:${userId}`, RATE_LIMITS.aiDraft);
    if (!userLimit.success) return rateLimitResponse(userLimit);
    const accountLimit = checkRateLimit(
      `ai-draft-acct:${accountId}`,
      RATE_LIMITS.aiDraftAccount
    );
    if (!accountLimit.success) return rateLimitResponse(accountLimit);

    const body = await request.json().catch(() => null);
    const conversationId =
      typeof body?.conversation_id === 'string' ? body.conversation_id : '';
    const requestId =
      typeof body?.request_id === 'string' ? body.request_id : '';
    if (!conversationId || !UUID_PATTERN.test(requestId)) {
      return NextResponse.json(
        { error: 'conversation_id y request_id son obligatorios.' },
        { status: 400 }
      );
    }

    // RLS plus the explicit account relation prevent cross-company context.
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select(
        'id, account_id, contact_id, whatsapp_config_id, channel_connection_id'
      )
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversación no encontrada.' },
        { status: 404 }
      );
    }

    const config = await loadAiConfig(supabase, accountId).catch((error) => {
      console.error('[ai/draft] load config error:', error);
      throw new AiError('No se pudo cargar la configuración protegida.', {
        code: 'key_decrypt_failed',
        status: 400,
      });
    });
    if (!config) {
      return NextResponse.json(
        {
          error: 'El Agente IA no está activo para esta empresa.',
          code: 'ai_not_configured',
        },
        { status: 400 }
      );
    }
    if (!config.permissions.generate_suggestions) {
      return NextResponse.json(
        {
          error: 'Las sugerencias de IA están desactivadas para esta empresa.',
          code: 'ai_suggestions_disabled',
        },
        { status: 403 }
      );
    }

    const { data: allowedConnections, error: connectionsError } = await supabase
      .from('ai_agent_connections')
      .select('whatsapp_config_id, channel_connection_id')
      .eq('account_id', accountId)
      .eq('ai_config_id', config.id)
      .eq('is_enabled', true);
    if (connectionsError) throw connectionsError;
    // Empty means "all current company connections" for backward
    // compatibility. Once an admin selects any, it becomes an allow-list.
    if (allowedConnections?.length) {
      const allowed = allowedConnections.some(
        (connection) =>
          (conversation.whatsapp_config_id &&
            connection.whatsapp_config_id ===
              conversation.whatsapp_config_id) ||
          (conversation.channel_connection_id &&
            connection.channel_connection_id ===
              conversation.channel_connection_id)
      );
      if (!allowed) {
        return NextResponse.json(
          {
            error:
              'El Agente IA no está habilitado para la conexión de esta conversación.',
            code: 'ai_connection_disabled',
          },
          { status: 403 }
        );
      }
    }

    const messages = await buildConversationContext(supabase, conversationId);
    if (!messages.length) {
      return NextResponse.json(
        {
          error: 'Todavía no hay mensajes para preparar una sugerencia.',
          code: 'no_messages',
        },
        { status: 400 }
      );
    }

    const reservation = await reserveAiPoints({
      accountId,
      action: 'suggested_reply',
      idempotencyKey: `draft:${requestId}`,
      actorUserId: userId,
      aiConfigId: config.id,
      conversationId,
      contactId: conversation.contact_id,
      whatsappConfigId: conversation.whatsapp_config_id,
      channelConnectionId: conversation.channel_connection_id,
      metadata: { surface: 'inbox_draft' },
    });

    let providerCompleted = false;
    try {
      const result = await generateAgentReply({
        db: supabase,
        accountId,
        config,
        messages,
        mode: 'draft',
        conversationId,
        contactId: conversation.contact_id,
      });
      providerCompleted = true;
      await finalizeAiPoints(reservation.operationId, {
        metadata: {
          outcome: 'reply_generated',
          catalog_candidates: result.catalogMatches.length,
        },
      });
      return NextResponse.json({
        draft: result.text,
        points_used: reservation.points,
        catalog_matches: result.catalogMatches,
        warnings: result.warnings,
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
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return toErrorResponse(error);
  }
}
