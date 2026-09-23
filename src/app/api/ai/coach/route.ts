import { NextResponse } from 'next/server';

import { analyzeHumanConversation } from '@/lib/ai/coach';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { isUuid } from '@/lib/validation/uuid';

export const maxDuration = 60;

const SETTINGS_COLUMNS =
  'account_id, enabled, analyze_on_close, notify_agent, notify_admins, min_human_messages, updated_at';

export async function GET() {
  try {
    const ctx = await requireRole('agent');
    const [settingsResult, reviewsResult] = await Promise.all([
      ctx.supabase
        .from('ai_coaching_settings')
        .select(SETTINGS_COLUMNS)
        .eq('account_id', ctx.accountId)
        .maybeSingle(),
      ctx.supabase
        .from('ai_coaching_reviews')
        .select('*')
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (settingsResult.error) throw settingsResult.error;
    if (reviewsResult.error) throw reviewsResult.error;

    const reviews = reviewsResult.data ?? [];
    const agentIds = [
      ...new Set(reviews.map((review) => review.agent_user_id as string)),
    ];
    const profilesResult = agentIds.length
      ? await ctx.supabase
          .from('profiles')
          .select('user_id, full_name, email, avatar_url')
          .eq('account_id', ctx.accountId)
          .in('user_id', agentIds)
      : { data: [], error: null };
    if (profilesResult.error) throw profilesResult.error;

    return NextResponse.json({
      role: ctx.role,
      current_user_id: ctx.userId,
      settings: settingsResult.data ?? {
        account_id: ctx.accountId,
        enabled: false,
        analyze_on_close: true,
        notify_agent: true,
        notify_admins: true,
        min_human_messages: 2,
      },
      reviews,
      profiles: profilesResult.data ?? [],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json()) as Record<string, unknown>;
    const minHumanMessages = Math.min(
      20,
      Math.max(1, Math.floor(Number(body.min_human_messages) || 2))
    );
    const payload = {
      account_id: ctx.accountId,
      enabled: body.enabled === true,
      analyze_on_close: body.analyze_on_close !== false,
      notify_agent: body.notify_agent !== false,
      notify_admins: body.notify_admins !== false,
      min_human_messages: minHumanMessages,
    };

    const { data, error } = await ctx.supabase
      .from('ai_coaching_settings')
      .upsert(payload, { onConflict: 'account_id' })
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(`ai-coach:${ctx.userId}`, RATE_LIMITS.aiDraft);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json()) as Record<string, unknown>;
    if (!isUuid(body.conversation_id)) {
      return NextResponse.json(
        { error: 'La conversacion no es valida.' },
        { status: 400 }
      );
    }

    if (!hasMinRole(ctx.role, 'admin')) {
      const { data: conversation, error } = await ctx.supabase
        .from('conversations')
        .select('assigned_agent_id')
        .eq('id', body.conversation_id)
        .eq('account_id', ctx.accountId)
        .maybeSingle();
      if (error) throw error;
      if (conversation?.assigned_agent_id !== ctx.userId) {
        return NextResponse.json(
          { error: 'Solo puedes analizar una conversacion asignada a ti.' },
          { status: 403 }
        );
      }
    }

    const result = await analyzeHumanConversation({
      accountId: ctx.accountId,
      conversationId: body.conversation_id,
      triggeredByUserId: ctx.userId,
      triggerType: 'manual',
    });
    return NextResponse.json({ result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
