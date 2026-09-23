import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  isSubscriptionStatus,
  type SubscriptionStatus,
} from '@/lib/billing/access';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface UpdateBody {
  status?: unknown;
  planCode?: unknown;
  reason?: unknown;
}

function defaultLifecycleDates(status: SubscriptionStatus) {
  const now = new Date();
  if (status === 'trialing') {
    return {
      trial_ends_at: new Date(
        now.getTime() + TRIAL_DAYS * 86_400_000
      ).toISOString(),
      grace_ends_at: null,
    };
  }
  if (status === 'past_due') {
    return {
      trial_ends_at: null,
      grace_ends_at: new Date(now.getTime() + 5 * 86_400_000).toISOString(),
    };
  }
  return { trial_ends_at: null, grace_ends_at: null };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePlatformRole('platform_admin');
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: 'Invalid account id' },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as UpdateBody | null;
    if (!body || !isSubscriptionStatus(body.status)) {
      return NextResponse.json(
        { error: 'Invalid subscription status' },
        { status: 400 }
      );
    }
    if (
      typeof body.planCode !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]{1,39}$/.test(body.planCode)
    ) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (
      (body.status === 'suspended' || body.status === 'canceled') &&
      reason.length < 3
    ) {
      return NextResponse.json(
        { error: 'A suspension or cancellation reason is required' },
        { status: 400 }
      );
    }
    if (reason.length > 500) {
      return NextResponse.json(
        { error: 'Reason is too long' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const [
      { data: existing, error: existingError },
      { data: plan, error: planError },
      { count: currentUsers, error: memberCountError },
    ] = await Promise.all([
      admin
        .from('accounts')
        .select(
          'id, plan_code, subscription_status, trial_ends_at, grace_ends_at, suspended_at, suspension_reason'
        )
        .eq('id', id)
        .maybeSingle(),
      admin
        .from('saas_plans')
        .select('code, max_users')
        .eq('code', body.planCode)
        .eq('is_active', true)
        .maybeSingle(),
      admin
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('account_id', id),
    ]);

    if (existingError || planError || memberCountError) {
      throw existingError ?? planError ?? memberCountError;
    }
    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 400 });
    }
    if (plan.max_users !== null && (currentUsers ?? 0) > plan.max_users) {
      return NextResponse.json(
        {
          error: `La empresa tiene ${currentUsers ?? 0} usuarios. El plan seleccionado admite un máximo de ${plan.max_users}.`,
          code: 'plan_user_limit_exceeded',
        },
        { status: 409 }
      );
    }

    const lifecycle = defaultLifecycleDates(body.status);
    const isBlocked = body.status === 'suspended' || body.status === 'canceled';
    const next = {
      plan_code: body.planCode,
      subscription_status: body.status,
      trial_ends_at: lifecycle.trial_ends_at,
      grace_ends_at: lifecycle.grace_ends_at,
      suspended_at: isBlocked ? new Date().toISOString() : null,
      suspension_reason: isBlocked ? reason : null,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin
      .from('accounts')
      .update(next)
      .eq('id', id);
    if (updateError?.message.includes('PLAN_USER_LIMIT_EXCEEDED')) {
      return NextResponse.json(
        {
          error:
            'El plan seleccionado tiene menos cupos que los usuarios actuales de la empresa.',
          code: 'plan_user_limit_exceeded',
        },
        { status: 409 }
      );
    }
    if (updateError) throw updateError;

    const action =
      body.status === 'suspended'
        ? 'account.suspended'
        : body.status === 'active'
          ? 'account.activated'
          : body.status === 'canceled'
            ? 'account.canceled'
            : 'account.subscription_updated';
    const { error: auditError } = await admin
      .from('platform_audit_logs')
      .insert({
        actor_user_id: actor.userId,
        account_id: id,
        action,
        previous_data: existing,
        next_data: next,
        reason: reason || null,
      });
    if (auditError) {
      console.error(
        '[platform] account updated but audit insert failed:',
        auditError
      );
    }

    return NextResponse.json({ success: true, account: next });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
