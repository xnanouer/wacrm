import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  isSubscriptionStatus,
  type SubscriptionStatus,
} from '@/lib/billing/access';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import {
  loadMercadoPagoSettings,
  mercadoPagoRequest,
} from '@/lib/billing/mercado-pago';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import {
  accountStorageTargets,
  isAccountDeletionConfirmation,
  removeAccountStorage,
} from '@/lib/platform/account-deletion';
import {
  callWhatsAppWebService,
  type WhatsAppWebSessionStatus,
} from '@/lib/whatsapp/web-service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface UpdateBody {
  status?: unknown;
  planCode?: unknown;
  reason?: unknown;
}

interface DeleteBody {
  confirmation?: unknown;
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
    const actor = await requirePlatformRole('platform_owner');
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: 'El identificador de la empresa no es válido.' },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as DeleteBody | null;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason.length > 500) {
      return NextResponse.json(
        { error: 'El motivo no puede superar los 500 caracteres.' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const { data: account, error: accountError } = await admin
      .from('accounts')
      .select(
        'id, name, owner_user_id, plan_code, subscription_status, billing_provider, billing_customer_id, billing_subscription_id, created_at'
      )
      .eq('id', id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) {
      return NextResponse.json(
        { error: 'La empresa ya no existe.' },
        { status: 404 }
      );
    }
    if (!isAccountDeletionConfirmation(account.name, body?.confirmation)) {
      return NextResponse.json(
        {
          error: 'Escribe exactamente el nombre de la empresa para confirmar.',
          code: 'confirmation_mismatch',
        },
        { status: 400 }
      );
    }

    const { data: members, error: membersError } = await admin
      .from('profiles')
      .select('user_id, email, full_name, account_role')
      .eq('account_id', id);
    if (membersError) throw membersError;
    const memberUserIds = [
      ...new Set([
        account.owner_user_id,
        ...(members ?? []).map((member) => member.user_id),
      ]),
    ];
    if (
      account.owner_user_id === actor.userId ||
      memberUserIds.includes(actor.userId)
    ) {
      return NextResponse.json(
        {
          error:
            'No puedes eliminar la empresa a la que pertenece tu cuenta de plataforma. Transfiérela o usa otro propietario primero.',
          code: 'own_platform_account',
        },
        { status: 409 }
      );
    }

    let protectedUserIds = new Set<string>();
    if (memberUserIds.length > 0) {
      const [platformAdminsResult, otherOwnedAccountsResult] =
        await Promise.all([
          admin
            .from('platform_admins')
            .select('user_id')
            .in('user_id', memberUserIds),
          admin
            .from('accounts')
            .select('owner_user_id')
            .in('owner_user_id', memberUserIds)
            .neq('id', id),
        ]);
      if (platformAdminsResult.error || otherOwnedAccountsResult.error) {
        throw platformAdminsResult.error ?? otherOwnedAccountsResult.error;
      }
      protectedUserIds = new Set([
        ...(platformAdminsResult.data ?? []).map((row) => row.user_id),
        ...(otherOwnedAccountsResult.data ?? []).map(
          (row) => row.owner_user_id
        ),
      ]);
    }
    const removableUserIds = memberUserIds.filter(
      (userId) => !protectedUserIds.has(userId)
    );

    if (account.billing_subscription_id) {
      if (account.billing_provider !== 'mercadopago') {
        return NextResponse.json(
          {
            error:
              'La empresa tiene una suscripción externa que debe cancelarse antes de eliminarla.',
            code: 'active_external_subscription',
          },
          { status: 409 }
        );
      }
      try {
        const mercadoPago = await loadMercadoPagoSettings();
        const subscriptionPath = `/preapproval/${encodeURIComponent(
          account.billing_subscription_id
        )}`;
        const subscription = await mercadoPagoRequest<{ status?: string }>(
          mercadoPago.accessToken,
          subscriptionPath
        );
        if (!['cancelled', 'canceled'].includes(subscription.status ?? '')) {
          await mercadoPagoRequest(mercadoPago.accessToken, subscriptionPath, {
            method: 'PUT',
            body: JSON.stringify({ status: 'cancelled' }),
          });
        }
      } catch (error) {
        console.error('[platform] subscription cancellation failed:', error);
        return NextResponse.json(
          {
            error:
              'No se pudo confirmar la cancelación de Mercado Pago. La empresa no fue eliminada para evitar cobros posteriores.',
            code: 'subscription_cancellation_failed',
          },
          { status: 502 }
        );
      }
    }

    const { data: whatsappConnections, error: whatsappError } = await admin
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', id)
      .eq('provider', 'whatsapp_web')
      .is('removed_at', null);
    if (whatsappError) throw whatsappError;

    const cleanupWarnings: string[] = [];
    const logoutResults = await Promise.allSettled(
      (whatsappConnections ?? []).map((connection) =>
        callWhatsAppWebService<WhatsAppWebSessionStatus>(
          id,
          connection.id,
          '/logout',
          { method: 'POST', body: '{}' }
        )
      )
    );
    for (const result of logoutResults) {
      if (result.status === 'rejected') {
        cleanupWarnings.push(
          `WhatsApp QR: ${
            result.reason instanceof Error
              ? result.reason.message
              : 'no se pudo cerrar la sesión'
          }`
        );
      }
    }

    const { data: deleted, error: deleteError } = await admin
      .from('accounts')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (deleteError) throw deleteError;
    if (!deleted) {
      return NextResponse.json(
        { error: 'La empresa ya no existe.' },
        { status: 404 }
      );
    }

    const storageCleanup = await removeAccountStorage(
      admin,
      accountStorageTargets(id, removableUserIds)
    );
    cleanupWarnings.push(...storageCleanup.warnings);

    let deletedUsers = 0;
    for (const userId of removableUserIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        cleanupWarnings.push(`Usuario ${userId}: ${error.message}`);
      } else {
        deletedUsers += 1;
      }
    }

    const { error: auditError } = await admin
      .from('platform_audit_logs')
      .insert({
        actor_user_id: actor.userId,
        account_id: null,
        action: 'account.deleted',
        previous_data: {
          ...account,
          members: members ?? [],
        },
        next_data: {
          deleted_account_id: id,
          deleted_account_name: account.name,
          deleted_at: new Date().toISOString(),
          deleted_users: deletedUsers,
          removed_storage_objects: storageCleanup.removedObjects,
          cleanup_warnings: cleanupWarnings,
        },
        reason: reason || 'Eliminación permanente confirmada desde Plataforma',
      });
    if (auditError) {
      console.error('[platform] deleted account audit failed:', auditError);
      cleanupWarnings.push('No se pudo guardar el registro de auditoría.');
    }

    return NextResponse.json({
      success: true,
      deletedAccount: { id, name: account.name },
      cleanup: {
        deletedUsers,
        removedStorageObjects: storageCleanup.removedObjects,
        warnings: cleanupWarnings,
      },
    });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
