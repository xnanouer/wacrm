import { supabaseAdmin } from '@/lib/flows/admin-client';
import { getAiUsageSummary } from '@/lib/ai/points/usage';
import { getAccountChannelCapacity } from '@/lib/channels/capacity';
import type {
  PlatformAccountDetail,
  PlatformAccountOverview,
  PlatformCatalogCapacity,
  SaasPlanSummary,
} from './types';

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapOverview(row: Record<string, unknown>): PlatformAccountOverview {
  return {
    id: String(row.account_id),
    name: String(row.account_name ?? 'Empresa sin nombre'),
    ownerName: nullableString(row.owner_name),
    ownerEmail: nullableString(row.owner_email),
    planCode: String(row.plan_code ?? 'trial'),
    planName: String(row.plan_name ?? row.plan_code ?? 'Sin plan'),
    subscriptionStatus:
      row.subscription_status as PlatformAccountOverview['subscriptionStatus'],
    trialEndsAt: nullableString(row.trial_ends_at),
    graceEndsAt: nullableString(row.grace_ends_at),
    currentPeriodEndsAt: nullableString(row.current_period_ends_at),
    suspendedAt: nullableString(row.suspended_at),
    suspensionReason: nullableString(row.suspension_reason),
    createdAt: String(row.account_created_at),
    users: asNumber(row.users_count),
    contacts: asNumber(row.contacts_count),
    conversations: asNumber(row.conversations_count),
    whatsappStatus: nullableString(row.whatsapp_status),
    whatsappProvider: nullableString(row.whatsapp_provider),
    socialChannels: asNumber(row.social_channels_count),
  };
}

export async function listPlatformAccounts(): Promise<
  PlatformAccountOverview[]
> {
  const { data, error } = await supabaseAdmin().rpc(
    'platform_account_overview'
  );
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapOverview);
}

export async function listSaasPlans(): Promise<SaasPlanSummary[]> {
  const { data, error } = await supabaseAdmin()
    .from('saas_plans')
    .select(
      'code, name, monthly_price, currency, max_users, max_channels, ai_monthly_points'
    )
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    code: row.code,
    name: row.name,
    monthlyPrice:
      row.monthly_price === null ? null : asNumber(row.monthly_price),
    currency: row.currency,
    maxUsers: row.max_users === null ? null : asNumber(row.max_users),
    maxChannels: row.max_channels === null ? null : asNumber(row.max_channels),
    aiMonthlyPoints: asNumber(row.ai_monthly_points),
  }));
}

export async function getPlatformCatalogCapacity(
  accountId: string
): Promise<PlatformCatalogCapacity> {
  const admin = supabaseAdmin();
  const [
    { data: account, error: accountError },
    entitlementResult,
    usageResult,
  ] = await Promise.all([
    admin
      .from('accounts')
      .select('plan_code')
      .eq('id', accountId)
      .maybeSingle(),
    admin
      .from('account_catalog_entitlements')
      .select('extra_blocks, block_units_snapshot')
      .eq('account_id', accountId)
      .maybeSingle(),
    admin
      .from('catalog_items')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .in('status', ['draft', 'pending_approval', 'available', 'reserved']),
  ]);

  const firstError =
    accountError ?? entitlementResult.error ?? usageResult.error;
  if (firstError) throw firstError;
  if (!account) throw new Error('PLATFORM_ACCOUNT_NOT_FOUND');

  const { data: plan, error: planError } = await admin
    .from('saas_plans')
    .select('max_active_catalog_items')
    .eq('code', account.plan_code ?? 'trial')
    .maybeSingle();
  if (planError) throw planError;

  const baseLimit = asNumber(plan?.max_active_catalog_items);
  const extraBlocks = asNumber(entitlementResult.data?.extra_blocks);
  const blockSize = Math.max(
    1,
    asNumber(entitlementResult.data?.block_units_snapshot) || 10
  );
  const extraUnits = extraBlocks * blockSize;
  const totalLimit = baseLimit + extraUnits;
  const usedUnits = usageResult.count ?? 0;

  return {
    baseLimit,
    extraBlocks,
    blockSize,
    extraUnits,
    totalLimit,
    usedUnits,
    remainingUnits: Math.max(totalLimit - usedUnits, 0),
  };
}

export async function getPlatformAccountDetail(
  accountId: string
): Promise<PlatformAccountDetail | null> {
  const admin = supabaseAdmin();
  const accounts = await listPlatformAccounts();
  const overview = accounts.find((account) => account.id === accountId);
  if (!overview) return null;

  const [
    membersResult,
    departmentsResult,
    socialResult,
    whatsappResult,
    auditResult,
    aiUsage,
    catalogCapacity,
    channelCapacity,
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('user_id, full_name, email, account_role, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true }),
    admin
      .from('departments')
      .select('id, name, is_active')
      .eq('account_id', accountId)
      .order('position', { ascending: true }),
    admin
      .from('channel_connections')
      .select('id, channel, display_name, status, connected_at, metadata')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true }),
    admin
      .from('whatsapp_config')
      .select(
        'id, provider, status, connected_at, connection_name, display_phone'
      )
      .eq('account_id', accountId)
      .is('removed_at', null)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
    admin
      .from('platform_audit_logs')
      .select('id, action, reason, actor_user_id, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(25),
    getAiUsageSummary(accountId),
    getPlatformCatalogCapacity(accountId),
    getAccountChannelCapacity(accountId),
  ]);

  const firstError = [
    membersResult.error,
    departmentsResult.error,
    socialResult.error,
    whatsappResult.error,
    auditResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const channels = (socialResult.data ?? [])
    .filter((channel) => {
      const metadata =
        channel.metadata && typeof channel.metadata === 'object'
          ? (channel.metadata as Record<string, unknown>)
          : {};
      return typeof metadata.removed_at !== 'string';
    })
    .map((channel) => ({
      id: channel.id,
      channel: channel.channel,
      displayName: channel.display_name,
      status: channel.status,
      connectedAt: channel.connected_at,
    }));
  for (const whatsapp of [...(whatsappResult.data ?? [])].reverse()) {
    channels.unshift({
      id: whatsapp.id,
      channel: 'whatsapp',
      displayName:
        whatsapp.connection_name ||
        whatsapp.display_phone ||
        (whatsapp.provider === 'whatsapp_web'
          ? 'WhatsApp QR'
          : 'WhatsApp Cloud API'),
      status: whatsapp.status,
      connectedAt: whatsapp.connected_at,
    });
  }

  return {
    overview,
    members: (membersResult.data ?? []).map((member) => ({
      userId: member.user_id,
      name: member.full_name,
      email: member.email,
      accountRole: member.account_role,
      createdAt: member.created_at,
    })),
    departments: (departmentsResult.data ?? []).map((department) => ({
      id: department.id,
      name: department.name,
      isActive: department.is_active,
    })),
    channels,
    audit: (auditResult.data ?? []).map((event) => ({
      id: event.id,
      action: event.action,
      reason: event.reason,
      actorUserId: event.actor_user_id,
      createdAt: event.created_at,
    })),
    aiUsage,
    catalogCapacity,
    channelCapacity,
  };
}
