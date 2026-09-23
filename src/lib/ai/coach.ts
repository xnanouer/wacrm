import 'server-only';

import { supabaseAdmin } from '@/lib/ai/admin-client';
import { loadAiConfig } from '@/lib/ai/config';
import { generateReply } from '@/lib/ai/generate';
import {
  finalizeAiPoints,
  releaseAiPointsQuietly,
  reserveAiPoints,
} from '@/lib/ai/points/service';

export type CoachingTrigger = 'ticket_closed' | 'manual';

export interface CoachingReview {
  id: string;
  account_id: string;
  conversation_id: string;
  conversation_closed_at: string;
  agent_user_id: string;
  triggered_by_user_id: string | null;
  trigger_type: CoachingTrigger;
  status: 'processing' | 'completed' | 'failed';
  contact_name: string | null;
  summary: string | null;
  strengths: string[];
  improvements: string[];
  next_actions: string[];
  scores: Record<string, number>;
  overall_score: number | null;
  analyzed_message_count: number;
  provider: string | null;
  model: string | null;
  point_operation_id: string | null;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
}

export type CoachingAnalysisResult =
  | { status: 'completed'; review: CoachingReview }
  | { status: 'existing'; review: CoachingReview }
  | {
      status: 'skipped';
      reason:
        | 'disabled'
        | 'not_closed'
        | 'ai_in_control'
        | 'unassigned'
        | 'insufficient_human_messages'
        | 'ai_unavailable';
    };

interface CoachingPayload {
  summary: string;
  strengths: string[];
  improvements: string[];
  next_actions: string[];
  scores: Record<string, number>;
  overall_score: number;
}

function cleanText(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 300))
    .filter(Boolean)
    .slice(0, 5);
}

function score(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function parseCoachingPayload(raw: string): CoachingPayload {
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('coach_invalid_json');
  }

  const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as Record<
    string,
    unknown
  >;
  const rawScores =
    parsed.scores && typeof parsed.scores === 'object'
      ? (parsed.scores as Record<string, unknown>)
      : {};
  const scores = {
    claridad: score(rawScores.claridad),
    empatia: score(rawScores.empatia),
    descubrimiento: score(rawScores.descubrimiento),
    seguimiento: score(rawScores.seguimiento),
    orientacion_comercial: score(rawScores.orientacion_comercial),
  };
  const overallScore = score(parsed.overall_score);
  const summary = cleanText(parsed.summary, 900);
  if (!summary) throw new Error('coach_missing_summary');

  return {
    summary,
    strengths: cleanList(parsed.strengths),
    improvements: cleanList(parsed.improvements),
    next_actions: cleanList(parsed.next_actions),
    scores,
    overall_score: overallScore,
  };
}

function coachingPrompt(agentName: string, industry: string): string {
  return [
    'Eres Coach IA Nexora, especialista en calidad de atencion y ventas.',
    `Evalua exclusivamente el trabajo humano de ${agentName}.`,
    industry ? `El rubro de la empresa es: ${industry}.` : '',
    'Los mensajes del bot ya fueron excluidos y no deben atribuirse al ejecutivo.',
    'Entrega retroalimentacion constructiva, concreta y respetuosa. No hagas inferencias personales, medicas, legales ni disciplinarias.',
    'No repitas RUT, telefonos, correos ni otros datos sensibles del cliente.',
    'Evalua claridad, empatia, descubrimiento de necesidad, seguimiento y orientacion comercial.',
    'Responde SOLAMENTE con JSON valido, sin markdown, usando esta estructura exacta:',
    '{"summary":"resumen breve","strengths":["fortaleza"],"improvements":["mejora concreta"],"next_actions":["accion aplicable"],"scores":{"claridad":0,"empatia":0,"descubrimiento":0,"seguimiento":0,"orientacion_comercial":0},"overall_score":0}',
  ]
    .filter(Boolean)
    .join('\n');
}

