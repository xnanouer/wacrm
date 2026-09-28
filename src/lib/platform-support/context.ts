import type { SupabaseClient } from '@supabase/supabase-js';

import { getAiUsageSummary } from '@/lib/ai/points/usage';
import type { AccountContext } from '@/lib/auth/account';
import { redactSecrets, safeInternalPath } from './security';

export interface SupportAccountContext {
  user: { id: string; name: string | null; email: string; role: string };
  account: {
    id: string;
    name: string;
    plan: string;
    subscriptionStatus: string;
  };
  currentPath: string;
  connections: Array<{ type: string; name: string; status: string }>;
  limits: Record<string, unknown>;
  recentErrors: Array<{
    source: string;
    message: string;
    occurredAt: string | null;
  }>;
}

export async function buildSupportAccountContext(
  admin: SupabaseClient,
  ctx: AccountContext,
  requestedPath: unknown
): Promise<SupportAccountContext> {
  const [
    profileResult,
    planResult,
    whatsappResult,
    socialResult,
    automationResult,
    aiUsage,
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', ctx.userId)
      .eq('account_id', ctx.accountId)
      .single(),
    admin
      .from('saas_plans')
      .select('name, max_users, max_channels, ai_monthly_points')
      .eq('code', ctx.account.plan_code)
      .maybeSingle(),
    admin
      .from('whatsapp_config')
      .select(
        'provider, status, connection_name, display_phone, last_registration_error, updated_at'
      )
      .eq('account_id', ctx.accountId)
      .is('removed_at', null),
    admin
      .from('channel_connections')
      .select('channel, display_name, status, updated_at')
      .eq('account_id', ctx.accountId),
    admin
      .from('automation_logs')
      .select('error_message, created_at')
      .eq('account_id', ctx.accountId)
      .not('error_message', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3),
    getAiUsageSummary(ctx.accountId),
  ]);

  const firstError = [
    profileResult.error,
    planResult.error,
    whatsappResult.error,
    socialResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;
  if (!profileResult.data) throw new Error('Support user profile not found');

  const connections = [
    ...(whatsappResult.data ?? []).map((row) => ({
      type: 'whatsapp',
      name: row.connection_name || row.display_phone || 'WhatsApp',
      status: row.status,
    })),
    ...(socialResult.data ?? []).map((row) => ({
      type: row.channel,
      name: row.display_name,
      status: row.status,
    })),
  ];

  const recentErrors = [
    ...(whatsappResult.data ?? [])
      .filter((row) => row.last_registration_error)
      .map((row) => ({
        source: 'whatsapp',
        message: redactSecrets(row.last_registration_error!),
        occurredAt: row.updated_at,
      })),
    ...(automationResult.data ?? []).map((row) => ({
      source: 'automation',
      message: redactSecrets(row.error_message ?? ''),
      occurredAt: row.created_at,
    })),
  ].slice(0, 5);

  return {
    user: {
      id: ctx.userId,
      name: profileResult.data.full_name,
      email: profileResult.data.email,
      role: ctx.role,
    },
    account: {
      id: ctx.accountId,
      name: ctx.account.name,
      plan: planResult.data?.name ?? ctx.account.plan_code,
      subscriptionStatus: ctx.account.subscription_status,
    },
    currentPath: safeInternalPath(requestedPath) ?? '/dashboard',
    connections,
    limits: {
      maxUsers: planResult.data?.max_users ?? null,
      maxConnections: planResult.data?.max_channels ?? null,
      monthlyAiPoints: planResult.data?.ai_monthly_points ?? 0,
      aiPoints: aiUsage,
    },
    recentErrors,
  };
}
