import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  generatePlatformSupportReply,
  shouldForceEscalation,
} from '@/lib/platform-support/assistant';
import { buildSupportAccountContext } from '@/lib/platform-support/context';
import { retrievePlatformSupportKnowledge } from '@/lib/platform-support/knowledge';
import {
  redactSecrets,
  safeInternalPath,
  supportRouteForMessage,
} from '@/lib/platform-support/security';

export const dynamic = 'force-dynamic';

function priorityFor(message: string): 'low' | 'normal' | 'high' | 'urgent' {
  const value = message.toLowerCase();
  if (/seguridad|hack|robo|p[eé]rdida de datos/.test(value)) return 'urgent';
  if (/factur|cobro|pago|no funciona|ca[ií]do/.test(value)) return 'high';
  return 'normal';
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('viewer');
    const userLimit = checkRateLimit(
      `support:user:${ctx.userId}`,
      RATE_LIMITS.platformSupportUser
    );
    if (!userLimit.success) return rateLimitResponse(userLimit);
    const accountLimit = checkRateLimit(
      `support:account:${ctx.accountId}`,
      RATE_LIMITS.platformSupportAccount
    );
    if (!accountLimit.success) return rateLimitResponse(accountLimit);

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const message = redactSecrets(
      typeof body?.message === 'string' ? body.message.trim() : ''
    );
    const requestedConversationId =
      typeof body?.conversationId === 'string' ? body.conversationId : null;
    const currentPath = safeInternalPath(body?.currentPath) ?? '/dashboard';
    if (!message || message.length > 4000) {
      return NextResponse.json(
        { error: 'Escribe un mensaje de hasta 4.000 caracteres.' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    let conversationId = requestedConversationId;
    if (conversationId) {
      const { data: existing, error } = await admin
        .from('platform_support_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', ctx.userId)
        .eq('account_id', ctx.accountId)
        .maybeSingle();
      if (error) throw error;
      if (!existing)
        return NextResponse.json(
          { error: 'Conversación no encontrada.' },
          { status: 404 }
        );
    } else {
      const { data: created, error } = await admin
        .from('platform_support_conversations')
        .insert({
          user_id: ctx.userId,
          account_id: ctx.accountId,
          current_path: currentPath,
        })
        .select('id')
        .single();
      if (error) throw error;
      conversationId = created.id;
    }

    const { error: userMessageError } = await admin
      .from('platform_support_messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'user',
        sender_user_id: ctx.userId,
        content: message,
        metadata: { current_path: currentPath },
      });
    if (userMessageError) throw userMessageError;

    const [supportContext, knowledge, historyResult] = await Promise.all([
      buildSupportAccountContext(admin, ctx, currentPath),
      retrievePlatformSupportKnowledge(admin, message, 5),
      admin
        .from('platform_support_messages')
        .select('sender_type, content')
        .eq('conversation_id', conversationId)
        .in('sender_type', ['user', 'assistant'])
        .order('created_at', { ascending: false })
        .limit(14),
    ]);
    if (historyResult.error) throw historyResult.error;

    await admin.from('platform_support_tool_audit').insert({
      conversation_id: conversationId,
      user_id: ctx.userId,
      account_id: ctx.accountId,
      tool_name: 'account_context_snapshot',
      input_summary: { current_path: currentPath },
      result_summary: {
        connection_count: supportContext.connections.length,
        recent_error_count: supportContext.recentErrors.length,
        plan: supportContext.account.plan,
      },
      success: true,
    });
    await admin.from('platform_support_tool_audit').insert({
      conversation_id: conversationId,
      user_id: ctx.userId,
      account_id: ctx.accountId,
      tool_name: 'published_support_knowledge_search',
      input_summary: { query_length: message.length },
      result_summary: { matches: knowledge.length },
      success: true,
    });

    const history = [...(historyResult.data ?? [])].reverse().map((row) => ({
      role:
        row.sender_type === 'assistant'
          ? ('assistant' as const)
          : ('user' as const),
      content: redactSecrets(row.content),
    }));
    const repeatedProblem =
      history.filter(
        (item) =>
          item.role === 'user' &&
          /sigue|a[uú]n|todav[ií]a|otra vez|no funcion[oó]/i.test(item.content)
      ).length >= 2;
    const generated = await generatePlatformSupportReply({
      admin,
      context: supportContext,
      knowledge: knowledge.map((item) => `${item.title}: ${item.content}`),
      messages: history,
      forceEscalation: shouldForceEscalation(message, repeatedProblem),
    });

    let ticketId: string | null = null;
    if (generated.shouldEscalate) {
      const { data: existingTicket } = await admin
        .from('platform_support_tickets')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (existingTicket) ticketId = existingTicket.id;
      else {
        const { data: ticket, error: ticketError } = await admin
          .from('platform_support_tickets')
          .insert({
            conversation_id: conversationId,
            user_id: ctx.userId,
            account_id: ctx.accountId,
            title: message.slice(0, 120),
            summary: `El usuario solicita ayuda con: ${message}`.slice(0, 1000),
            attempted_steps: history
              .filter((item) => item.role === 'assistant')
              .slice(-3)
              .map((item) => item.content.slice(0, 500)),
            technical_context: {
              current_path: currentPath,
              connections: supportContext.connections,
              recent_errors: supportContext.recentErrors,
            },
            current_path: currentPath,
            priority: priorityFor(message),
          })
          .select('id')
          .single();
        if (ticketError) throw ticketError;
        ticketId = ticket.id;
        await admin.from('platform_support_tool_audit').insert({
          conversation_id: conversationId,
          user_id: ctx.userId,
          account_id: ctx.accountId,
          tool_name: 'create_support_case',
          input_summary: {
            priority: priorityFor(message),
            current_path: currentPath,
          },
          result_summary: { ticket_id: ticketId },
          success: true,
        });
      }
      await admin
        .from('platform_support_conversations')
        .update({
          status: 'escalated',
          escalated_at: new Date().toISOString(),
          current_path: currentPath,
        })
        .eq('id', conversationId);
    } else {
      await admin
        .from('platform_support_conversations')
        .update({ current_path: currentPath })
        .eq('id', conversationId);
    }

    const suggestedRoute = supportRouteForMessage(message);
    const assistantText = generated.shouldEscalate
      ? `${generated.text}\n\nNo pude resolver completamente este inconveniente. Puedo enviar el caso al equipo de Nexora o ayudarte a agendar una reunión.`
      : generated.text;
    const { data: assistantMessage, error: assistantError } = await admin
      .from('platform_support_messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'assistant',
        content: assistantText,
        metadata: {
          state: generated.shouldEscalate
            ? 'needs_intervention'
            : 'solution_proposed',
          confidence: generated.confidence,
          sources: knowledge.map((item) => ({
            id: item.document_id,
            title: item.title,
          })),
          suggested_route: suggestedRoute,
          ticket_id: ticketId,
        },
      })
      .select('id, sender_type, content, metadata, created_at')
      .single();
    if (assistantError) throw assistantError;

    return NextResponse.json({
      conversationId,
      message: assistantMessage,
      escalated: generated.shouldEscalate,
      ticketId,
      suggestedRoute,
      canBookMeeting: generated.shouldEscalate,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'PLATFORM_SUPPORT_AI_NOT_CONFIGURED'
    ) {
      return NextResponse.json(
        {
          error:
            'Nexora Asistente todavía no está habilitado por el creador de la plataforma.',
        },
        { status: 503 }
      );
    }
    return toErrorResponse(error);
  }
}
