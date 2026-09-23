import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import {
  MercadoPagoError,
  validateMercadoPagoAccessToken,
} from '@/lib/billing/mercado-pago';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';

function safeSettings(row: Record<string, unknown> | null) {
  return {
    provider: 'mercadopago' as const,
    environment: row?.environment === 'production' ? 'production' : 'test',
    enabled: row?.enabled === true,
    hasAccessToken: Boolean(row?.encrypted_access_token),
    accessTokenLastFour:
      typeof row?.access_token_last_four === 'string'
        ? row.access_token_last_four
        : null,
    hasWebhookSecret: Boolean(row?.encrypted_webhook_secret),
    webhookSecretLastFour:
      typeof row?.webhook_secret_last_four === 'string'
        ? row.webhook_secret_last_four
        : null,
  };
}

const SELECT =
  'environment, enabled, encrypted_access_token, access_token_last_four, encrypted_webhook_secret, webhook_secret_last_four';

export async function GET() {
  try {
    await requirePlatformRole('platform_owner');
    const { data, error } = await supabaseAdmin()
      .from('platform_payment_settings')
      .select(SELECT)
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ settings: safeSettings(data) });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return NextResponse.json(
        { error: 'Solicitud inválida.' },
        { status: 400 }
      );
    }

    const environment =
      body.environment === 'production' ? 'production' : 'test';
    const enabled = body.enabled === true;
    const rawAccessToken =
      typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    const rawWebhookSecret =
      typeof body.webhookSecret === 'string' ? body.webhookSecret.trim() : '';
    if (rawAccessToken.length > 1000 || rawWebhookSecret.length > 1000) {
      return NextResponse.json(
        { error: 'Las credenciales exceden el largo permitido.' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const { data: existing, error: existingError } = await admin
      .from('platform_payment_settings')
      .select(SELECT)
      .eq('id', 1)
      .maybeSingle();
    if (existingError) throw existingError;

    let accessToken = rawAccessToken;
    let webhookSecret = rawWebhookSecret;
    if (!accessToken && existing?.encrypted_access_token) {
      accessToken = decrypt(existing.encrypted_access_token);
    }
    if (!webhookSecret && existing?.encrypted_webhook_secret) {
      webhookSecret = decrypt(existing.encrypted_webhook_secret);
    }
    if (!accessToken || !webhookSecret) {
      return NextResponse.json(
        { error: 'Ingresa el Access Token y la firma secreta del webhook.' },
        { status: 400 }
      );
    }
    if (accessToken.length < 20 || webhookSecret.length < 16) {
      return NextResponse.json(
        {
          error:
            'Las credenciales parecen incompletas. Copia los valores completos desde Mercado Pago.',
        },
        { status: 400 }
      );
    }
    if (!/^(TEST-|APP_USR-)/.test(accessToken)) {
      return NextResponse.json(
        { error: 'El valor no parece ser un Access Token de Mercado Pago.' },
        { status: 400 }
      );
    }
    if (environment === 'production' && accessToken.startsWith('TEST-')) {
      return NextResponse.json(
        { error: 'No puedes activar producción con credenciales de prueba.' },
        { status: 400 }
      );
    }

    if (rawAccessToken) {
      try {
        await validateMercadoPagoAccessToken(accessToken);
      } catch (error) {
        if (error instanceof MercadoPagoError) {
          return NextResponse.json(
            { error: 'Mercado Pago rechazó el Access Token.' },
            { status: 400 }
          );
        }
        throw error;
      }
    }

    const next = {
      environment,
      enabled,
      updated_by_user_id: actor.userId,
      ...(rawAccessToken
        ? {
            encrypted_access_token: encrypt(accessToken),
            access_token_last_four: accessToken.slice(-4),
          }
        : {}),
      ...(rawWebhookSecret
        ? {
            encrypted_webhook_secret: encrypt(webhookSecret),
            webhook_secret_last_four: webhookSecret.slice(-4),
          }
        : {}),
    };
    const { data, error } = await admin
      .from('platform_payment_settings')
      .update(next)
      .eq('id', 1)
      .select(SELECT)
      .single();
    if (error) throw error;

    await admin.from('platform_audit_logs').insert({
      actor_user_id: actor.userId,
      account_id: null,
      action: 'platform.payment_configuration_updated',
      previous_data: safeSettings(existing),
      next_data: safeSettings(data),
      reason: enabled
        ? `Mercado Pago ${environment} habilitado`
        : 'Cobros globales desactivados',
    });

    return NextResponse.json({ success: true, settings: safeSettings(data) });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
