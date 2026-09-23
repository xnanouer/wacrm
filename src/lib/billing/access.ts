import type { AccountRole } from '@/lib/auth/roles';

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'suspended',
  'canceled',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface AccountSubscription {
  id: string;
  name: string;
  plan_code: string;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  current_period_ends_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
}

export interface BillingAccountContext {
  userId: string;
  accountId: string;
  role: AccountRole;
  account: AccountSubscription;
}

export function isSubscriptionStatus(
  value: unknown
): value is SubscriptionStatus {
  return (
    typeof value === 'string' &&
    (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
  );
}

function isFuture(value: string | null | undefined, now: Date): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

/**
 * Mirrors public.account_has_operational_access(). Keeping this small and
 * deterministic makes it useful in route guards and straightforward to test.
 * Missing pre-migration fields fail open only for the legacy status itself;
 * once a status is present, expiration rules fail closed.
 */
export function hasOperationalAccess(
  account: Partial<AccountSubscription>,
  now = new Date()
): boolean {
  const status = account.subscription_status;
  if (!status) return true;
  if (status === 'active') return true;
  if (status === 'trialing') {
    return !account.trial_ends_at || isFuture(account.trial_ends_at, now);
  }
  if (status === 'past_due') {
    return isFuture(account.grace_ends_at, now);
  }
  return false;
}

export function subscriptionStatusLabel(status: SubscriptionStatus): string {
  const labels: Record<SubscriptionStatus, string> = {
    trialing: 'En prueba',
    active: 'Activa',
    past_due: 'Pago pendiente',
    suspended: 'Suspendida',
    canceled: 'Cancelada',
  };
  return labels[status];
}
