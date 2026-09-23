import 'server-only';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import type { AssignableAccountRole } from '@/lib/auth/roles';

export interface AccountSeatUsage {
  planCode: string;
  planName: string;
  currentUsers: number;
  maxUsers: number | null;
  remainingUsers: number | null;
}

export interface CreateAccountMemberInput {
  accountId: string;
  planCode: string;
  fullName: string;
  email: string;
  password: string;
  role: AssignableAccountRole;
  departmentIds: string[];
}

export class MemberProvisionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 500,
    readonly code: string
  ) {
    super(message);
    this.name = 'MemberProvisionError';
  }
}

export async function getAccountSeatUsage(
  accountId: string,
  planCode: string
): Promise<AccountSeatUsage> {
  const admin = supabaseAdmin();
  const [{ data: plan, error: planError }, { count, error: countError }] =
    await Promise.all([
      admin
        .from('saas_plans')
        .select('code, name, max_users')
        .eq('code', planCode)
        .eq('is_active', true)
        .maybeSingle(),
      admin
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('account_id', accountId),
    ]);

  if (planError || countError || !plan) {
    console.error(
      '[members] seat usage lookup failed',
      planError ?? countError
    );
    throw new MemberProvisionError(
      'No se pudo comprobar el límite del plan',
      500,
      'seat_usage_unavailable'
    );
  }

  const currentUsers = count ?? 0;
  const maxUsers = plan.max_users as number | null;
  return {
    planCode: plan.code,
    planName: plan.name,
    currentUsers,
    maxUsers,
    remainingUsers:
      maxUsers === null ? null : Math.max(0, maxUsers - currentUsers),
  };
}

async function cleanUpProvisionedIdentity(
  userId: string,
  targetAccountId: string
) {
  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (profile?.account_id && profile.account_id !== targetAccountId) {
    // The normal signup trigger created this empty personal account. Delete it
    // before deleting auth.users because accounts.owner_user_id is RESTRICT.
    await admin
      .from('accounts')
      .delete()
      .eq('id', profile.account_id)
      .eq('owner_user_id', userId);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error('[members] failed to clean up provisioned auth user', error);
  }
}

export async function createAccountMember(input: CreateAccountMemberInput) {
  const seats = await getAccountSeatUsage(input.accountId, input.planCode);
  if (seats.maxUsers !== null && seats.currentUsers >= seats.maxUsers) {
    throw new MemberProvisionError(
      `El plan ${seats.planName} permite un máximo de ${seats.maxUsers} usuarios`,
      409,
      'plan_user_limit_reached'
    );
  }

  const admin = supabaseAdmin();
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });

  if (createError || !created.user) {
    const duplicate =
      createError?.code === 'email_exists' ||
      createError?.message.toLowerCase().includes('already') === true ||
      createError?.message.toLowerCase().includes('registered') === true;
    throw new MemberProvisionError(
      duplicate
        ? 'Ya existe un usuario registrado con ese correo electrónico'
        : 'No se pudo crear el acceso del usuario',
      duplicate ? 409 : 500,
      duplicate ? 'email_already_exists' : 'auth_user_create_failed'
    );
  }

  const userId = created.user.id;
  const { data: provisioned, error: provisionError } = await admin.rpc(
    'provision_account_member',
    {
      p_user_id: userId,
      p_target_account_id: input.accountId,
      p_role: input.role,
      p_department_ids: input.departmentIds,
    }
  );

  if (provisionError) {
    await cleanUpProvisionedIdentity(userId, input.accountId);

    const limitReached = provisionError.message.includes(
      'PLAN_USER_LIMIT_REACHED'
    );
    console.error('[members] account provisioning failed', {
      code: provisionError.code,
      message: provisionError.message,
    });
    throw new MemberProvisionError(
      limitReached
        ? `El plan ${seats.planName} ya alcanzó su límite de usuarios`
        : 'No se pudo vincular el usuario con la empresa',
      limitReached ? 409 : 500,
      limitReached ? 'plan_user_limit_reached' : 'member_provision_failed'
    );
  }

  return {
    member: {
      user_id: userId,
      full_name: input.fullName,
      email: input.email,
      avatar_url: null,
      role: input.role,
      joined_at: created.user.created_at,
    },
    seats: provisioned,
  };
}
