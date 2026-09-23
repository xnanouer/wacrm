import 'server-only';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import type {
  AiPointAction,
  AiPointDistributionItem,
  AiPointUsageItem,
  AiUsageSummary,
} from '@/lib/ai/points/types';

interface UsageOptions {
  historyLimit?: number;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currentCycleWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

async function loadCompletedOperations(
  accountId: string,
  cycleId: string | null
) {
  if (!cycleId) return [] as { action_key: string; charged_points: unknown }[];

  const admin = supabaseAdmin();
  const rows: { action_key: string; charged_points: unknown }[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin
      .from('ai_point_operations')
      .select('action_key, charged_points')
      .eq('account_id', accountId)
      .eq('cycle_id', cycleId)
      .eq('status', 'completed')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

export async function getAiUsageSummary(
  accountId: string,
  options: UsageOptions = {}
): Promise<AiUsageSummary> {
  const admin = supabaseAdmin();
  const historyLimit = Math.min(100, Math.max(1, options.historyLimit ?? 30));
  const window = currentCycleWindow();

  const [
    accountResult,
    entitlementResult,
    settingsResult,
    cycleResult,
    grantsResult,
    costsResult,
    historyResult,
  ] = await Promise.all([
    admin
      .from('accounts')
      .select('plan_code')
      .eq('id', accountId)
      .maybeSingle(),
    admin
      .from('account_ai_entitlements')
      .select('platform_enabled, disabled_reason, monthly_points_override')
      .eq('account_id', accountId)
      .maybeSingle(),
    admin
      .from('platform_ai_settings')
      .select(
        'global_enabled, audio_enabled, text_provider, text_model, encrypted_api_key'
      )
      .eq('id', 1)
      .maybeSingle(),
    admin
      .from('ai_point_cycles')
      .select(
        'id, cycle_started_at, cycle_ends_at, included_points, included_points_used, included_points_reserved'
      )
      .eq('account_id', accountId)
      .eq('cycle_started_at', window.start)
      .maybeSingle(),
    admin
      .from('ai_point_grants')
      .select('original_points, used_points, reserved_points, expires_at')
      .eq('account_id', accountId),
    admin
      .from('ai_point_action_costs')
      .select('action_key, customer_label, category')
      .order('sort_order'),
    admin
      .from('ai_point_operations')
      .select(
        'id, action_key, status, charged_points, actual_duration_ms, created_at'
      )
      .eq('account_id', accountId)
      .in('status', ['completed', 'released'])
      .order('created_at', { ascending: false })
      .limit(historyLimit),
  ]);

  const firstError = [
    accountResult.error,
    entitlementResult.error,
    settingsResult.error,
    cycleResult.error,
    grantsResult.error,
    costsResult.error,
    historyResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;
  if (!accountResult.data) throw new Error('AI_ACCOUNT_NOT_FOUND');

  const planCode = accountResult.data.plan_code ?? 'trial';
  const { data: plan, error: planError } = await admin
    .from('saas_plans')
    .select('ai_monthly_points')
    .eq('code', planCode)
    .maybeSingle();
  if (planError) throw planError;

  const entitlement = entitlementResult.data;
  const cycle = cycleResult.data;
  const monthlyIncluded = cycle
    ? numberValue(cycle.included_points)
    : entitlement?.monthly_points_override !== null &&
        entitlement?.monthly_points_override !== undefined
      ? numberValue(entitlement.monthly_points_override)
      : numberValue(plan?.ai_monthly_points);
  const monthlyUsed = numberValue(cycle?.included_points_used);
  const monthlyReserved = numberValue(cycle?.included_points_reserved);
  const monthlyAvailable = Math.max(
    0,
    monthlyIncluded - monthlyUsed - monthlyReserved
  );
  const now = Date.now();
  const additionalAvailable = (grantsResult.data ?? []).reduce((sum, grant) => {
    if (grant.expires_at && new Date(grant.expires_at).getTime() <= now) {
      return sum;
    }
    return (
      sum +
      Math.max(
        0,
        numberValue(grant.original_points) -
          numberValue(grant.used_points) -
          numberValue(grant.reserved_points)
      )
    );
  }, 0);

  const costMap = new Map(
    (costsResult.data ?? []).map((cost) => [
      cost.action_key,
      {
        label: cost.customer_label,
        category: cost.category as 'text' | 'analysis' | 'audio',
      },
    ])
  );
  const completed = await loadCompletedOperations(accountId, cycle?.id ?? null);
  const distributionMap = new Map<string, number>();
  for (const operation of completed) {
    distributionMap.set(
      operation.action_key,
      (distributionMap.get(operation.action_key) ?? 0) +
        numberValue(operation.charged_points)
    );
  }

  const distribution: AiPointDistributionItem[] = Array.from(
    distributionMap.entries()
  )
    .map(([actionKey, points]) => {
      const cost = costMap.get(actionKey);
      return {
        actionKey: actionKey as AiPointAction,
        label: cost?.label ?? actionKey,
        category: cost?.category ?? 'text',
        points,
      };
    })
    .sort((a, b) => b.points - a.points);

  const history: AiPointUsageItem[] = (historyResult.data ?? []).map(
    (operation) => {
      const cost = costMap.get(operation.action_key);
      return {
        id: operation.id,
        actionKey: operation.action_key as AiPointAction,
        label: cost?.label ?? operation.action_key,
        category: cost?.category ?? 'text',
        status: operation.status as 'completed' | 'released',
        points: numberValue(operation.charged_points),
        durationMs:
          operation.actual_duration_ms === null
            ? null
            : numberValue(operation.actual_duration_ms),
        createdAt: operation.created_at,
      };
    }
  );

  const platformSettings = settingsResult.data;
  const globalEnabled = Boolean(
    platformSettings?.global_enabled &&
    platformSettings.text_provider &&
    platformSettings.text_model &&
    platformSettings.encrypted_api_key
  );
  const totalAvailable = monthlyAvailable + additionalAvailable;

  return {
    platformEnabled: Boolean(entitlement?.platform_enabled),
    globalEnabled,
    audioEnabled: Boolean(globalEnabled && platformSettings?.audio_enabled),
    disabledReason: entitlement?.disabled_reason ?? null,
    planCode,
    monthlyPointsOverride:
      entitlement?.monthly_points_override === null ||
      entitlement?.monthly_points_override === undefined
        ? null
        : numberValue(entitlement.monthly_points_override),
    monthlyIncluded,
    monthlyUsed,
    monthlyReserved,
    monthlyAvailable,
    additionalAvailable,
    totalAvailable,
    usagePercentage:
      monthlyIncluded > 0
        ? Math.min(100, Math.round((monthlyUsed / monthlyIncluded) * 100))
        : 0,
    cycleStartedAt: cycle?.cycle_started_at ?? window.start,
    cycleEndsAt: cycle?.cycle_ends_at ?? window.end,
    distribution,
    history,
  };
}
