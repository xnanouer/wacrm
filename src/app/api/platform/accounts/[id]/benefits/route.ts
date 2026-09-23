import { NextResponse } from 'next/server';

import { getAiUsageSummary } from '@/lib/ai/points/usage';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { getPlatformCatalogCapacity } from '@/lib/platform/accounts';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readReason(value: unknown) {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < 4 || reason.length > 500) return null;
  return reason;
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
        { error: 'Identificador de empresa inválido.' },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const reason = readReason(body?.reason);
    if (!body || !reason) {
      return NextResponse.json(
        { error: 'Escribe un motivo de al menos 4 caracteres.' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const { data: account, error: accountError } = await admin
      .from('accounts')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) {
      return NextResponse.json(
        { error: 'Empresa no encontrada.' },
        { status: 404 }
      );
    }

    if (body.action === 'grant_ai_points') {
      const points = Number(body.points);
      if (!Number.isSafeInteger(points) || points < 1 || points > 10_000_000) {
        return NextResponse.json(
          { error: 'La cantidad debe estar entre 1 y 10.000.000 puntos.' },
          { status: 400 }
        );
      }

      const grant = {
        account_id: id,
        source: 'manual',
        original_points: points,
        granted_by_user_id: actor.userId,
        reference: `platform-manual-${crypto.randomUUID()}`,
        metadata: { reason, granted_by: actor.email },
      };
      const { data: created, error: grantError } = await admin
        .from('ai_point_grants')
        .insert(grant)
        .select('id, original_points, created_at')
        .single();
      if (grantError) throw grantError;

      const { error: auditError } = await admin
        .from('platform_audit_logs')
        .insert({
          actor_user_id: actor.userId,
          account_id: id,
          action: 'account.ai_points_granted',
          previous_data: {},
          next_data: {
            grant_id: created.id,
            points: created.original_points,
          },
          reason,
        });
      if (auditError) {
        console.error('[platform/benefits] audit insert failed:', auditError);
      }

      const { data: recipients, error: recipientsError } = await admin
        .from('profiles')
        .select('user_id')
        .eq('account_id', id)
        .in('account_role', ['owner', 'admin']);
      if (recipientsError) {
        console.error(
          '[platform/benefits] notification recipients failed:',
          recipientsError
        );
      } else if (recipients?.length) {
        const formattedPoints = points.toLocaleString('es-CL');
        const { error: notificationError } = await admin
          .from('notifications')
          .insert(
            recipients.map((recipient) => ({
              account_id: id,
              user_id: recipient.user_id,
              type: 'nexora_points_gift',
              actor_user_id: actor.userId,
              title: 'Nexora agregó puntos a tu empresa',
              body: `Recibiste ${formattedPoints} Puntos Nexora adicionales. Motivo: ${reason}`,
            }))
          );
        if (notificationError) {
          console.error(
            '[platform/benefits] notification insert failed:',
            notificationError
          );
        }
      }

      return NextResponse.json({
        success: true,
        message: `${points.toLocaleString('es-CL')} Puntos Nexora agregados.`,
        aiUsage: await getAiUsageSummary(id),
      });
    }

    if (body.action === 'set_catalog_extra_units') {
      const extraUnits = Number(body.extra_units);
      if (
        !Number.isSafeInteger(extraUnits) ||
        extraUnits < 0 ||
        extraUnits > 1_000_000 ||
        extraUnits % 10 !== 0
      ) {
        return NextResponse.json(
          {
            error:
              'Los cupos adicionales deben ser un múltiplo de 10, entre 0 y 1.000.000.',
          },
          { status: 400 }
        );
      }

      const previous = await getPlatformCatalogCapacity(id);
      const next = {
        account_id: id,
        extra_blocks: extraUnits / 10,
        block_units_snapshot: 10,
        monthly_price_snapshot: 0,
        currency: 'CLP',
        valid_from: new Date().toISOString(),
        valid_until: null,
        source: 'manual',
        external_reference: null,
        updated_by_user_id: actor.userId,
      };
      const { error: entitlementError } = await admin
        .from('account_catalog_entitlements')
        .upsert(next, { onConflict: 'account_id' });
      if (
        entitlementError?.message.includes(
          'catalog_capacity_reduction_conflict'
        )
      ) {
        return NextResponse.json(
          {
            error:
              'No puedes reducir la capacidad por debajo de los vehículos que la empresa ya utiliza.',
          },
          { status: 409 }
        );
      }
      if (entitlementError) throw entitlementError;

      const capacity = await getPlatformCatalogCapacity(id);
      const { error: auditError } = await admin
        .from('platform_audit_logs')
        .insert({
          actor_user_id: actor.userId,
          account_id: id,
          action: 'account.catalog_capacity_adjusted',
          previous_data: previous,
          next_data: capacity,
          reason,
        });
      if (auditError) {
        console.error('[platform/benefits] audit insert failed:', auditError);
      }

      return NextResponse.json({
        success: true,
        message: `La empresa ahora tiene ${capacity.totalLimit.toLocaleString('es-CL')} cupos de catálogo.`,
        catalogCapacity: capacity,
      });
    }

    return NextResponse.json(
      { error: 'Tipo de ajuste no reconocido.' },
      { status: 400 }
    );
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
