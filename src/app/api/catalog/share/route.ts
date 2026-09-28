import { NextResponse } from 'next/server';

import {
  loadCatalogCandidatesByIds,
  sendCatalogCandidates,
} from '@/lib/ai/catalog';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  SendMessageError,
  sendMessageToConversation,
} from '@/lib/whatsapp/send-message';
import {
  SocialSendError,
  sendSocialMessageToConversation,
} from '@/lib/meta/send-message';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ShareRequest {
  conversationId?: unknown;
  itemIds?: unknown;
  introductionText?: unknown;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `catalog-share:${ctx.userId}`,
      RATE_LIMITS.send
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request
      .json()
      .catch(() => null)) as ShareRequest | null;
    const conversationId =
      typeof body?.conversationId === 'string'
        ? body.conversationId.trim()
        : '';
    const introductionText =
      typeof body?.introductionText === 'string'
        ? body.introductionText.trim()
        : '';
    const itemIds = Array.isArray(body?.itemIds)
      ? [
          ...new Set(
            body.itemIds.filter(
              (itemId): itemId is string =>
                typeof itemId === 'string' && UUID_PATTERN.test(itemId)
            )
          ),
        ].slice(0, 5)
      : [];

    if (!UUID_PATTERN.test(conversationId)) {
      return NextResponse.json(
        { error: 'La conversación no es válida.' },
        { status: 400 }
      );
    }
    if (!introductionText || introductionText.length > 2000) {
      return NextResponse.json(
        {
          error: 'Escribe un mensaje introductorio de hasta 2.000 caracteres.',
        },
        { status: 400 }
      );
    }
    if (itemIds.length === 0) {
      return NextResponse.json(
        { error: 'Selecciona al menos un vehículo.' },
        { status: 400 }
      );
    }

    const { data: canOperate, error: permissionError } = await ctx.supabase.rpc(
      'can_operate_ticket',
      {
        target_conversation_id: conversationId,
      }
    );
    if (permissionError || !canOperate) {
      return NextResponse.json(
        {
          error:
            'Solo puedes enviar vehículos en conversaciones que tienes permiso para atender.',
        },
        { status: 403 }
      );
    }

    // This read uses the caller's RLS session. An agent can only share a
    // catalog item into a ticket they are already allowed to operate.
    const { data: conversation, error: conversationError } = await ctx.supabase
      .from('conversations')
      .select(
        'id, contact_id, whatsapp_config_id, channel_connection_id, channel'
      )
      .eq('id', conversationId)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: 'No tienes acceso a esta conversación.' },
        { status: 404 }
      );
    }
    if (
      conversation.channel !== 'whatsapp' &&
      conversation.channel !== 'facebook' &&
      conversation.channel !== 'instagram'
    ) {
      return NextResponse.json(
        {
          error: 'Este canal no admite el envío visual del catálogo.',
        },
        { status: 400 }
      );
    }
    if (
      (conversation.channel === 'whatsapp' &&
        !conversation.whatsapp_config_id) ||
      (conversation.channel !== 'whatsapp' &&
        !conversation.channel_connection_id)
    ) {
      return NextResponse.json(
        { error: 'Esta conversación no tiene una conexión activa.' },
        { status: 409 }
      );
    }

    const db = supabaseAdmin();
    const candidates = await loadCatalogCandidatesByIds(
      db,
      ctx.accountId,
      itemIds
    );
    if (candidates.length !== itemIds.length) {
      return NextResponse.json(
        {
          error:
            'Una de las unidades ya no está aprobada, disponible o habilitada para compartir.',
        },
        { status: 409 }
      );
    }

    const recentThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentIntro } = await db
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('content_type', 'text')
      .eq('content_text', introductionText)
      .in('sender_type', ['agent', 'bot'])
      .gte('created_at', recentThreshold)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const intro = recentIntro
      ? { messageId: recentIntro.id }
      : conversation.channel === 'whatsapp'
        ? await sendMessageToConversation(db, ctx.accountId, {
            conversationId,
            messageType: 'text',
            contentText: introductionText,
            senderType: 'agent',
            senderId: ctx.userId,
            pauseFlows: true,
          })
        : await sendSocialMessageToConversation(db, ctx.accountId, {
            conversationId,
            messageType: 'text',
            contentText: introductionText,
            senderType: 'agent',
            senderId: ctx.userId,
          });
    const result = await sendCatalogCandidates({
      db,
      accountId: ctx.accountId,
      conversationId,
      contactId: conversation.contact_id,
      actorUserId: ctx.userId,
      channel: conversation.channel,
      whatsappConfigId: conversation.whatsapp_config_id,
      channelConnectionId: conversation.channel_connection_id,
      introductionText,
      introMessageId: intro.messageId,
      candidates,
      senderType: 'agent',
      source: 'manual',
    });

    if (result.sent === 0) {
      return NextResponse.json(
        {
          error:
            'El mensaje introductorio se envió, pero no se pudieron enviar las fichas seleccionadas.',
          ...result,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SendMessageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof SocialSendError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return toErrorResponse(error);
  }
}
