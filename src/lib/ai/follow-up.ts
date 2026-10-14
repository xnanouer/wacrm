import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { buildSystemPrompt } from '@/lib/ai/defaults';
import { buildConversationContext } from '@/lib/ai/context';
import { generateReply } from '@/lib/ai/generate';
import { buildStructuredAgentContext } from '@/lib/ai/orchestrator';
import { loadAiConfig } from '@/lib/ai/config';
import {
  finalizeAiPoints,
  releaseAiPointsQuietly,
  reserveAiPoints,
} from '@/lib/ai/points/service';
import { AiError, type AiConfig } from '@/lib/ai/types';
import { serviceAccountHasOperationalAccess } from '@/lib/billing/server-access';
import { sendSocialMessageToConversation } from '@/lib/meta/send-message';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const FOLLOW_UP_AGENT_DEFAULTS = {
  is_active: false,
  agent_name: 'Agente de Seguimiento',
  objective: 'follow_up',
  custom_objective: '',
  tone: 'commercial',
  custom_tone: '',
  additional_instructions: '',
  first_delay_hours: 20,
  second_delay_hours: 72,
  max_attempts: 2,
  timezone: 'America/Santiago',
  active_days: [1, 2, 3, 4, 5, 6],
  starts_at: '09:00',
  ends_at: '19:00',
  channels: ['whatsapp', 'facebook', 'instagram'],
  whatsapp_template_name: '',
  whatsapp_template_language: 'es_CL',
} as const;

export interface FollowUpAgentRow {
  id: string;
  account_id: string;
  created_by: string | null;
  is_active: boolean;
  agent_name: string;
  objective: string;
  custom_objective: string;
  tone: string;
  custom_tone: string;
  additional_instructions: string;
  first_delay_hours: number;
  second_delay_hours: number;
  max_attempts: number;
  timezone: string;
  active_days: number[];
  starts_at: string;
  ends_at: string;
  channels: string[];
  whatsapp_template_name: string | null;
  whatsapp_template_language: string;
}

interface FollowUpJobRow {
  id: string;
  account_id: string;
  agent_id: string;
  conversation_id: string;
  contact_id: string;
  baseline_message_id: string;
  attempt: number;
  run_at: string;
}

interface ConversationRow {
  id: string;
  account_id: string;
  contact_id: string;
  channel: 'whatsapp' | 'facebook' | 'instagram';
  status: 'pending' | 'open' | 'waiting' | 'closed';
  whatsapp_config_id: string | null;
  channel_connection_id: string | null;
}

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function timeParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    day: DAY_INDEX[value('weekday')] ?? -1,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

function hhmmMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

export function isFollowUpScheduleOpen(
  agent: Pick<
    FollowUpAgentRow,
    'timezone' | 'active_days' | 'starts_at' | 'ends_at'
  >,
  date = new Date()
) {
  const local = timeParts(date, agent.timezone);
  return (
    agent.active_days.includes(local.day) &&
    local.minutes >= hhmmMinutes(agent.starts_at) &&
    local.minutes < hhmmMinutes(agent.ends_at)
  );
}

export function nextFollowUpScheduleAt(
  agent: Pick<
    FollowUpAgentRow,
    'timezone' | 'active_days' | 'starts_at' | 'ends_at'
  >,
  from = new Date()
) {
  const candidate = new Date(from);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  for (let slot = 0; slot < 8 * 48; slot++) {
    if (isFollowUpScheduleOpen(agent, candidate)) return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 30);
  }
  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}