async function notifyReviewReady(args: {
  accountId: string;
  conversationId: string;
  contactId: string | null;
  reviewId: string;
  agentUserId: string;
  agentName: string;
  summary: string;
  notifyAgent: boolean;
  notifyAdmins: boolean;
}) {
  const admin = supabaseAdmin();
  const recipients = new Map<string, { title: string; body: string }>();

  if (args.notifyAgent) {
    recipients.set(args.agentUserId, {
      title: 'Tu Coach IA tiene una nueva recomendacion',
      body: args.summary,
    });
  }

  if (args.notifyAdmins) {
    const { data: managers, error } = await admin
      .from('profiles')
      .select('user_id')
      .eq('account_id', args.accountId)
      .in('account_role', ['owner', 'admin', 'supervisor']);
    if (error) throw error;
    for (const manager of managers ?? []) {
      recipients.set(manager.user_id, {
        title: `Nueva recomendacion para ${args.agentName}`,
        body: args.summary,
      });
    }
  }

  if (recipients.size === 0) return;
  const { error } = await admin.from('notifications').insert(
    Array.from(recipients, ([userId, copy]) => ({
      account_id: args.accountId,
      user_id: userId,
      type: 'ai_coaching_ready',
      conversation_id: args.conversationId,
      contact_id: args.contactId,
      coaching_review_id: args.reviewId,
      title: copy.title,
      body: copy.body,
    }))
  );
  if (error) throw error;
}

