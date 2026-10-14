import { NextResponse } from 'next/server';

import { AI_OBJECTIVES, AI_TONES } from '@/lib/ai/agent-schema';
import { FOLLOW_UP_AGENT_DEFAULTS } from '@/lib/ai/follow-up';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const COLUMNS =
  'id, account_id, created_by, is_active, agent_name, objective, custom_objective, tone, custom_tone, additional_instructions, first_delay_hours, second_delay_hours, max_attempts, timezone, active_days, starts_at, ends_at, channels, whatsapp_template_name, whatsapp_template_language';

function text(value: unknown, maximum: number, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : fallback;
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('es-CL', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function parseBody(body: unknown) {
  const source =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const objective = AI_OBJECTIVES.includes(
    source.objective as (typeof AI_OBJECTIVES)[number]
  )
    ? String(source.objective)
    : FOLLOW_UP_AGENT_DEFAULTS.objective;
  const tone = AI_TONES.includes(source.tone as (typeof AI_TONES)[number])
    ? String(source.tone)
    : FOLLOW_UP_AGENT_DEFAULTS.tone;
  const timezone = text(source.timezone, 80, FOLLOW_UP_AGENT_DEFAULTS.timezone);
  if (!validTimezone(timezone)) throw new Error('Zona horaria inválida.');

  const activeDays = Array.isArray(source.active_days)
    ? [
        ...new Set(
          source.active_days
            .map(Number)
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        ),
      ]
    : [...FOLLOW_UP_AGENT_DEFAULTS.active_days];
  if (!activeDays.length) throw new Error('Selecciona al menos un día.');

  const allowedChannels = ['whatsapp', 'facebook', 'instagram'];
  const channels = Array.isArray(source.channels)
    ? [
        ...new Set(
          source.channels
            .map(String)
            .filter((channel) => allowedChannels.includes(channel))
        ),
      ]
    : [...FOLLOW_UP_AGENT_DEFAULTS.channels];
  if (!channels.length) throw new Error('Selecciona al menos un canal.');

  const startsAt = text(
    source.starts_at,
    5,
    FOLLOW_UP_AGENT_DEFAULTS.starts_at
  );
  const endsAt = text(source.ends_at, 5, FOLLOW_UP_AGENT_DEFAULTS.ends_at);
  if (
    !/^\d{2}:\d{2}$/.test(startsAt) ||
    !/^\d{2}:\d{2}$/.test(endsAt) ||
    startsAt >= endsAt
  ) {
    throw new Error('El horario configurado no es válido.');
  }

  return {
    is_active: source.is_active === true,
    agent_name: text(
      source.agent_name,
      80,
      FOLLOW_UP_AGENT_DEFAULTS.agent_name
    ),
    objective,
    custom_objective: text(source.custom_objective, 3000),
    tone,
    custom_tone: text(source.custom_tone, 2000),
    additional_instructions: text(source.additional_instructions, 10000),
    first_delay_hours: integer(
      source.first_delay_hours,
      1,
      168,
      FOLLOW_UP_AGENT_DEFAULTS.first_delay_hours
    ),
    second_delay_hours: integer(
      source.second_delay_hours,
      1,
      336,
      FOLLOW_UP_AGENT_DEFAULTS.second_delay_hours
    ),
    max_attempts: integer(
      source.max_attempts,
      1,
      3,
      FOLLOW_UP_AGENT_DEFAULTS.max_attempts
    ),
    timezone,
    active_days: activeDays,
    starts_at: startsAt,
    ends_at: endsAt,
    channels,
    whatsapp_template_name: text(source.whatsapp_template_name, 512) || null,
    whatsapp_template_language: text(
      source.whatsapp_template_language,
      20,
      FOLLOW_UP_AGENT_DEFAULTS.whatsapp_template_language
    ),
  };
}

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const [addonResult, agentResult, jobsResult] = await Promise.all([
      supabase
        .from('account_addons')
        .select(
          'status, monthly_price_snapshot, included_points, current_period_ends_at'
        )
        .eq('account_id', accountId)
        .eq('addon_code', 'follow_up_agent')
        .maybeSingle(),
      supabase
        .from('ai_follow_up_agents')
        .select(COLUMNS)
        .eq('account_id', accountId)
        .maybeSingle(),
      supabase
        .from('ai_follow_up_jobs')
        .select('status, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);
    const error = [addonResult.error, agentResult.error, jobsResult.error].find(
      Boolean
    );
    if (error) throw error;
    const metrics = (jobsResult.data ?? []).reduce(
      (result, job) => {
        result.total++;
        if (job.status === 'sent') result.sent++;
        if (job.status === 'pending' || job.status === 'running')
          result.pending++;
        if (job.status === 'blocked') result.blocked++;
        return result;
      },
      { total: 0, sent: 0, pending: 0, blocked: 0 }
    );
    return NextResponse.json({
      entitled: addonResult.data?.status === 'active',
      addon: addonResult.data ?? null,
      config: agentResult.data ?? FOLLOW_UP_AGENT_DEFAULTS,
      metrics,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(
      `ai-follow-up-config:${userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const [addonResult, primaryResult] = await Promise.all([
      supabase
        .from('account_addons')
        .select('status')
        .eq('account_id', accountId)
        .eq('addon_code', 'follow_up_agent')
        .maybeSingle(),
      supabase
        .from('ai_configs')
        .select('id')
        .eq('account_id', accountId)
        .maybeSingle(),
    ]);
    if (addonResult.error || primaryResult.error) {
      throw addonResult.error ?? primaryResult.error;
    }
    if (addonResult.data?.status !== 'active') {
      return NextResponse.json(
        {
          error: 'Contrata el Agente de Seguimiento Pro antes de configurarlo.',
          code: 'follow_up_addon_required',
        },
        { status: 402 }
      );
    }
    if (!primaryResult.data) {
      return NextResponse.json(
        {
          error:
            'Configura primero el Agente IA principal para compartir la información autorizada de la empresa.',
          code: 'primary_agent_required',
        },
        { status: 409 }
      );
    }

    const config = parseBody(await request.json().catch(() => null));
    const { data: existing, error: existingError } = await supabase
      .from('ai_follow_up_agents')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle();
    if (existingError) throw existingError;
    const result = existing
      ? await supabase
          .from('ai_follow_up_agents')
          .update({ ...config, updated_by: userId })
          .eq('account_id', accountId)
          .select('id')
          .single()
      : await supabase
          .from('ai_follow_up_agents')
          .insert({
            account_id: accountId,
            created_by: userId,
            updated_by: userId,
            ...config,
          })
          .select('id')
          .single();
    if (result.error) throw result.error;

    if (!config.is_active) {
      const { error: cancelError } = await supabaseAdmin()
        .from('ai_follow_up_jobs')
        .update({
          status: 'canceled',
          cancel_reason: 'agent_disabled',
          completed_at: new Date().toISOString(),
        })
        .eq('account_id', accountId)
        .in('status', ['pending', 'running']);
      if (cancelError) throw cancelError;
    }

    return NextResponse.json({ success: true, id: result.data.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : null;
    if (
      message === 'Zona horaria inválida.' ||
      message === 'Selecciona al menos un día.' ||
      message === 'Selecciona al menos un canal.' ||
      message === 'El horario configurado no es válido.'
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}
