import { NextResponse } from 'next/server';

import {
  ForbiddenError,
  getCurrentAccount,
  toErrorResponse,
} from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import {
  FOLLOW_UP_AGENT_ADDON,
  getCommercialPlan,
  getPointPackage,
} from '@/lib/billing/plans';
import {
  MercadoPagoError,
  loadMercadoPagoSettings,
  mercadoPagoRequest,
} from '@/lib/billing/mercado-pago';
import { supabaseAdmin } from '@/lib/flows/admin-client';

interface SubscriptionResponse {
  id: string;
  init_point: string;
}

interface PreferenceResponse {
  id: string;
  init_point: string;
  sandbox_init_point?: string | null;
}

function appOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // A malformed optional value must not break local test checkout.
    }
  }
  return new URL(request.url).origin;
}

function notificationUrl(origin: string) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.hostname === 'localhost') {
    return null;
  }
  return `${origin}/api/billing/mercadopago/webhook`;
}

export async function POST(request: Request) {
  let actorUserId: string | null = null;
  try {
    const context = await getCurrentAccount({ allowInactive: true });
    actorUserId = context.userId;
    if (!hasMinRole(context.role, 'admin')) {
      throw new ForbiddenError('Solo un administrador puede contratar planes.');
    }

    const body = (await request.json().catch(() => null)) as {
      kind?: unknown;
      planCode?: unknown;
      pointPackageId?: unknown;
      addonCode?: unknown;
    } | null;
    if (
      !body ||
      !['subscription', 'points', 'addon'].includes(String(body.kind))
    ) {
      return NextResponse.json(
        { error: 'Selecciona un producto válido.' },
        { status: 400 }
      );
    }

    const runtime = await loadMercadoPagoSettings({ requireEnabled: true });
    const {
      data: { user },
    } = await context.supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json(
        { error: 'Tu cuenta necesita un correo electrónico válido.' },
        { status: 400 }
      );
    }

    const origin = appOrigin(request);
    const webhook = notificationUrl(origin);
    const admin = supabaseAdmin();

    if (body.kind === 'addon') {
      if (body.addonCode !== FOLLOW_UP_AGENT_ADDON.code) {
        return NextResponse.json(
          { error: 'Complemento inválido.' },
          { status: 400 }
        );
      }
      if (
        !['active', 'trialing', 'past_due'].includes(
          context.account.subscription_status
        )
      ) {
        return NextResponse.json(
          { error: 'Activa primero un plan de Nexora.' },
          { status: 409 }
        );
      }

      const { data: existingAddon, error: addonError } = await admin
        .from('account_addons')
        .select('status, provider_subscription_id')
        .eq('account_id', context.accountId)
        .eq('addon_code', FOLLOW_UP_AGENT_ADDON.code)
        .maybeSingle();
      if (addonError) throw addonError;
      if (existingAddon?.status === 'active') {
        return NextResponse.json(
          {
            error: 'El Agente de Seguimiento Pro ya está activo.',
          },
          { status: 409 }
        );
      }

      const { data: pendingIntent, error: pendingError } = await admin
        .from('billing_checkout_intents')
        .select('redirect_url')
        .eq('account_id', context.accountId)
        .eq('kind', 'addon')
        .eq('addon_code', FOLLOW_UP_AGENT_ADDON.code)
        .eq('status', 'redirected')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingError) throw pendingError;
      if (
        pendingIntent?.redirect_url &&
        existingAddon &&
        ['pending', 'past_due', 'suspended'].includes(existingAddon.status)
      ) {
        return NextResponse.json({
          checkoutUrl: pendingIntent.redirect_url,
          testMode: runtime.environment === 'test',
          webhookAvailable: Boolean(webhook),
          reused: true,
        });
      }
      if (
        existingAddon &&
        ['pending', 'past_due', 'suspended'].includes(existingAddon.status)
      ) {
        return NextResponse.json(
          {
            error:
              'Este complemento tiene un pago pendiente. Cancélalo antes de iniciar una contratación nueva.',
          },
          { status: 409 }
        );
      }

      const { data: intent, error: intentError } = await admin
        .from('billing_checkout_intents')
        .insert({
          account_id: context.accountId,
          requested_by_user_id: context.userId,
          kind: 'addon',
          addon_code: FOLLOW_UP_AGENT_ADDON.code,
          amount: FOLLOW_UP_AGENT_ADDON.monthlyPrice,
          currency: 'CLP',
          metadata: {
            addon_name: FOLLOW_UP_AGENT_ADDON.name,
            included_points: FOLLOW_UP_AGENT_ADDON.includedPoints,
          },
        })
        .select('id')
        .single();
      if (intentError) throw intentError;

      const subscription = await mercadoPagoRequest<SubscriptionResponse>(
        runtime.accessToken,
        '/preapproval',
        {
          method: 'POST',
          body: JSON.stringify({
            reason: `Nexora · ${FOLLOW_UP_AGENT_ADDON.name}`,
            external_reference: intent.id,
            payer_email: user.email,
            auto_recurring: {
              frequency: 1,
              frequency_type: 'months',
              transaction_amount: FOLLOW_UP_AGENT_ADDON.monthlyPrice,
              currency_id: 'CLP',
            },
            back_url: `${origin}/api/billing/mercadopago/return`,
            ...(webhook ? { notification_url: webhook } : {}),
            status: 'pending',
          }),
        }
      );

      const { error: updateError } = await admin
        .from('billing_checkout_intents')
        .update({
          provider_reference: subscription.id,
          redirect_url: subscription.init_point,
          status: 'redirected',
        })
        .eq('id', intent.id);
      if (updateError) throw updateError;

      const { error: addonUpsertError } = await admin
        .from('account_addons')
        .upsert(
          {
            account_id: context.accountId,
            addon_code: FOLLOW_UP_AGENT_ADDON.code,
            status: 'pending',
            monthly_price_snapshot: FOLLOW_UP_AGENT_ADDON.monthlyPrice,
            included_points: FOLLOW_UP_AGENT_ADDON.includedPoints,
            provider: 'mercadopago',
            provider_subscription_id: subscription.id,
            current_period_ends_at: null,
            activated_at: null,
            canceled_at: null,
          },
          { onConflict: 'account_id,addon_code' }
        );
      if (addonUpsertError) throw addonUpsertError;

      return NextResponse.json({
        checkoutUrl: subscription.init_point,
        testMode: runtime.environment === 'test',
        webhookAvailable: Boolean(webhook),
      });
    }

    if (body.kind === 'subscription') {
      const plan = getCommercialPlan(String(body.planCode ?? ''));
      if (!plan) {
        return NextResponse.json({ error: 'Plan inválido.' }, { status: 400 });
      }

      const { data: billingAccount, error: accountError } = await admin
        .from('accounts')
        .select('billing_provider, billing_subscription_id')
        .eq('id', context.accountId)
        .single();
      if (accountError) throw accountError;
      if (billingAccount.billing_subscription_id) {
        return NextResponse.json(
          {
            error:
              'Tu empresa ya tiene una suscripción vinculada. Evitamos crear otra para no duplicar cobros.',
          },
          { status: 409 }
        );
      }

      const { data: pendingIntent, error: pendingError } = await admin
        .from('billing_checkout_intents')
        .select('redirect_url')
        .eq('account_id', context.accountId)
        .eq('kind', 'subscription')
        .eq('plan_code', plan.code)
        .eq('status', 'redirected')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingError) throw pendingError;
      if (pendingIntent?.redirect_url) {
        return NextResponse.json({
          checkoutUrl: pendingIntent.redirect_url,
          testMode: runtime.environment === 'test',
          webhookAvailable: Boolean(webhook),
          reused: true,
        });
      }

      const trialEnd = context.account.trial_ends_at
        ? Date.parse(context.account.trial_ends_at)
        : Number.NaN;
      const remainingTrialDays =
        context.account.subscription_status === 'trialing' &&
        Number.isFinite(trialEnd) &&
        trialEnd > Date.now()
          ? Math.max(1, Math.ceil((trialEnd - Date.now()) / 86_400_000))
          : 0;

      const { data: intent, error: intentError } = await admin
        .from('billing_checkout_intents')
        .insert({
          account_id: context.accountId,
          requested_by_user_id: context.userId,
          kind: 'subscription',
          plan_code: plan.code,
          amount: plan.price,
          currency: 'CLP',
          metadata: {
            plan_name: plan.name,
            included_users: plan.includedUsers,
            included_connections: plan.includedConnections,
            included_catalog_items: plan.includedCatalogItems,
            remaining_trial_days: remainingTrialDays,
          },
        })
        .select('id')
        .single();
      if (intentError) throw intentError;

      const subscription = await mercadoPagoRequest<SubscriptionResponse>(
        runtime.accessToken,
        '/preapproval',
        {
          method: 'POST',
          body: JSON.stringify({
            reason: `Nexora ${plan.name}`,
            external_reference: intent.id,
            payer_email: user.email,
            auto_recurring: {
              frequency: 1,
              frequency_type: 'months',
              transaction_amount: plan.price,
              currency_id: 'CLP',
              ...(remainingTrialDays > 0
                ? {
                    free_trial: {
                      frequency: remainingTrialDays,
                      frequency_type: 'days',
                    },
                  }
                : {}),
            },
            back_url: `${origin}/api/billing/mercadopago/return`,
            ...(webhook ? { notification_url: webhook } : {}),
            status: 'pending',
          }),
        }
      );

      const { error: updateError } = await admin
        .from('billing_checkout_intents')
        .update({
          provider_reference: subscription.id,
          redirect_url: subscription.init_point,
          status: 'redirected',
        })
        .eq('id', intent.id);
      if (updateError) throw updateError;

      return NextResponse.json({
        checkoutUrl: subscription.init_point,
        testMode: runtime.environment === 'test',
        webhookAvailable: Boolean(webhook),
      });
    }

    const pointPackage = getPointPackage(String(body.pointPackageId ?? ''));
    if (!pointPackage) {
      return NextResponse.json(
        { error: 'Paquete de puntos inválido.' },
        { status: 400 }
      );
    }
    const { data: intent, error: intentError } = await admin
      .from('billing_checkout_intents')
      .insert({
        account_id: context.accountId,
        requested_by_user_id: context.userId,
        kind: 'points',
        point_package_id: pointPackage.id,
        amount: pointPackage.price,
        currency: 'CLP',
        metadata: {
          points: pointPackage.points,
          package_label: pointPackage.label,
        },
      })
      .select('id')
      .single();
    if (intentError) throw intentError;

    const returnUrl = `${origin}/api/billing/mercadopago/return`;
    const preference = await mercadoPagoRequest<PreferenceResponse>(
      runtime.accessToken,
      '/checkout/preferences',
      {
        method: 'POST',
        body: JSON.stringify({
          items: [
            {
              id: pointPackage.id,
              title: `${pointPackage.points.toLocaleString('es-CL')} Puntos Nexora`,
              description: pointPackage.description,
              quantity: 1,
              currency_id: 'CLP',
              unit_price: pointPackage.price,
            },
          ],
          payer: { email: user.email },
          external_reference: intent.id,
          back_urls: {
            success: returnUrl,
            pending: returnUrl,
            failure: returnUrl,
          },
          auto_return: 'approved',
          ...(webhook ? { notification_url: webhook } : {}),
        }),
      }
    );
    const checkoutUrl =
      runtime.environment === 'test' && preference.sandbox_init_point
        ? preference.sandbox_init_point
        : preference.init_point;
    const { error: updateError } = await admin
      .from('billing_checkout_intents')
      .update({
        provider_reference: preference.id,
        redirect_url: checkoutUrl,
        status: 'redirected',
      })
      .eq('id', intent.id);
    if (updateError) throw updateError;

    return NextResponse.json({
      checkoutUrl,
      testMode: runtime.environment === 'test',
      webhookAvailable: Boolean(webhook),
    });
  } catch (error) {
    if (error instanceof MercadoPagoError) {
      let setupUrl: string | undefined;
      if (error.status === 503 && actorUserId) {
        const { data: platformActor } = await supabaseAdmin()
          .from('platform_admins')
          .select('role')
          .eq('user_id', actorUserId)
          .maybeSingle();
        if (platformActor?.role === 'platform_owner') {
          setupUrl = '/platform/payments';
        }
      }
      return NextResponse.json(
        {
          error: setupUrl
            ? 'Primero configura Mercado Pago para habilitar las compras.'
            : error.status === 503
              ? 'La contratación en línea no está disponible temporalmente.'
              : error.message,
          ...(setupUrl ? { setupUrl } : {}),
        },
        { status: error.status }
      );
    }
    return toErrorResponse(error);
  }
}