export async function analyzeHumanConversation(args: {
  accountId: string;
  conversationId: string;
  triggeredByUserId?: string | null;
  triggerType?: CoachingTrigger;
}): Promise<CoachingAnalysisResult> {
  const admin = supabaseAdmin();
  const triggerType = args.triggerType ?? 'ticket_closed';

  const [{ data: settings, error: settingsError }, conversationResult] =
    await Promise.all([
      admin
        .from('ai_coaching_settings')
        .select(
          'enabled, analyze_on_close, notify_agent, notify_admins, min_human_messages'
        )
        .eq('account_id', args.accountId)
        .maybeSingle(),
      admin
        .from('conversations')
        .select(
          'id, account_id, contact_id, assigned_agent_id, status, closed_at, ai_state'
        )
        .eq('id', args.conversationId)
        .eq('account_id', args.accountId)
        .maybeSingle(),
    ]);

  if (settingsError) throw settingsError;
  if (
    !settings?.enabled ||
    (triggerType === 'ticket_closed' && !settings.analyze_on_close)
  ) {
    return { status: 'skipped', reason: 'disabled' };
  }

  const conversation = conversationResult.data;
  if (conversationResult.error) throw conversationResult.error;
  if (!conversation) return { status: 'skipped', reason: 'unassigned' };
  if (triggerType === 'ticket_closed' && conversation.status !== 'closed') {
    return { status: 'skipped', reason: 'not_closed' };
  }
  if (
    ['ai_active', 'ai_after_hours'].includes(conversation.ai_state ?? 'idle')
  ) {
    return { status: 'skipped', reason: 'ai_in_control' };
  }
  if (!conversation.assigned_agent_id) {
    return { status: 'skipped', reason: 'unassigned' };
  }

  const closedAt =
    conversation.closed_at ??
    (triggerType === 'manual' ? new Date().toISOString() : null);
  if (!closedAt) return { status: 'skipped', reason: 'not_closed' };

  const { data: existing, error: existingError } = await admin
    .from('ai_coaching_reviews')
    .select('*')
    .eq('conversation_id', conversation.id)
    .eq('conversation_closed_at', closedAt)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === 'completed') {
    return { status: 'existing', review: existing as CoachingReview };
  }

  const [
    { data: messageRows, error: messagesError },
    profileResult,
    contactResult,
  ] = await Promise.all([
    admin
      .from('messages')
      .select('sender_type, sender_id, content_type, content_text, created_at')
      .eq('conversation_id', conversation.id)
      .in('sender_type', ['customer', 'agent'])
      .order('created_at', { ascending: true })
      .limit(160),
    admin
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', conversation.assigned_agent_id)
      .eq('account_id', args.accountId)
      .maybeSingle(),
    admin
      .from('contacts')
      .select('name, phone')
      .eq('id', conversation.contact_id)
      .eq('account_id', args.accountId)
      .maybeSingle(),
  ]);
  if (messagesError) throw messagesError;
  if (profileResult.error) throw profileResult.error;
  if (contactResult.error) throw contactResult.error;

  const humanMessages = (messageRows ?? []).filter(
    (message) =>
      message.sender_type === 'agent' &&
      (!message.sender_id ||
        message.sender_id === conversation.assigned_agent_id) &&
      Boolean(message.content_text?.trim())
  );
  if (humanMessages.length < (settings.min_human_messages ?? 2)) {
    return { status: 'skipped', reason: 'insufficient_human_messages' };
  }

  const transcriptRows = (messageRows ?? []).filter(
    (message) =>
      message.sender_type === 'customer' ||
      !message.sender_id ||
      message.sender_id === conversation.assigned_agent_id
  );
  const transcript = transcriptRows
    .map((message) => {
      const speaker =
        message.sender_type === 'customer' ? 'Cliente' : 'Ejecutivo';
      const content = cleanText(message.content_text, 1200);
      return content ? `${speaker}: ${content}` : '';
    })
    .filter(Boolean)
    .join('\n')
    .slice(-20_000);

  const config = await loadAiConfig(admin, args.accountId, {
    requireActive: false,
  });
  if (!config) return { status: 'skipped', reason: 'ai_unavailable' };

  const agentName =
    profileResult.data?.full_name || profileResult.data?.email || 'Ejecutivo';
  const contactName =
    contactResult.data?.name || contactResult.data?.phone || null;

  const { data: created, error: createError } = await admin
    .from('ai_coaching_reviews')
    .upsert(
      {
        account_id: args.accountId,
        conversation_id: conversation.id,
        conversation_closed_at: closedAt,
        agent_user_id: conversation.assigned_agent_id,
        triggered_by_user_id: args.triggeredByUserId ?? null,
        trigger_type: triggerType,
        status: 'processing',
        contact_name: contactName,
        analyzed_message_count: transcriptRows.length,
        provider: config.provider,
        model: config.model,
        error_code: null,
      },
      { onConflict: 'conversation_id,conversation_closed_at' }
    )
    .select('*')
    .single();
  if (createError) throw createError;

  let reservation: Awaited<ReturnType<typeof reserveAiPoints>> | null = null;
  try {
    reservation = await reserveAiPoints({
      accountId: args.accountId,
      action: 'agent_coaching_analysis',
      idempotencyKey: `coach:${conversation.id}:${closedAt}`,
      actorUserId: args.triggeredByUserId ?? conversation.assigned_agent_id,
      aiConfigId: config.id,
      conversationId: conversation.id,
      contactId: conversation.contact_id,
      metadata: {
        surface: 'agent_coach',
        agent_user_id: conversation.assigned_agent_id,
        trigger_type: triggerType,
      },
    });
    await admin
      .from('ai_coaching_reviews')
      .update({ point_operation_id: reservation.operationId })
      .eq('id', created.id);

    const generated = await generateReply({
      config,
      systemPrompt: coachingPrompt(agentName, config.businessIndustry),
      messages: [
        {
          role: 'user',
          content: `Analiza esta conversacion atendida por una persona:\n\n${transcript}`,
        },
      ],
    });
    const payload = parseCoachingPayload(generated.text);

    await finalizeAiPoints(reservation.operationId, {
      metadata: {
        outcome: 'coaching_completed',
        agent_user_id: conversation.assigned_agent_id,
      },
    });

    const { data: completed, error: completeError } = await admin
      .from('ai_coaching_reviews')
      .update({
        status: 'completed',
        summary: payload.summary,
        strengths: payload.strengths,
        improvements: payload.improvements,
        next_actions: payload.next_actions,
        scores: payload.scores,
        overall_score: payload.overall_score,
        completed_at: new Date().toISOString(),
      })
      .eq('id', created.id)
      .select('*')
      .single();
    if (completeError) throw completeError;

    try {
      await notifyReviewReady({
        accountId: args.accountId,
        conversationId: conversation.id,
        contactId: conversation.contact_id,
        reviewId: created.id,
        agentUserId: conversation.assigned_agent_id,
        agentName,
        summary: payload.summary,
        notifyAgent: settings.notify_agent ?? true,
        notifyAdmins: settings.notify_admins ?? true,
      });
    } catch (error) {
      console.error('[ai coach] notification failed:', error);
    }

    return { status: 'completed', review: completed as CoachingReview };
  } catch (error) {
    if (reservation) {
      await releaseAiPointsQuietly(
        reservation.operationId,
        'coaching_analysis_failed'
      );
    }
    await admin
      .from('ai_coaching_reviews')
      .update({
        status: 'failed',
        error_code:
          error instanceof Error ? error.message.slice(0, 180) : 'unknown',
        completed_at: new Date().toISOString(),
      })
      .eq('id', created.id);
    throw error;
  }
}
