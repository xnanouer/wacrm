import type { SupabaseClient } from '@supabase/supabase-js';
import { hasOperationalAccess } from './access';

/** Use with service-role workers, which bypass tenant RLS by design. */
export async function serviceAccountHasOperationalAccess(
  client: SupabaseClient,
  accountId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('accounts')
    .select('subscription_status, trial_ends_at, grace_ends_at')
    .eq('id', accountId)
    .maybeSingle();
  if (error) {
    console.error('[billing] account access lookup failed:', error);
    return false;
  }
  return !!data && hasOperationalAccess(data);
}
