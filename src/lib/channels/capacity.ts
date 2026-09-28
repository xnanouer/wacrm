import 'server-only';

import { supabaseAdmin } from '@/lib/flows/admin-client';

export interface AccountChannelCapacity {
  baseLimit: number | null;
  extraChannels: number;
  totalLimit: number | null;
  usedChannels: number;
  remainingChannels: number | null;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getAccountChannelCapacity(
  accountId: string
): Promise<AccountChannelCapacity> {
  const admin = supabaseAdmin();
  const [accountResult, entitlementResult, whatsappResult, socialResult] =
    await Promise.all([
      admin
        .from('accounts')
        .select('plan_code')
        .eq('id', accountId)
        .maybeSingle(),
      admin
        .from('account_channel_entitlements')
        .select('extra_channels')
        .eq('account_id', accountId)
        .maybeSingle(),
      admin
        .from('whatsapp_config')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId),
      admin
        .from('channel_connections')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .neq('status', 'disconnected'),
    ]);

  const firstError =
    accountResult.error ??
    entitlementResult.error ??
    whatsappResult.error ??
    socialResult.error;
  if (firstError) throw firstError;
  if (!accountResult.data) throw new Error('ACCOUNT_NOT_FOUND');

  const { data: plan, error: planError } = await admin
    .from('saas_plans')
    .select('max_channels')
    .eq('code', accountResult.data.plan_code)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan) throw new Error('ACCOUNT_PLAN_NOT_FOUND');

  const baseLimit =
    plan.max_channels === null ? null : asNumber(plan.max_channels);
  const extraChannels = asNumber(entitlementResult.data?.extra_channels);
  const totalLimit = baseLimit === null ? null : baseLimit + extraChannels;
  const usedChannels = (whatsappResult.count ?? 0) + (socialResult.count ?? 0);

  return {
    baseLimit,
    extraChannels,
    totalLimit,
    usedChannels,
    remainingChannels:
      totalLimit === null ? null : Math.max(totalLimit - usedChannels, 0),
  };
}
