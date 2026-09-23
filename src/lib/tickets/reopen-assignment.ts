import type { SupabaseClient } from '@supabase/supabase-js';

import { isAccountRole } from '@/lib/auth/roles';

interface ReopenAssignmentInput {
  accountId: string;
  assignedAgentId: string | null;
  departmentId: string | null;
}

export interface ReopenedTicketState {
  status: 'open' | 'pending';
  assigned_agent_id: string | null;
}

/**
 * A returning customer goes straight back to the previous agent whenever
 * that user still belongs to the company and can operate the ticket.
 * Otherwise the ticket safely falls back to the unassigned queue.
 */
export async function resolveReturningAgent(
  db: SupabaseClient,
  input: ReopenAssignmentInput
): Promise<string | null> {
  const { accountId, assignedAgentId, departmentId } = input;
  if (!assignedAgentId) return null;

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('account_role')
    .eq('account_id', accountId)
    .eq('user_id', assignedAgentId)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    !isAccountRole(profile.account_role) ||
    profile.account_role === 'viewer'
  ) {
    return null;
  }

  // Owners/admins and agents can see an assigned ticket directly under the
  // current RLS rules. Supervisors must still supervise its department.
  if (profile.account_role !== 'supervisor') return assignedAgentId;
  if (!departmentId) return null;

  const { data: membership, error: membershipError } = await db
    .from('department_members')
    .select('id')
    .eq('account_id', accountId)
    .eq('department_id', departmentId)
    .eq('user_id', assignedAgentId)
    .eq('member_role', 'supervisor')
    .eq('is_active', true)
    .maybeSingle();

  return membershipError || !membership ? null : assignedAgentId;
}

export function reopenedTicketState(
  returningAgentId: string | null
): ReopenedTicketState {
  return returningAgentId
    ? { status: 'open', assigned_agent_id: returningAgentId }
    : { status: 'pending', assigned_agent_id: null };
}
