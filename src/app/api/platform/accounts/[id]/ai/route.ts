import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    const body = await request.json().catch(() => null);
    if (!body || typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Solicitud inválida.' },
        { status: 400 }
      );
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length > 500) {
      return NextResponse.json(
        { error: 'El motivo es demasiado largo.' },
        { status: 400 }
      );
    }

    let monthlyPointsOverride: number | null = null;
    if (
      body.monthly_points_override !== null &&
      body.monthly_points_override !== undefined &&
      body.monthly_points_override !== ''
    ) {
      monthlyPointsOverride = Number(body.monthly_points_override);
      if (
        !Number.isSafeInteger(monthlyPointsOverride) ||
        monthlyPointsOverride < 0 ||
        monthlyPointsOverride > 10_000_000
      ) {
        return NextResponse.json(
          { error: 'La asignación mensual es inválida.' },
          { status: 400 }
        );
      }
    }

    const admin = supabaseAdmin();
    const [
      { data: account, error: accountError },
      { data: existing, error: entitlementError },
      { data: platformSettings, error: settingsError },
    ] = await Promise.all([
      admin.from('accounts').select('id').eq('id', id).maybeSingle(),
      admin
        .from('account_ai_entitlements')
        .select('platform_enabled, disabled_reason, monthly_points_override')
        .eq('account_id', id)
        .maybeSingle(),
      admin
        .from('platform_ai_settings')
        .select('global_enabled, text_provider, text_model, encrypted_api_key')
        .eq('id', 1)
        .maybeSingle(),
    ]);
    if (accountError || entitlementError || settingsError) {
      throw accountError ?? entitlementError ?? settingsError;
    }
    if (!account) {
      return NextResponse.json(
        { error: 'Empresa no encontrada.' },
        { status: 404 }
      );
    }

    const globalReady = Boolean(
      platformSettings?.global_enabled &&
      platformSettings.text_provider &&
      platformSettings.text_model &&
      platformSettings.encrypted_api_key
    );
    if (body.enabled && !globalReady) {
      return NextResponse.json(
        {
          error: 'Configura y activa primero la IA global de Nexora.',
          code: 'ai_platform_disabled',
        },
        { status: 409 }
      );
    }

    const next = {
      account_id: id,
      platform_enabled: body.enabled,
      disabled_reason: body.enabled ? null : reason || 'Desactivada por Nexora',
      monthly_points_override: monthlyPointsOverride,
      updated_by_user_id: actor.userId,
    };
    const { error: updateError } = await admin
      .from('account_ai_entitlements')
      .upsert(next, { onConflict: 'account_id' });
    if (updateError) throw updateError;

    const { error: auditError } = await admin
      .from('platform_audit_logs')
      .insert({
        actor_user_id: actor.userId,
        account_id: id,
        action: body.enabled ? 'account.ai_enabled' : 'account.ai_disabled',
        previous_data: existing ?? {},
        next_data: next,
        reason: reason || null,
      });
    if (auditError) {
      console.error('[platform/account-ai] audit insert failed:', auditError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
