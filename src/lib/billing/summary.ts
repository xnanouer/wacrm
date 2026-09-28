import 'server-only';

import { getAiUsageSummary } from '@/lib/ai/points/usage';
import type { AiUsageSummary } from '@/lib/ai/points/types';
import type { AccountContext } from '@/lib/auth/account';
import type { SubscriptionStatus } from '@/lib/billing/access';
import { getAccountChannelCapacity } from '@/lib/channels/capacity';

export interface AccountPlanSummary {
  accountName: string;
  planCode: string;
  planName: string;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  databaseMonthlyPrice: number | null;
  databaseCurrency: string;
  users: {
    used: number;
    limit: number | null;
  };
  connections: {
    used: number;
    limit: number | null;
  };
  catalog: {
    used: number;
    limit: number;
    remaining: number;
    extraUnits: number;
  } | null;
  aiUsage: AiUsageSummary | null;
}

interface CatalogCapacityRow {
  total_limit: number | string;
  used_units: number | string;
  remaining_units: number | string;
  extra_units: number | string;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function safelyLoadAiUsage(
  accountId: string
): Promise<AiUsageSummary | null> {
  try {
    return await getAiUsageSummary(accountId, { historyLimit: 5 });
  } catch (error) {
    console.error('[billing] could not load AI usage summary', error);
    return null;
  }
}

async function safelyLoadCatalogUsage(
  ctx: AccountContext
): Promise<AccountPlanSummary['catalog']> {
  try {
    const { data, error } = await ctx.supabase.rpc('catalog_capacity_snapshot');
    if (error) throw error;
    const snapshot = ((data ?? []) as CatalogCapacityRow[])[0];
    if (!snapshot) return null;

    return {
      used: numberValue(snapshot.used_units),
      limit: numberValue(snapshot.total_limit),
      remaining: numberValue(snapshot.remaining_units),
      extraUnits: numberValue(snapshot.extra_units),
    };
  } catch (error) {
    console.error('[billing] could not load catalog usage summary', error);
    return null;
  }
}

export async function getAccountPlanSummary(
  ctx: AccountContext
): Promise<AccountPlanSummary> {
  const [planResult, usersResult, channelCapacity, aiUsage, catalog] =
    await Promise.all([
      ctx.supabase
        .from('saas_plans')
        .select('code, name, monthly_price, currency, max_users, max_channels')
        .eq('code', ctx.account.plan_code)
        .maybeSingle(),
      ctx.supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('account_id', ctx.accountId),
      getAccountChannelCapacity(ctx.accountId),
      safelyLoadAiUsage(ctx.accountId),
      safelyLoadCatalogUsage(ctx),
    ]);

  const firstError = [planResult.error, usersResult.error].find(Boolean);
  if (firstError) throw firstError;

  const plan = planResult.data;
  return {
    accountName: ctx.account.name,
    planCode: ctx.account.plan_code,
    planName: plan?.name ?? ctx.account.plan_code,
    subscriptionStatus: ctx.account.subscription_status,
    trialEndsAt: ctx.account.trial_ends_at,
    currentPeriodEndsAt: ctx.account.current_period_ends_at,
    databaseMonthlyPrice:
      plan?.monthly_price === null || plan?.monthly_price === undefined
        ? null
        : numberValue(plan.monthly_price),
    databaseCurrency: plan?.currency ?? 'USD',
    users: {
      used: usersResult.count ?? 0,
      limit:
        plan?.max_users === null || plan?.max_users === undefined
          ? null
          : numberValue(plan.max_users),
    },
    connections: {
      used: channelCapacity.usedChannels,
      limit: channelCapacity.totalLimit,
    },
    catalog,
    aiUsage,
  };
}