function customerOptedOut(text: string | null | undefined) {
  const normalized = (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
  return /\b(no me contacten|no escribir|no escriban|no llamar|no llamen|no gracias|no me interesa|dejar de recibir|basta|stop)\b/.test(
    normalized
  );
}

function runtimeForFollowUp(base: AiConfig, agent: FollowUpAgentRow): AiConfig {
  return {
    ...base,
    isActive: true,
    agentName: agent.agent_name,
    agentTitle: 'Especialista de seguimiento',
    tone: agent.tone,
    customTone: agent.custom_tone,
    primaryObjective: agent.objective,
    customObjective: agent.custom_objective,
    additionalInstructions: [
      base.additionalInstructions,
      agent.additional_instructions,
      'Esta es una tarea automática de seguimiento porque el cliente no respondió al último mensaje de la empresa.',
      'Escribe un solo mensaje breve, natural y relacionado con la conversación. No inventes descuentos, disponibilidad, aprobaciones ni plazos.',
      'No digas que eres una automatización, no repitas el saludo inicial y no presiones al cliente. Haz como máximo una pregunta clara.',
      'Si el cliente ya rechazó la oferta, pidió que no lo contacten o el caso está resuelto, no generes un mensaje.',
    ]
      .filter(Boolean)
      .join('\n'),
    catalogAiEnabled: false,
    catalogAiAutoSend: false,
    audioEnabled: false,
  };
}

async function markJob(
  db: SupabaseClient,
  jobId: string,
  values: Record<string, unknown>
) {
  const { error } = await db
    .from('ai_follow_up_jobs')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw error;
}

async function processClaimedJob(
  db: ReturnType<typeof supabaseAdmin>,
  job: FollowUpJobRow
) {
  const [agentResult, addonResult, conversationResult] = await Promise.all([
    db
      .from('ai_follow_up_agents')
      .select('*')
      .eq('id', job.agent_id)
      .eq('account_id', job.account_id)
      .maybeSingle(),
    db
      .from('account_addons')
      .select('status')
      .eq('account_id', job.account_id)
      .eq('addon_code', 'follow_up_agent')
      .maybeSingle(),
    db
      .from('conversations')
      .select(
        'id, account_id, contact_id, channel, status, whatsapp_config_id, channel_connection_id'
      )
      .eq('id', job.conversation_id)
      .eq('account_id', job.account_id)
      .maybeSingle(),
  ]);
  const firstError = [
    agentResult.error,
    addonResult.error,
    conversationResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const agent = agentResult.data as FollowUpAgentRow | null;
  const conversation = conversationResult.data as ConversationRow | null;
  if (
    !agent?.is_active ||
    addonResult.data?.status !== 'active' ||
    !conversation ||
    conversation.status === 'closed' ||
    !(await serviceAccountHasOperationalAccess(db, job.account_id))
  ) {
    await markJob(db, job.id, {
      status: 'canceled',
      cancel_reason: 'agent_or_subscription_inactive',
      completed_at: new Date().toISOString(),
    });
    return 'canceled';
  }

  if (!isFollowUpScheduleOpen(agent)) {
    await markJob(db, job.id, {
      status: 'pending',
      run_at: nextFollowUpScheduleAt(agent).toISOString(),
    });
    return 'rescheduled';
  }

  const { data: latestMessage, error: latestError } = await db
    .from('messages')
    .select('id, sender_type, content_text, created_at')
    .eq('conversation_id', job.conversation_id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  if (
    !latestMessage ||
    latestMessage.id !== job.baseline_message_id ||
    latestMessage.sender_type === 'customer'
  ) {
    await markJob(db, job.id, {
      status: 'canceled',
      cancel_reason: 'conversation_changed',
      completed_at: new Date().toISOString(),
    });
    return 'canceled';
  }

  const { data: lastCustomer, error: customerError } = await db
    .from('messages')
    .select('content_text, created_at')
    .eq('conversation_id', job.conversation_id)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (customerError) throw customerError;
  if (!lastCustomer || customerOptedOut(lastCustomer.content_text)) {
    await markJob(db, job.id, {
      status: 'canceled',
      cancel_reason: lastCustomer
        ? 'customer_opted_out'
        : 'no_customer_message',
      completed_at: new Date().toISOString(),
    });
    return 'canceled';
  }

  const windowOpen =
    Date.now() - Date.parse(lastCustomer.created_at) < 24 * 60 * 60 * 1000;
  if (
    (conversation.channel === 'facebook' ||
      conversation.channel === 'instagram') &&
    !windowOpen
  ) {
    await markJob(db, job.id, {
      status: 'blocked',
      cancel_reason: 'meta_reply_window_closed',
      completed_at: new Date().toISOString(),
    });
    return 'blocked';
  }

  let useWhatsAppTemplate = false;
  if (conversation.channel === 'whatsapp' && !windowOpen) {
    const { data: whatsapp } = conversation.whatsapp_config_id
      ? await db
          .from('whatsapp_config')
          .select('provider')
          .eq('id', conversation.whatsapp_config_id)
          .eq('account_id', job.account_id)
          .maybeSingle()
      : { data: null };
    useWhatsAppTemplate = (whatsapp?.provider ?? 'cloud_api') === 'cloud_api';
    if (useWhatsAppTemplate && !agent.whatsapp_template_name?.trim()) {
      await markJob(db, job.id, {
        status: 'blocked',
        cancel_reason: 'whatsapp_template_required',
        completed_at: new Date().toISOString(),
      });
      return 'blocked';
    }
  }

  let text = '';
  if (!useWhatsAppTemplate) {
    const baseConfig = await loadAiConfig(db, job.account_id, {
      requireActive: false,
    });
    if (!baseConfig) {
      await markJob(db, job.id, {
        status: 'blocked',
        cancel_reason: 'managed_ai_not_configured',
        completed_at: new Date().toISOString(),
      });
      return 'blocked';
    }
    const runtimeConfig = runtimeForFollowUp(baseConfig, agent);
    const messages = await buildConversationContext(db, job.conversation_id);
    const { data: account } = await db
      .from('accounts')
      .select('name')
      .eq('id', job.account_id)
      .maybeSingle();
    const systemPrompt = buildSystemPrompt({
      userPrompt: runtimeConfig.systemPrompt,
      mode: 'draft',
      structuredContext: buildStructuredAgentContext(
        runtimeConfig,
        account?.name ?? null
      ),
    });
    const reservation = await reserveAiPoints({
      accountId: job.account_id,
      action: 'follow_up_reply',
      idempotencyKey: `follow-up:${job.id}`,
      actorUserId: agent.created_by,
      aiConfigId: baseConfig.id,
      conversationId: job.conversation_id,
      contactId: job.contact_id,
      whatsappConfigId: conversation.whatsapp_config_id,
      channelConnectionId: conversation.channel_connection_id,
      sourceMessageId: job.baseline_message_id,
      metadata: {
        surface: 'follow_up_agent',
        follow_up_agent_id: agent.id,
        attempt: job.attempt,
      },
    });
    let providerCompleted = false;
    try {
      const generated = await generateReply({
        config: runtimeConfig,
        systemPrompt,
        messages,
      });
      text = generated.text.trim();
      if (!text) throw new Error('EMPTY_FOLLOW_UP_REPLY');
      providerCompleted = true;
      await finalizeAiPoints(reservation.operationId, {
        metadata: { outcome: 'follow_up_generated', attempt: job.attempt },
      });
    } catch (error) {
      if (!providerCompleted) {
        await releaseAiPointsQuietly(
          reservation.operationId,
          'follow_up_generation_failed'
        );
      }
      throw error;
    }
  }

  // Generation can take a few seconds. Re-check immediately before sending so
  // a customer reply, an administrator pause, or a canceled subscription can
  // stop a message that was already being prepared.
  const [currentJobResult, currentMessageResult] = await Promise.all([
    db.from('ai_follow_up_jobs').select('status').eq('id', job.id).single(),
    db
      .from('messages')
      .select('id')
      .eq('conversation_id', job.conversation_id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const sendGuardError = [
    currentJobResult.error,
    currentMessageResult.error,
  ].find(Boolean);
  if (sendGuardError) throw sendGuardError;
  if (
    currentJobResult.data?.status !== 'running' ||
    currentMessageResult.data?.id !== job.baseline_message_id
  ) {
    if (currentJobResult.data?.status === 'running') {
      await markJob(db, job.id, {
        status: 'canceled',
        cancel_reason: 'conversation_changed_before_send',
        completed_at: new Date().toISOString(),
      });
    }
    return 'canceled';
  }

  const sent =
    conversation.channel === 'facebook' || conversation.channel === 'instagram'
      ? await sendSocialMessageToConversation(db, job.account_id, {
          conversationId: job.conversation_id,
          messageType: 'text',
          contentText: text,
          senderType: 'bot',
          automationOrigin: 'follow_up_agent',
        })
      : await sendMessageToConversation(db, job.account_id, {
          conversationId: job.conversation_id,
          messageType: useWhatsAppTemplate ? 'template' : 'text',
          contentText: useWhatsAppTemplate ? null : text,
          templateName: useWhatsAppTemplate
            ? agent.whatsapp_template_name
            : null,
          templateLanguage: agent.whatsapp_template_language,
          senderType: 'bot',
          pauseFlows: false,
          automationOrigin: 'follow_up_agent',
        });

  await markJob(db, job.id, {
    status: 'sent',
    generated_text: useWhatsAppTemplate
      ? `[Plantilla: ${agent.whatsapp_template_name}]`
      : text,
    sent_message_id: sent.messageId,
    completed_at: new Date().toISOString(),
  });

  if (job.attempt < agent.max_attempts) {
    const { error } = await db.from('ai_follow_up_jobs').insert({
      account_id: job.account_id,
      agent_id: agent.id,
      conversation_id: job.conversation_id,
      contact_id: job.contact_id,
      baseline_message_id: sent.messageId,
      attempt: job.attempt + 1,
      run_at: new Date(
        Date.now() + agent.second_delay_hours * 60 * 60 * 1000
      ).toISOString(),
    });
    if (error) throw error;
  }

  return 'sent';
}

export async function processDueFollowUpJobs(limit = 25) {
  const db = supabaseAdmin();
  const { data: due, error } = await db
    .from('ai_follow_up_jobs')
    .select(
      'id, account_id, agent_id, conversation_id, contact_id, baseline_message_id, attempt, run_at'
    )
    .eq('status', 'pending')
    .lte('run_at', new Date().toISOString())
    .order('run_at', { ascending: true })
    .limit(Math.min(100, Math.max(1, limit)));
  if (error) throw error;

  const totals = { processed: 0, sent: 0, canceled: 0, blocked: 0, failed: 0 };
  for (const raw of due ?? []) {
    const job = raw as FollowUpJobRow;
    const { data: claim, error: claimError } = await db
      .from('ai_follow_up_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (claimError || !claim) continue;
    totals.processed++;
    try {
      const outcome = await processClaimedJob(db, job);
      if (outcome in totals) {
        totals[outcome as 'sent' | 'canceled' | 'blocked']++;
      }
    } catch (error) {
      if (error instanceof AiError) totals.blocked++;
      else totals.failed++;
      const message = error instanceof Error ? error.message : String(error);
      await markJob(db, job.id, {
        status: error instanceof AiError ? 'blocked' : 'failed',
        cancel_reason:
          error instanceof AiError ? error.code : 'follow_up_execution_failed',
        error_message: message.slice(0, 1000),
        completed_at: new Date().toISOString(),
      });
      console.error('[follow-up agent] job failed', job.id, error);
    }
  }
  return totals;
}
